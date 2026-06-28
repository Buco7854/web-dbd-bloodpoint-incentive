// Package registry holds the in-memory, rebuildable view of enabled agents that
// the hot paths (agent auth, redundancy groups, coverage) read from.
package registry

import (
	"sort"
	"sync/atomic"

	"github.com/buco7854/bloodpoint-incentives/internal/db"
	"github.com/buco7854/bloodpoint-incentives/internal/domain"
)

// Slot is an agent's place in the registry: what it covers and its position among peers.
type Slot struct {
	AgentID  int64
	Region   string
	Platform domain.Platform
	Index    int
	Count    int
}

// CadenceOverride is a per-agent cadence override; nil fields fall back to global.
type CadenceOverride struct {
	Min *string
	Max *string
}

// Registry is an immutable view of the enabled agents, built from DB rows.
type Registry struct {
	byTokenHash map[string]Slot
	groups      map[string][]int64
	cadence     map[int64]CadenceOverride
	agents      []db.AgentRow
}

func groupKey(platform domain.Platform, region string) string {
	return string(platform) + " " + region
}

// New builds a registry from agent rows (insertion order = id order).
func New(agents []db.AgentRow) *Registry {
	r := &Registry{
		byTokenHash: make(map[string]Slot),
		groups:      make(map[string][]int64),
		cadence:     make(map[int64]CadenceOverride),
		agents:      agents,
	}
	grouped := map[string][]db.AgentRow{}
	var order []string
	for _, a := range agents {
		k := groupKey(a.Platform, a.Region)
		if _, ok := grouped[k]; !ok {
			order = append(order, k)
		}
		grouped[k] = append(grouped[k], a)
	}
	for _, k := range order {
		group := grouped[k]
		ids := make([]int64, len(group))
		for i, a := range group {
			ids[i] = a.ID
			r.byTokenHash[a.TokenHash] = Slot{
				AgentID: a.ID, Region: a.Region, Platform: a.Platform,
				Index: i, Count: len(group),
			}
			if a.PollMin != nil || a.PollMax != nil {
				r.cadence[a.ID] = CadenceOverride{Min: a.PollMin, Max: a.PollMax}
			}
		}
		r.groups[k] = ids
	}
	return r
}

// LookupByTokenHash resolves a bearer token's hash to its slot (ok=false if unknown/disabled).
func (r *Registry) LookupByTokenHash(h string) (Slot, bool) {
	s, ok := r.byTokenHash[h]
	return s, ok
}

// AgentsInGroup returns the ordered agent ids covering a region+platform.
func (r *Registry) AgentsInGroup(region string, platform domain.Platform) []int64 {
	return r.groups[groupKey(platform, region)]
}

// CadenceFor returns the per-agent cadence override, if any.
func (r *Registry) CadenceFor(agentID int64) (CadenceOverride, bool) {
	o, ok := r.cadence[agentID]
	return o, ok
}

// Platforms returns the distinct platforms covered, in canonical order.
func (r *Registry) Platforms() []domain.Platform {
	seen := map[domain.Platform]bool{}
	for _, a := range r.agents {
		seen[a.Platform] = true
	}
	out := []domain.Platform{}
	for _, m := range domain.Platforms {
		if seen[m.Platform] {
			out = append(out, m.Platform)
		}
	}
	return out
}

// RegionsFor returns the distinct regions covered for a platform, in canonical order.
func (r *Registry) RegionsFor(platform domain.Platform) []string {
	seen := map[string]bool{}
	for _, a := range r.agents {
		if a.Platform == platform {
			seen[a.Region] = true
		}
	}
	out := make([]string, 0, len(seen))
	for region := range seen {
		out = append(out, region)
	}
	sort.Slice(out, func(i, j int) bool {
		return domain.RegionOrder(out[i]) < domain.RegionOrder(out[j])
	})
	return out
}

// Size is the number of enabled agents.
func (r *Registry) Size() int { return len(r.agents) }

// Provider holds the current registry and rebuilds it on roster changes.
type Provider struct {
	load    func() ([]db.AgentRow, error)
	current atomic.Pointer[Registry]
}

// NewProvider builds the initial registry from load() and returns the provider.
func NewProvider(load func() ([]db.AgentRow, error)) (*Provider, error) {
	p := &Provider{load: load}
	if err := p.Reload(); err != nil {
		return nil, err
	}
	return p, nil
}

// Current returns the live registry snapshot.
func (p *Provider) Current() *Registry { return p.current.Load() }

// Reload rebuilds the registry from the loader and swaps it atomically.
func (p *Provider) Reload() error {
	rows, err := p.load()
	if err != nil {
		return err
	}
	p.current.Store(New(rows))
	return nil
}
