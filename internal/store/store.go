// Package store aggregates the readings agents push, keeping the most recent per
// (region, platform), and builds the per-platform incentives the UI reads.
package store

import (
	"log/slog"
	"sync"
	"time"

	"github.com/buco7854/bloodpoint-incentives/internal/cache"
	"github.com/buco7854/bloodpoint-incentives/internal/db"
	"github.com/buco7854/bloodpoint-incentives/internal/domain"
	"github.com/buco7854/bloodpoint-incentives/internal/registry"
)

// Meta holds the static snapshot fields configured at boot.
type Meta struct {
	ContactEmail      *string
	PageSize          int
	StaleAfterSeconds int
	ContributeEnabled bool
	AgentSetupURL     string
	DiscordURL        *string
	MatrixURL         *string
}

type storedReading struct {
	survivor   int
	killer     int
	ratio      float64
	measuredAt string
	version    *string
	category   *string
}

// ChangeListener is notified with the platform whose snapshot just changed.
type ChangeListener func(platform domain.Platform)

// Store aggregates readings and serves snapshots. The live values live in a
// cache.Cache (in-memory by default, Redis-swappable).
type Store struct {
	registry func() *registry.Registry
	meta     Meta
	readings *db.ReadingsRepo
	log      *slog.Logger

	live    cache.Cache[storedReading]
	refresh cache.Cache[int]

	ingestMu    sync.Mutex // serializes the read-compare-write in Ingest
	listenersMu sync.Mutex
	listeners   map[int]ChangeListener
	nextID      int
}

// New creates a store backed by the given cache (nil = in-memory).
func New(reg func() *registry.Registry, meta Meta, readings *db.ReadingsRepo, log *slog.Logger, live cache.Cache[storedReading]) *Store {
	if live == nil {
		live = cache.NewMemory[storedReading]()
	}
	return &Store{
		registry:  reg,
		meta:      meta,
		readings:  readings,
		log:       log,
		live:      live,
		refresh:   cache.NewMemory[int](),
		listeners: map[int]ChangeListener{},
	}
}

func keyOf(platform domain.Platform, region string) string {
	return string(platform) + " " + region
}

// OnChange subscribes to snapshot changes; returns an unsubscribe func.
func (s *Store) OnChange(fn ChangeListener) func() {
	s.listenersMu.Lock()
	defer s.listenersMu.Unlock()
	id := s.nextID
	s.nextID++
	s.listeners[id] = fn
	return func() {
		s.listenersMu.Lock()
		defer s.listenersMu.Unlock()
		delete(s.listeners, id)
	}
}

func (s *Store) emitChange(platform domain.Platform) {
	s.listenersMu.Lock()
	fns := make([]ChangeListener, 0, len(s.listeners))
	for _, fn := range s.listeners {
		fns = append(fns, fn)
	}
	s.listenersMu.Unlock()
	for _, fn := range fns {
		fn(platform)
	}
}

// Hydrate repopulates the live snapshot from the DB's latest reading per group.
func (s *Store) Hydrate() error {
	if s.readings == nil {
		return nil
	}
	latest, err := s.readings.LatestPerGroup()
	if err != nil {
		return err
	}
	for _, r := range latest {
		key := keyOf(r.Platform, r.Region)
		if r.RefreshTimeSeconds != nil && *r.RefreshTimeSeconds > 0 {
			s.refresh.Set(key, *r.RefreshTimeSeconds, 0)
		}
		s.live.Set(key, storedReading{
			survivor: r.Survivor, killer: r.Killer, ratio: r.Ratio,
			measuredAt: r.MeasuredAt, version: r.Version, category: r.Category,
		}, 0)
	}
	return nil
}

// Ingest records a real reading, keeping it only if newer than the stored one.
func (s *Store) Ingest(report domain.AgentReport, agentID *int64) bool {
	key := keyOf(report.Platform, report.Region)
	s.ingestMu.Lock()
	if report.RefreshTimeSeconds != nil && *report.RefreshTimeSeconds > 0 {
		s.refresh.Set(key, *report.RefreshTimeSeconds, 0)
	}
	if existing, ok := s.live.Get(key); ok {
		newMs, _ := domain.ParseISOMs(report.MeasuredAt)
		oldMs, _ := domain.ParseISOMs(existing.measuredAt)
		if newMs <= oldMs {
			s.ingestMu.Unlock()
			return false
		}
	}
	s.live.Set(key, storedReading{
		survivor: report.Survivor, killer: report.Killer, ratio: report.Ratio,
		measuredAt: report.MeasuredAt, version: report.Version, category: report.Category,
	}, 0)
	s.ingestMu.Unlock()

	if s.readings != nil {
		if err := s.readings.Record(report, agentID); err != nil {
			s.log.Warn("failed to persist reading", "err", err, "region", report.Region, "platform", report.Platform)
		}
	}
	s.emitChange(report.Platform)
	return true
}

// RefreshTimeFor returns the latest refreshTime seen for a region+platform, or nil.
func (s *Store) RefreshTimeFor(region string, platform domain.Platform) *float64 {
	if v, ok := s.refresh.Get(keyOf(platform, region)); ok {
		f := float64(v)
		return &f
	}
	return nil
}

// RegionsReporting returns the number of (platform, region) groups with a reading.
func (s *Store) RegionsReporting() int {
	n := 0
	for _, m := range domain.Platforms {
		for _, region := range domain.AllRegionIDs() {
			if _, ok := s.live.Get(keyOf(m.Platform, region)); ok {
				n++
			}
		}
	}
	return n
}

// Evict drops the live entry for a region+platform and notifies listeners.
func (s *Store) Evict(platform domain.Platform, region string) {
	s.live.Delete(keyOf(platform, region))
	s.emitChange(platform)
}

// Incentives builds the current per-region incentives for a platform.
func (s *Store) Incentives(platform domain.Platform, now time.Time) domain.IncentivesPayload {
	reg := s.registry()
	regionIDs := reg.RegionsFor(platform)
	staleMs := int64(s.meta.StaleAfterSeconds) * 1000
	nowMs := now.UnixMilli()

	var newest *storedReading
	var newestMs int64
	anyFresh, anyReal := false, false
	regions := make([]domain.RegionIncentive, 0, len(regionIDs))

	for _, region := range regionIDs {
		meta, _ := domain.RegionMetaFor(region)
		reading, ok := s.live.Get(keyOf(platform, region))
		if !ok {
			regions = append(regions, domain.RegionIncentive{
				Region: region, DisplayName: orRegion(meta.DisplayName, region), Flag: meta.Flag,
				Survivor: 0, Killer: 0, Ratio: 0, IsReal: false, Stale: true, LastUpdated: nil,
			})
			continue
		}
		anyReal = true
		ms, _ := domain.ParseISOMs(reading.measuredAt)
		stale := nowMs-ms > staleMs
		if !stale {
			anyFresh = true
		}
		if newest == nil || ms > newestMs {
			r := reading
			newest = &r
			newestMs = ms
		}
		measuredAt := reading.measuredAt
		regions = append(regions, domain.RegionIncentive{
			Region: region, DisplayName: orRegion(meta.DisplayName, region), Flag: meta.Flag,
			Survivor: reading.survivor, Killer: reading.killer, Ratio: reading.ratio,
			IsReal: true, Stale: stale, LastUpdated: &measuredAt,
		})
	}

	status, reason := deriveStatus(len(regionIDs), anyReal, anyFresh)

	var updatedAt, version, category *string
	if newest != nil {
		v := newest.measuredAt
		updatedAt = &v
		version = newest.version
		category = newest.category
	}

	return domain.IncentivesPayload{
		UpdatedAt:    updatedAt,
		GeneratedAt:  domain.ISOFromMs(nowMs),
		Platform:     platform,
		Version:      version,
		Category:     category,
		Status:       status,
		StatusReason: reason,
		Regions:      regions,
	}
}

// Coverage reports how many agents cover each known region on a platform.
func (s *Store) Coverage(platform domain.Platform) domain.CoveragePayload {
	reg := s.registry()
	entries := make([]domain.CoverageEntry, 0, len(domain.Regions))
	for _, region := range domain.AllRegionIDs() {
		meta, _ := domain.RegionMetaFor(region)
		entries = append(entries, domain.CoverageEntry{
			Region: region, DisplayName: orRegion(meta.DisplayName, region), Flag: meta.Flag,
			Agents: len(reg.AgentsInGroup(region, platform)),
		})
	}
	return domain.CoveragePayload{Platform: platform, Regions: entries}
}

// SiteMeta returns the hub-wide UI/config bootstrap (independent of platform).
func (s *Store) SiteMeta() domain.SiteMeta {
	return domain.SiteMeta{
		Platforms:         s.registry().Platforms(),
		ContactEmail:      s.meta.ContactEmail,
		DiscordURL:        s.meta.DiscordURL,
		MatrixURL:         s.meta.MatrixURL,
		AgentSetupURL:     s.meta.AgentSetupURL,
		ContributeEnabled: s.meta.ContributeEnabled,
		PageSize:          s.meta.PageSize,
	}
}

func deriveStatus(regionCount int, anyReal, anyFresh bool) (domain.DataStatus, *string) {
	if regionCount == 0 {
		r := "no agents are configured for this platform"
		return domain.StatusError, &r
	}
	if anyFresh {
		return domain.StatusOK, nil
	}
	if anyReal {
		r := "agents have not reported fresh data recently"
		return domain.StatusDegraded, &r
	}
	return domain.StatusInitializing, nil
}

func orRegion(displayName, region string) string {
	if displayName == "" {
		return region
	}
	return displayName
}
