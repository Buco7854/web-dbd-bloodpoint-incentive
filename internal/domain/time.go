package domain

import "time"

// ParseISOMs parses an ISO-8601 timestamp to epoch milliseconds (ok=false on failure).
func ParseISOMs(s string) (int64, bool) {
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		if t, err = time.Parse(time.RFC3339, s); err != nil {
			return 0, false
		}
	}
	return t.UnixMilli(), true
}

// ISOFromMs formats epoch milliseconds as a UTC ISO-8601 timestamp (millisecond precision).
func ISOFromMs(ms int64) string {
	return time.UnixMilli(ms).UTC().Format("2006-01-02T15:04:05.000Z07:00")
}
