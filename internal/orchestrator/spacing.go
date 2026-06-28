package orchestrator

import (
	"math"
	"sort"
)

const (
	searchStepSeconds = 5
	maxWindowSeconds  = 2 * 3600
)

func gcd(a, b int) int {
	for b != 0 {
		a, b = b, a%b
	}
	return a
}

func lcm(a, b int) int {
	if a == 0 || b == 0 {
		return 0
	}
	return (a / gcd(a, b)) * b
}

// minCircularGap is the minimum gap between consecutive events on a circle of length window.
func minCircularGap(events []int, window int) int {
	if len(events) <= 1 {
		return window
	}
	sorted := append([]int(nil), events...)
	sort.Ints(sorted)
	min := window - sorted[len(sorted)-1] + sorted[0]
	for i := 1; i < len(sorted); i++ {
		if g := sorted[i] - sorted[i-1]; g < min {
			min = g
		}
	}
	return min
}

// eventsIn returns the event times of one agent (period p, phase φ) within [0, window).
func eventsIn(period, phase, window int) []int {
	out := []int{}
	for t := phase % period; t < window; t += period {
		out = append(out, t)
	}
	return out
}

// ComputePhaseOffsets spreads agents sharing a region+platform so their periodic
// requests don't bunch. Equal periods get exact even spacing; mixed periods
// even-space the most common period first, then drop stragglers into the largest gap.
func ComputePhaseOffsets(periodsSeconds []float64) []int {
	n := len(periodsSeconds)
	if n == 0 {
		return []int{}
	}
	if n == 1 {
		return []int{0}
	}
	periods := make([]int, n)
	for i, p := range periodsSeconds {
		periods[i] = int(math.Max(1, math.Round(p)))
	}

	allEqual := true
	for _, p := range periods {
		if p != periods[0] {
			allEqual = false
			break
		}
	}
	if allEqual {
		t := periods[0]
		out := make([]int, n)
		for i := range periods {
			out[i] = int(math.Round(float64(i*t) / float64(n)))
		}
		return out
	}

	window := periods[0]
	maxPeriod := periods[0]
	for _, p := range periods {
		window = lcm(window, p)
		if p > maxPeriod {
			maxPeriod = p
		}
	}
	if window <= 0 || window > maxWindowSeconds {
		window = maxPeriod * n
		if window > maxWindowSeconds {
			window = maxWindowSeconds
		}
	}

	byPeriod := map[int][]int{}
	var periodOrder []int
	for i, p := range periods {
		if _, ok := byPeriod[p]; !ok {
			periodOrder = append(periodOrder, p)
		}
		byPeriod[p] = append(byPeriod[p], i)
	}
	modePeriod := periods[0]
	var modeIndices []int
	for _, period := range periodOrder {
		indices := byPeriod[period]
		if len(indices) > len(modeIndices) || (len(indices) == len(modeIndices) && period < modePeriod) {
			modePeriod = period
			modeIndices = indices
		}
	}

	offsets := make([]int, n)
	var placed []int
	inBackbone := map[int]bool{}
	for _, idx := range modeIndices {
		inBackbone[idx] = true
	}
	for j, idx := range modeIndices {
		phase := int(math.Round(float64(j*modePeriod) / float64(len(modeIndices))))
		offsets[idx] = phase
		placed = append(placed, eventsIn(modePeriod, phase, window)...)
	}

	for i := 0; i < n; i++ {
		if inBackbone[i] {
			continue
		}
		period := periods[i]
		bestPhase, bestGap := 0, -1
		step := searchStepSeconds
		if half := period / 2; half < step {
			step = half
		}
		if step < 1 {
			step = 1
		}
		for phase := 0; phase < period; phase += step {
			candidate := append(append([]int(nil), placed...), eventsIn(period, phase, window)...)
			if gap := minCircularGap(candidate, window); gap > bestGap {
				bestGap = gap
				bestPhase = phase
			}
		}
		offsets[i] = bestPhase
		placed = append(placed, eventsIn(period, bestPhase, window)...)
	}
	return offsets
}
