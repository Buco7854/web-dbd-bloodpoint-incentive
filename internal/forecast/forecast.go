// Package forecast ports the seasonal + persistence bonus forecaster.
package forecast

import (
	"math"
	"sort"
	"strconv"
	"time"
)

const hourMS = 60 * 60 * 1000
const dayMS = 24 * hourMS

// Tunables for the seasonal + persistence model.
const (
	horizonHours        = 24
	halfLifeDays        = 10 // recency weighting of history (older weeks count less)
	minCellSamples      = 3  // min distinct observations before a cell is trusted (else back off)
	persistenceTauHours = 4  // how fast "stays at the current level" fades into climatology
)

// RawReading is one observation; T is epoch milliseconds.
type RawReading struct {
	T        int64
	Survivor int
	Killer   int
}

// Point is one forecasted hour.
type Point struct {
	T          int64 `json:"t"`
	Survivor   int   `json:"survivor"`
	SurvivorLo int   `json:"survivorLo"`
	SurvivorHi int   `json:"survivorHi"`
	Killer     int   `json:"killer"`
	KillerLo   int   `json:"killerLo"`
	KillerHi   int   `json:"killerHi"`
}

// Confidence reflects how much history backs the model.
type Confidence string

const (
	ConfidenceHigh   Confidence = "high"
	ConfidenceMedium Confidence = "medium"
	ConfidenceLow    Confidence = "low"
)

// Result is the full forecast.
type Result struct {
	HorizonHours int
	Confidence   Confidence
	Points       []Point
}

// dist is a distribution over observed discrete levels: level -> weight.
type dist map[int]float64

// cell holds survivor + killer level distributions for one seasonal cell, plus
// the number of distinct (date, hour) observations backing it.
type cell struct {
	survivor dist
	killer   dist
	count    int
}

func newCell() *cell {
	return &cell{survivor: dist{}, killer: dist{}}
}

type localParts struct {
	dateKey string
	hour    int
	dow     int
	weekend bool
}

func makeLocalParts(tz string) func(ms int64) localParts {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	return func(ms int64) localParts {
		t := time.UnixMilli(ms).In(loc)
		hour := t.Hour() % 24
		dow := int(t.Weekday()) // Sunday = 0
		return localParts{
			dateKey: t.Format("2006-01-02"),
			hour:    hour,
			dow:     dow,
			weekend: dow == 0 || dow == 6,
		}
	}
}

func addTo(d dist, level int, weight float64) {
	d[level] += weight
}

func totalWeight(d dist) float64 {
	sum := 0.0
	for _, w := range d {
		sum += w
	}
	return sum
}

// sortedKeys returns the distribution's levels in ascending order so reductions
// are deterministic (Go map iteration order is random).
func sortedKeys(d dist) []int {
	keys := make([]int, 0, len(d))
	for k := range d {
		keys = append(keys, k)
	}
	sort.Ints(keys)
	return keys
}

// modeOf returns the most probable level (ties broken toward the larger level).
func modeOf(d dist) int {
	best := 0
	bestW := -1.0
	for _, level := range sortedKeys(d) {
		w := d[level]
		if w > bestW || (w == bestW && level > best) {
			best = level
			bestW = w
		}
	}
	return best
}

// quantileOf is a weighted quantile over a discrete level distribution; returns
// an observed level.
func quantileOf(d dist, q float64) int {
	keys := sortedKeys(d)
	total := 0.0
	for _, w := range d {
		total += w
	}
	if total <= 0 {
		return 0
	}
	target := q * total
	cum := 0.0
	for _, level := range keys {
		cum += d[level]
		if cum >= target {
			return level
		}
	}
	if len(keys) > 0 {
		return keys[len(keys)-1]
	}
	return 0
}

func modeOfCounts(m map[int]int) int {
	keys := make([]int, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Ints(keys)
	best := 0
	bestW := -1
	for _, level := range keys {
		w := m[level]
		if w > bestW || (w == bestW && level > best) {
			best = level
			bestW = w
		}
	}
	return best
}

type hourBucket struct {
	survivorCounts map[int]int
	killerCounts   map[int]int
	latest         int64
	hour           int
	dow            int
	weekend        bool
}

// Forecast predicts the next horizonHours of survivor/killer bonus for one
// region. See the TS source for the full algorithm description: it models a
// distribution over actually-observed levels (never an average), blending
// recency-weighted seasonal climatology (with hierarchical backoff) and
// persistence of the current level (decaying with elapsed time).
func Forecast(rows []RawReading, tz string, now int64) Result {
	local := makeLocalParts(tz)

	// 1. Collapse readings to ONE real value per local (date, hour): the modal
	//    level that hour - never an average, since bonuses are quantized.
	tally := func(m map[int]int, v int) { m[v]++ }
	buckets := map[string]*hourBucket{}
	earliest := int64(math.MaxInt64)
	latest := int64(math.MinInt64)
	hasData := len(rows) > 0
	var currentSurvivor, currentKiller int
	haveCurrent := false
	for _, r := range rows {
		p := local(r.T)
		key := p.dateKey + "|" + strconv.Itoa(p.hour)
		b := buckets[key]
		if b == nil {
			b = &hourBucket{survivorCounts: map[int]int{}, killerCounts: map[int]int{}, hour: p.hour, dow: p.dow, weekend: p.weekend}
			buckets[key] = b
		}
		tally(b.survivorCounts, r.Survivor)
		tally(b.killerCounts, r.Killer)
		if r.T > b.latest {
			b.latest = r.T
		}
		if r.T >= latest {
			currentSurvivor = r.Survivor
			currentKiller = r.Killer
			haveCurrent = true
		}
		if r.T < earliest {
			earliest = r.T
		}
		if r.T > latest {
			latest = r.T
		}
	}

	// 2. Build the seasonal climatology at four granularities (finest first), as
	//    recency-weighted level distributions per role.
	cellsDowHour := map[string]*cell{}
	cellsDayTypeHour := map[string]*cell{}
	cellsHour := map[int]*cell{}
	globalCell := newCell()
	cellInStr := func(m map[string]*cell, key string) *cell {
		c := m[key]
		if c == nil {
			c = newCell()
			m[key] = c
		}
		return c
	}
	cellInInt := func(m map[int]*cell, key int) *cell {
		c := m[key]
		if c == nil {
			c = newCell()
			m[key] = c
		}
		return c
	}
	for _, b := range buckets {
		ageDays := math.Max(0, float64(now-b.latest)/dayMS)
		weight := math.Pow(0.5, ageDays/halfLifeDays)
		s := modeOfCounts(b.survivorCounts)
		k := modeOfCounts(b.killerCounts)
		dayType := "wd"
		if b.weekend {
			dayType = "we"
		}
		cells := []*cell{
			cellInStr(cellsDowHour, strconv.Itoa(b.dow)+"|"+strconv.Itoa(b.hour)),
			cellInStr(cellsDayTypeHour, dayType+"|"+strconv.Itoa(b.hour)),
			cellInInt(cellsHour, b.hour),
			globalCell,
		}
		for _, c := range cells {
			addTo(c.survivor, s, weight)
			addTo(c.killer, k, weight)
			c.count++
		}
	}

	// climatology picks the finest cell with enough distinct observations to be
	// trusted (count-based), then returns its recency-weighted distribution.
	climatology := func(role string, dow, hour int) dist {
		dayType := "wd"
		if dow == 0 || dow == 6 {
			dayType = "we"
		}
		candidates := []*cell{
			cellsDowHour[strconv.Itoa(dow)+"|"+strconv.Itoa(hour)],
			cellsDayTypeHour[dayType+"|"+strconv.Itoa(hour)],
			cellsHour[hour],
			globalCell,
		}
		for _, c := range candidates {
			if c != nil && c.count >= minCellSamples {
				return roleDistOf(c, role)
			}
		}
		return roleDistOf(globalCell, role)
	}

	// 3. Per future hour: blend persistence with the seasonal distribution, then
	//    read off the most-likely level and a p25-p75 band.
	start := int64(math.Ceil(float64(now)/hourMS)) * hourMS
	points := make([]Point, 0, horizonHours)
	for i := 0; i < horizonHours; i++ {
		t := start + int64(i)*hourMS
		p := local(t)

		// Persistence fades with hours since the last actual observation.
		elapsedHours := math.Inf(1)
		if hasData {
			elapsedHours = math.Max(0, float64(t-latest)/hourMS)
		}
		wPersist := math.Exp(-elapsedHours / persistenceTauHours)

		roleDist := func(role string, current int, hasCurrent bool) dist {
			clim := climatology(role, p.dow, p.hour)
			out := dist{}
			climTotal := totalWeight(clim)
			if climTotal > 0 {
				for _, level := range sortedKeys(clim) {
					addTo(out, level, (1-wPersist)*(clim[level]/climTotal))
				}
			}
			if hasCurrent {
				addTo(out, current, wPersist)
			}
			return out
		}

		sDist := roleDist("survivor", currentSurvivor, haveCurrent)
		kDist := roleDist("killer", currentKiller, haveCurrent)
		points = append(points, Point{
			T:          t,
			Survivor:   modeOf(sDist),
			SurvivorLo: quantileOf(sDist, 0.25),
			SurvivorHi: quantileOf(sDist, 0.75),
			Killer:     modeOf(kDist),
			KillerLo:   quantileOf(kDist, 0.25),
			KillerHi:   quantileOf(kDist, 0.75),
		})
	}

	// 4. Confidence from how much history backs the model.
	spanDays := 0.0
	if hasData {
		spanDays = float64(latest-earliest) / dayMS
	}
	confidence := ConfidenceLow
	if spanDays >= 14 && len(buckets) >= 14*12 {
		confidence = ConfidenceHigh
	} else if spanDays >= 4 {
		confidence = ConfidenceMedium
	}

	return Result{HorizonHours: horizonHours, Confidence: confidence, Points: points}
}

func roleDistOf(c *cell, role string) dist {
	if role == "survivor" {
		return c.survivor
	}
	return c.killer
}
