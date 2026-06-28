package db

import (
	"database/sql"
	"time"

	"github.com/buco7854/bloodpoint-incentives/internal/domain"
)

// AgentSource is how an agent came to exist.
type AgentSource string

const (
	SourceProvisioned AgentSource = "provisioned"
	SourceManual      AgentSource = "manual"
)

// AgentRow is one managed agent as stored. The raw token is never stored.
type AgentRow struct {
	ID          int64
	ProvisionID *string
	TokenHash   string
	Region      string
	Provider    string
	Platform    domain.Platform
	Label       *string
	Enabled     bool
	Source      AgentSource
	PollMin     *string
	PollMax     *string
	CreatedAt   int64
	UpdatedAt   int64
}

// NewAgent carries the fields needed to create an agent.
type NewAgent struct {
	TokenHash   string
	Region      string
	Provider    string
	Platform    domain.Platform
	Label       *string
	Source      AgentSource
	ProvisionID *string
	PollMin     *string
	PollMax     *string
	Enabled     *bool
}

// ProvisionedAgent is a boot-manifest declaration, upserted by ProvisionID.
type ProvisionedAgent struct {
	ProvisionID string
	TokenHash   string
	Region      string
	Provider    string
	Platform    domain.Platform
	Label       *string
}

// AgentsRepo stores managed agents.
type AgentsRepo struct {
	db  *sql.DB
	now func() int64
}

// NewAgentsRepo returns the agents repository (schema is created by migrate).
func NewAgentsRepo(conn *sql.DB) (*AgentsRepo, error) {
	return &AgentsRepo{db: conn, now: func() int64 { return time.Now().UnixMilli() }}, nil
}

const agentCols = `id, provision_id, token_hash, region, provider, platform, label, enabled, source, poll_min, poll_max, created_at, updated_at`

func scanAgent(s interface{ Scan(...any) error }) (AgentRow, error) {
	var (
		a       AgentRow
		plat    string
		src     string
		enabled int
	)
	err := s.Scan(&a.ID, &a.ProvisionID, &a.TokenHash, &a.Region, &a.Provider, &plat,
		&a.Label, &enabled, &src, &a.PollMin, &a.PollMax, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return AgentRow{}, err
	}
	a.Platform = domain.Platform(plat)
	a.Source = AgentSource(src)
	a.Enabled = enabled == 1
	return a, nil
}

// Create inserts a new agent and returns the stored row.
func (r *AgentsRepo) Create(a NewAgent) (AgentRow, error) {
	ts := r.now()
	enabled := 1
	if a.Enabled != nil && !*a.Enabled {
		enabled = 0
	}
	res, err := r.db.Exec(
		`INSERT INTO agents (provision_id, token_hash, region, provider, platform, label, enabled, source, poll_min, poll_max, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		a.ProvisionID, a.TokenHash, a.Region, a.Provider, string(a.Platform), a.Label, enabled, string(a.Source), a.PollMin, a.PollMax, ts, ts)
	if err != nil {
		return AgentRow{}, err
	}
	id, _ := res.LastInsertId()
	row, _, err := r.GetByID(id)
	return row, err
}

func (r *AgentsRepo) get(query string, arg any) (AgentRow, bool, error) {
	row, err := scanAgent(r.db.QueryRow(`SELECT `+agentCols+` FROM agents WHERE `+query, arg))
	if err == sql.ErrNoRows {
		return AgentRow{}, false, nil
	}
	if err != nil {
		return AgentRow{}, false, err
	}
	return row, true, nil
}

func (r *AgentsRepo) GetByID(id int64) (AgentRow, bool, error) {
	return r.get("id = ?", id)
}

func (r *AgentsRepo) FindByTokenHash(h string) (AgentRow, bool, error) {
	return r.get("token_hash = ?", h)
}

func (r *AgentsRepo) FindByProvisionID(p string) (AgentRow, bool, error) {
	return r.get("provision_id = ?", p)
}

func (r *AgentsRepo) list(query string) ([]AgentRow, error) {
	rows, err := r.db.Query(`SELECT ` + agentCols + ` FROM agents ` + query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AgentRow{}
	for rows.Next() {
		a, err := scanAgent(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *AgentsRepo) ListEnabled() ([]AgentRow, error) {
	return r.list("WHERE enabled = 1 ORDER BY id ASC")
}

func (r *AgentsRepo) ListAll() ([]AgentRow, error) {
	return r.list("ORDER BY id ASC")
}

func (r *AgentsRepo) Count() (int, error) {
	var n int
	err := r.db.QueryRow(`SELECT COUNT(*) FROM agents`).Scan(&n)
	return n, err
}

func (r *AgentsRepo) SetEnabled(id int64, enabled bool) error {
	e := 0
	if enabled {
		e = 1
	}
	_, err := r.db.Exec(`UPDATE agents SET enabled = ?, updated_at = ? WHERE id = ?`, e, r.now(), id)
	return err
}

func (r *AgentsRepo) SetTokenHash(id int64, h string) error {
	_, err := r.db.Exec(`UPDATE agents SET token_hash = ?, updated_at = ? WHERE id = ?`, h, r.now(), id)
	return err
}

func (r *AgentsRepo) SetRegion(id int64, region string) error {
	_, err := r.db.Exec(`UPDATE agents SET region = ?, updated_at = ? WHERE id = ?`, region, r.now(), id)
	return err
}

// AgentPatch carries mutable display/cadence/provider fields (nil = leave unchanged).
type AgentPatch struct {
	Label    *string
	PollMin  *string
	PollMax  *string
	Provider *string
	Platform *domain.Platform
	// Set* flags distinguish "set to NULL" from "leave unchanged" for nullable fields.
	SetLabel   bool
	SetPollMin bool
	SetPollMax bool
}

// Update applies a patch to mutable fields.
func (r *AgentsRepo) Update(id int64, p AgentPatch) error {
	cur, ok, err := r.GetByID(id)
	if err != nil || !ok {
		return err
	}
	label, pollMin, pollMax := cur.Label, cur.PollMin, cur.PollMax
	provider, platform := cur.Provider, cur.Platform
	if p.SetLabel {
		label = p.Label
	}
	if p.SetPollMin {
		pollMin = p.PollMin
	}
	if p.SetPollMax {
		pollMax = p.PollMax
	}
	if p.Provider != nil {
		provider = *p.Provider
	}
	if p.Platform != nil {
		platform = *p.Platform
	}
	_, err = r.db.Exec(
		`UPDATE agents SET label = ?, poll_min = ?, poll_max = ?, provider = ?, platform = ?, updated_at = ? WHERE id = ?`,
		label, pollMin, pollMax, provider, string(platform), r.now(), id)
	return err
}

func (r *AgentsRepo) Delete(id int64) error {
	_, err := r.db.Exec(`DELETE FROM agents WHERE id = ?`, id)
	return err
}

// UpsertByTokenHash inserts or updates an agent matched by token hash (admin import).
func (r *AgentsRepo) UpsertByTokenHash(a NewAgent) (AgentRow, error) {
	existing, ok, err := r.FindByTokenHash(a.TokenHash)
	if err != nil {
		return AgentRow{}, err
	}
	if ok {
		enabled := existing.Enabled
		if a.Enabled != nil {
			enabled = *a.Enabled
		}
		e := 0
		if enabled {
			e = 1
		}
		_, err := r.db.Exec(
			`UPDATE agents SET region = ?, provider = ?, platform = ?, label = ?, source = ?, provision_id = ?, poll_min = ?, poll_max = ?, enabled = ?, updated_at = ? WHERE id = ?`,
			a.Region, a.Provider, string(a.Platform), a.Label, string(a.Source), a.ProvisionID, a.PollMin, a.PollMax, e, r.now(), existing.ID)
		if err != nil {
			return AgentRow{}, err
		}
		row, _, err := r.GetByID(existing.ID)
		return row, err
	}
	return r.Create(a)
}

// UpsertProvisioned inserts or updates a manifest agent matched by ProvisionID.
func (r *AgentsRepo) UpsertProvisioned(a ProvisionedAgent) (AgentRow, error) {
	existing, ok, err := r.FindByProvisionID(a.ProvisionID)
	if err != nil {
		return AgentRow{}, err
	}
	if ok {
		_, err := r.db.Exec(
			`UPDATE agents SET token_hash = ?, region = ?, provider = ?, platform = ?, label = ?, source = 'provisioned', updated_at = ? WHERE provision_id = ?`,
			a.TokenHash, a.Region, a.Provider, string(a.Platform), a.Label, r.now(), a.ProvisionID)
		if err != nil {
			return AgentRow{}, err
		}
		row, _, err := r.GetByID(existing.ID)
		return row, err
	}
	pid := a.ProvisionID
	return r.Create(NewAgent{
		TokenHash: a.TokenHash, Region: a.Region, Provider: a.Provider, Platform: a.Platform,
		Label: a.Label, Source: SourceProvisioned, ProvisionID: &pid,
	})
}
