package db

import (
	"database/sql"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/buco7854/bloodpoint-incentives/internal/domain"
	"github.com/buco7854/bloodpoint-incentives/internal/forecast"
)

const (
	minuteMs = int64(60 * 1000)
	hourMs   = 60 * minuteMs
	dayMs    = 24 * hourMs
)

// maxPoints is the raw-vs-bucketed threshold for a history range.
const maxPoints = 1500

// bucketLadder lists nice bucket widths (ms), smallest first.
var bucketLadder = []int64{
	1 * minuteMs, 5 * minuteMs, 15 * minuteMs, 30 * minuteMs,
	1 * hourMs, 3 * hourMs, 6 * hourMs, 12 * hourMs, 1 * dayMs, 7 * dayMs,
}

const widestBucketMs = 7 * dayMs

// LatestReading is the most recent reading for one (platform, region).
type LatestReading struct {
	Platform           domain.Platform
	Region             string
	Survivor           int
	Killer             int
	Ratio              float64
	Version            *string
	Category           *string
	RefreshTimeSeconds *int
	MeasuredAt         string
}

// AgentAttribution is one agent's contribution to a region+platform.
type AgentAttribution struct {
	AgentID  *int64 `json:"agentId"`
	Readings int    `json:"readings"`
	FirstAt  int64  `json:"firstAt"`
	LastAt   int64  `json:"lastAt"`
}

// ReadingFilter is the whitelisted filter for ClearAgentData (all fields optional).
type ReadingFilter struct {
	Region                   string
	Platform                 string
	RatioMin, RatioMax       *float64
	SurvivorMin, SurvivorMax *int
	KillerMin, KillerMax     *int
	Before, After            *int64
}

// ReadingsRepo stores every accepted reading and serves history/forecast queries.
type ReadingsRepo struct {
	db *sql.DB
}

// NewReadingsRepo returns the readings repository (schema is created by migrate).
func NewReadingsRepo(conn *sql.DB) (*ReadingsRepo, error) {
	return &ReadingsRepo{db: conn}, nil
}

// Record inserts one accepted reading. agentID is nil for unattributed rows.
func (r *ReadingsRepo) Record(rep domain.AgentReport, agentID *int64) error {
	ms, ok := domain.ParseISOMs(rep.MeasuredAt)
	if !ok {
		return fmt.Errorf("invalid measuredAt %q", rep.MeasuredAt)
	}
	_, err := r.db.Exec(
		`INSERT INTO readings
		   (platform, region, survivor, killer, ratio, version, category, refresh_time_seconds, measured_at, agent_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		string(rep.Platform), rep.Region, rep.Survivor, rep.Killer, rep.Ratio,
		rep.Version, rep.Category, rep.RefreshTimeSeconds, ms, agentID,
	)
	return err
}

// LatestPerGroup returns the most recent reading per (platform, region) for boot rehydrate.
func (r *ReadingsRepo) LatestPerGroup() ([]LatestReading, error) {
	rows, err := r.db.Query(
		`SELECT platform, region, survivor, killer, ratio, version, category,
		        refresh_time_seconds, MAX(measured_at) AS measured_at
		   FROM readings GROUP BY platform, region`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LatestReading
	for rows.Next() {
		var (
			lr      LatestReading
			plat    string
			ms      int64
			refresh sql.NullInt64
		)
		if err := rows.Scan(&plat, &lr.Region, &lr.Survivor, &lr.Killer, &lr.Ratio,
			&lr.Version, &lr.Category, &refresh, &ms); err != nil {
			return nil, err
		}
		lr.Platform = domain.Platform(plat)
		if refresh.Valid {
			v := int(refresh.Int64)
			lr.RefreshTimeSeconds = &v
		}
		lr.MeasuredAt = domain.ISOFromMs(ms)
		out = append(out, lr)
	}
	return out, rows.Err()
}

// RangeResult is the adaptive-resolution series for a history window.
type RangeResult struct {
	Resolution domain.HistoryResolution
	BucketMs   int64
	Points     []domain.HistoryPoint
}

// RangeSeries returns survivor/killer points over [from,to]: raw below maxPoints, else last-value buckets.
func (r *ReadingsRepo) RangeSeries(platform domain.Platform, region string, from, to int64) (RangeResult, error) {
	var count int
	if err := r.db.QueryRow(
		`SELECT COUNT(*) FROM readings WHERE platform = ? AND region = ? AND measured_at BETWEEN ? AND ?`,
		string(platform), region, from, to).Scan(&count); err != nil {
		return RangeResult{}, err
	}
	if count <= maxPoints {
		pts, err := r.scanPoints(
			`SELECT measured_at, survivor, killer FROM readings
			  WHERE platform = ? AND region = ? AND measured_at BETWEEN ? AND ?
			  ORDER BY measured_at ASC`, string(platform), region, from, to)
		return RangeResult{Resolution: domain.ResolutionRaw, BucketMs: 0, Points: pts}, err
	}
	span := to - from
	if span < 1 {
		span = 1
	}
	bucketMs := widestBucketMs
	for _, b := range bucketLadder {
		if span/b <= maxPoints {
			bucketMs = b
			break
		}
	}
	pts, err := r.scanPoints(
		`SELECT (measured_at - (measured_at % ?)) AS t, survivor, killer, MAX(measured_at)
		   FROM readings
		  WHERE platform = ? AND region = ? AND measured_at BETWEEN ? AND ?
		  GROUP BY t ORDER BY t ASC`, bucketMs, string(platform), region, from, to)
	return RangeResult{Resolution: domain.ResolutionBucketed, BucketMs: bucketMs, Points: pts}, err
}

// scanPoints reads (t, survivor, killer, [extra...]) rows into history points.
func (r *ReadingsRepo) scanPoints(query string, args ...any) ([]domain.HistoryPoint, error) {
	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	out := []domain.HistoryPoint{}
	for rows.Next() {
		var p domain.HistoryPoint
		if len(cols) == 4 { // bucketed query has a trailing MAX(measured_at)
			var ignore int64
			if err := rows.Scan(&p.T, &p.Survivor, &p.Killer, &ignore); err != nil {
				return nil, err
			}
		} else if err := rows.Scan(&p.T, &p.Survivor, &p.Killer); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// Extent returns the earliest/latest reading times for a region+platform, or nil if none.
func (r *ReadingsRepo) Extent(platform domain.Platform, region string) (*[2]int64, error) {
	var first, last sql.NullInt64
	if err := r.db.QueryRow(
		`SELECT MIN(measured_at), MAX(measured_at) FROM readings WHERE platform = ? AND region = ?`,
		string(platform), region).Scan(&first, &last); err != nil {
		return nil, err
	}
	if !first.Valid || !last.Valid {
		return nil, nil
	}
	return &[2]int64{first.Int64, last.Int64}, nil
}

// Recent returns the most recent raw readings for a region+platform, newest first.
func (r *ReadingsRepo) Recent(platform domain.Platform, region string, limit int) ([]domain.ReadingEntry, error) {
	return r.scanEntries(
		`SELECT measured_at, survivor, killer, ratio FROM readings
		  WHERE platform = ? AND region = ? ORDER BY measured_at DESC LIMIT ?`,
		string(platform), region, limit)
}

// Changes returns readings where survivor or killer changed from the prior one, newest first.
func (r *ReadingsRepo) Changes(platform domain.Platform, region string, limit int) ([]domain.ReadingEntry, error) {
	return r.scanEntries(
		`SELECT t, survivor, killer, ratio FROM (
		   SELECT measured_at AS t, survivor, killer, ratio,
		          LAG(survivor) OVER w AS ps, LAG(killer) OVER w AS pk
		     FROM readings WHERE platform = ? AND region = ?
		     WINDOW w AS (ORDER BY measured_at)
		 ) WHERE ps IS NULL OR survivor != ps OR killer != pk
		 ORDER BY t DESC LIMIT ?`, string(platform), region, limit)
}

func (r *ReadingsRepo) scanEntries(query string, args ...any) ([]domain.ReadingEntry, error) {
	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.ReadingEntry{}
	for rows.Next() {
		var e domain.ReadingEntry
		if err := rows.Scan(&e.T, &e.Survivor, &e.Killer, &e.Ratio); err != nil {
			return nil, err
		}
		e.Ratio = math.Round(e.Ratio*100) / 100
		out = append(out, e)
	}
	return out, rows.Err()
}

// ReadingsSince returns raw readings since a timestamp, oldest first (for the forecast model).
func (r *ReadingsRepo) ReadingsSince(platform domain.Platform, region string, since int64) ([]forecast.RawReading, error) {
	rows, err := r.db.Query(
		`SELECT measured_at, survivor, killer FROM readings
		  WHERE platform = ? AND region = ? AND measured_at >= ? ORDER BY measured_at ASC`,
		string(platform), region, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []forecast.RawReading{}
	for rows.Next() {
		var rr forecast.RawReading
		if err := rows.Scan(&rr.T, &rr.Survivor, &rr.Killer); err != nil {
			return nil, err
		}
		out = append(out, rr)
	}
	return out, rows.Err()
}

// Prune deletes readings older than the retention window; returns rows removed.
func (r *ReadingsRepo) Prune(retentionMs int64, now time.Time) (int64, error) {
	res, err := r.db.Exec(`DELETE FROM readings WHERE measured_at < ?`, now.UnixMilli()-retentionMs)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// PruneByAgent deletes every reading attributed to one agent; returns rows removed.
func (r *ReadingsRepo) PruneByAgent(agentID int64) (int64, error) {
	res, err := r.db.Exec(`DELETE FROM readings WHERE agent_id = ?`, agentID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// OrphanAgentReadings detaches all of an agent's readings (agent_id NULL); returns rows updated.
func (r *ReadingsRepo) OrphanAgentReadings(agentID int64) (int64, error) {
	res, err := r.db.Exec(`UPDATE readings SET agent_id = NULL WHERE agent_id = ?`, agentID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// DeleteOrphans deletes every orphaned reading (agent_id IS NULL); returns rows removed.
func (r *ReadingsRepo) DeleteOrphans() (int64, error) {
	res, err := r.db.Exec(`DELETE FROM readings WHERE agent_id IS NULL`)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// Attribution returns per-agent contribution to one region+platform.
func (r *ReadingsRepo) Attribution(platform domain.Platform, region string) ([]AgentAttribution, error) {
	rows, err := r.db.Query(
		`SELECT agent_id, COUNT(*), MIN(measured_at), MAX(measured_at)
		   FROM readings WHERE platform = ? AND region = ?
		  GROUP BY agent_id ORDER BY COUNT(*) DESC`, string(platform), region)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AgentAttribution{}
	for rows.Next() {
		var (
			a  AgentAttribution
			id sql.NullInt64
		)
		if err := rows.Scan(&id, &a.Readings, &a.FirstAt, &a.LastAt); err != nil {
			return nil, err
		}
		if id.Valid {
			a.AgentID = &id.Int64
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// ClearAgentData deletes a whitelisted subset of one agent's readings; returns rows removed.
func (r *ReadingsRepo) ClearAgentData(agentID int64, f ReadingFilter) (int64, error) {
	where := []string{"agent_id = ?"}
	args := []any{agentID}
	add := func(cond string, v any) {
		where = append(where, cond)
		args = append(args, v)
	}
	if f.Region != "" {
		add("region = ?", f.Region)
	}
	if f.Platform != "" {
		add("platform = ?", f.Platform)
	}
	if f.RatioMin != nil {
		add("ratio >= ?", *f.RatioMin)
	}
	if f.RatioMax != nil {
		add("ratio <= ?", *f.RatioMax)
	}
	if f.SurvivorMin != nil {
		add("survivor >= ?", *f.SurvivorMin)
	}
	if f.SurvivorMax != nil {
		add("survivor <= ?", *f.SurvivorMax)
	}
	if f.KillerMin != nil {
		add("killer >= ?", *f.KillerMin)
	}
	if f.KillerMax != nil {
		add("killer <= ?", *f.KillerMax)
	}
	if f.Before != nil {
		add("measured_at < ?", *f.Before)
	}
	if f.After != nil {
		add("measured_at >= ?", *f.After)
	}
	res, err := r.db.Exec(`DELETE FROM readings WHERE `+strings.Join(where, " AND "), args...)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// AgentStat is one agent's reading count and most-recent timestamp.
type AgentStat struct {
	Count  int
	LastAt int64
}

// ReadingStatsByAgent returns per-agent reading count + last timestamp for the admin list.
func (r *ReadingsRepo) ReadingStatsByAgent() (map[int64]AgentStat, error) {
	rows, err := r.db.Query(
		`SELECT agent_id, COUNT(*), MAX(measured_at) FROM readings
		  WHERE agent_id IS NOT NULL GROUP BY agent_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]AgentStat{}
	for rows.Next() {
		var (
			id int64
			st AgentStat
		)
		if err := rows.Scan(&id, &st.Count, &st.LastAt); err != nil {
			return nil, err
		}
		out[id] = st
	}
	return out, rows.Err()
}
