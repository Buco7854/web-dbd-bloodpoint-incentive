package forecast

// ActualPt is a real observed value over the past window, to compare against the hindcast.
type ActualPt struct {
	T        int64 `json:"t"`
	Survivor int   `json:"survivor"`
	Killer   int   `json:"killer"`
}
