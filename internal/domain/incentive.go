package domain

// DataStatus is the overall health of a platform's data, surfaced to the UI.
type DataStatus string

const (
	StatusInitializing DataStatus = "initializing"
	StatusOK           DataStatus = "ok"
	StatusDegraded     DataStatus = "degraded"
	StatusError        DataStatus = "error"
)

// RegionIncentive is one region's incentive as served to the browser.
type RegionIncentive struct {
	Region      string  `json:"region"`
	DisplayName string  `json:"displayName"`
	Flag        string  `json:"flag"`
	Survivor    int     `json:"survivor"`
	Killer      int     `json:"killer"`
	Ratio       float64 `json:"ratio"`
	IsReal      bool    `json:"isReal"`
	Stale       bool    `json:"stale"`
	LastUpdated *string `json:"lastUpdated"`
}

// AgentReport is one reading an agent pushes for its assigned region+platform.
type AgentReport struct {
	Region             string   `json:"region"`
	Platform           Platform `json:"platform"`
	Survivor           int      `json:"survivor"`
	Killer             int      `json:"killer"`
	Ratio              float64  `json:"ratio"`
	IsReal             bool     `json:"isReal"`
	Version            *string  `json:"version"`
	Category           *string  `json:"category"`
	RefreshTimeSeconds *int     `json:"refreshTimeSeconds"`
	MeasuredAt         string   `json:"measuredAt"`
}

// AgentAssignment is what the hub tells an agent to poll.
type AgentAssignment struct {
	Region             string   `json:"region"`
	Platform           Platform `json:"platform"`
	PollMinSeconds     int      `json:"pollMinSeconds"`
	PollMaxSeconds     int      `json:"pollMaxSeconds"`
	PhaseOffsetSeconds int      `json:"phaseOffsetSeconds"`
	ProbeImmediately   bool     `json:"probeImmediately"`
}

// CoverageEntry is how many agents cover one region on a platform.
type CoverageEntry struct {
	Region      string `json:"region"`
	DisplayName string `json:"displayName"`
	Flag        string `json:"flag"`
	Agents      int    `json:"agents"`
}

// IncentivesPayload is the current incentives served for a platform: the
// per-region bonuses plus the provenance/freshness metadata that describes them.
type IncentivesPayload struct {
	UpdatedAt    *string           `json:"updatedAt"`
	GeneratedAt  string            `json:"generatedAt"`
	Platform     Platform          `json:"platform"`
	Version      *string           `json:"version"`
	Category     *string           `json:"category"`
	Status       DataStatus        `json:"status"`
	StatusReason *string           `json:"statusReason"`
	Regions      []RegionIncentive `json:"regions"`
}

// CoveragePayload reports how many agents cover each region on a platform.
type CoveragePayload struct {
	Platform Platform        `json:"platform"`
	Regions  []CoverageEntry `json:"regions"`
}

// SiteMeta is the hub's UI/config bootstrap, served at GET /api/v1/meta. It is
// independent of any single platform's incentives.
type SiteMeta struct {
	Platforms         []Platform `json:"platforms"`
	ContactEmail      *string    `json:"contactEmail"`
	DiscordURL        *string    `json:"discordUrl"`
	MatrixURL         *string    `json:"matrixUrl"`
	AgentSetupURL     string     `json:"agentSetupUrl"`
	ContributeEnabled bool       `json:"contributeEnabled"`
	PageSize          int        `json:"pageSize"`
}

// HistoryResolution is whether a range came back raw or as last-value buckets.
type HistoryResolution string

const (
	ResolutionRaw      HistoryResolution = "raw"
	ResolutionBucketed HistoryResolution = "bucketed"
)

// HistoryPoint is one point on the history graph (a real observed level).
type HistoryPoint struct {
	T        int64 `json:"t"`
	Survivor int   `json:"survivor"`
	Killer   int   `json:"killer"`
}

// HistoryRangePayload is served for a region's history window.
type HistoryRangePayload struct {
	Region     string            `json:"region"`
	Platform   Platform          `json:"platform"`
	Resolution HistoryResolution `json:"resolution"`
	BucketMs   int64             `json:"bucketMs"`
	Points     []HistoryPoint    `json:"points"`
	FirstAt    *int64            `json:"firstAt"`
	LastAt     *int64            `json:"lastAt"`
}

// ReadingEntry is one raw reading for the recent/changes lists.
type ReadingEntry struct {
	T        int64   `json:"t"`
	Survivor int     `json:"survivor"`
	Killer   int     `json:"killer"`
	Ratio    float64 `json:"ratio"`
}

// RegionActivityPayload is a region's latest readings and change points.
type RegionActivityPayload struct {
	Region   string         `json:"region"`
	Platform Platform       `json:"platform"`
	Recent   []ReadingEntry `json:"recent"`
	Changes  []ReadingEntry `json:"changes"`
}
