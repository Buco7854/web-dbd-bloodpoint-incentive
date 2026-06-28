package orchestrator

import (
	"reflect"
	"sort"
	"testing"
)

func TestPhaseOffsetsEmptyAndSingle(t *testing.T) {
	if got := ComputePhaseOffsets(nil); len(got) != 0 {
		t.Fatalf("empty: got %v", got)
	}
	if got := ComputePhaseOffsets([]float64{300}); !reflect.DeepEqual(got, []int{0}) {
		t.Fatalf("single: got %v", got)
	}
}

func TestPhaseOffsetsEqualPeriods(t *testing.T) {
	cases := []struct {
		in   []float64
		want []int
	}{
		{[]float64{300, 300}, []int{0, 150}},
		{[]float64{300, 300, 300}, []int{0, 100, 200}},
		{[]float64{600, 600, 600, 600}, []int{0, 150, 300, 450}},
	}
	for _, c := range cases {
		if got := ComputePhaseOffsets(c.in); !reflect.DeepEqual(got, c.want) {
			t.Errorf("ComputePhaseOffsets(%v) = %v, want %v", c.in, got, c.want)
		}
	}
}

func minMergedGap(periods []int, offsets []int) int {
	window := periods[0]
	for _, p := range periods {
		window = lcm(window, p)
	}
	var events []int
	for i, p := range periods {
		for tt := offsets[i] % p; tt < window; tt += p {
			events = append(events, tt)
		}
	}
	sort.Ints(events)
	min := window - events[len(events)-1] + events[0]
	for i := 1; i < len(events); i++ {
		if g := events[i] - events[i-1]; g < min {
			min = g
		}
	}
	return min
}

func TestPhaseOffsetsMixedBeatsNaive(t *testing.T) {
	periods := []int{300, 600}
	offsets := ComputePhaseOffsets([]float64{300, 600})
	if minMergedGap(periods, offsets) <= minMergedGap(periods, []int{0, 0}) {
		t.Fatalf("computed layout did not beat all-zero phases")
	}
}

func TestPhaseOffsetsBackbone(t *testing.T) {
	offsets := ComputePhaseOffsets([]float64{300, 300, 600, 300})
	trio := []int{offsets[0], offsets[1], offsets[3]}
	sort.Ints(trio)
	if !reflect.DeepEqual(trio, []int{0, 100, 200}) {
		t.Fatalf("trio = %v, want [0 100 200]", trio)
	}
	if offsets[2] < 0 || offsets[2] >= 600 {
		t.Fatalf("straggler out of range: %d", offsets[2])
	}
}

func TestPhaseOffsetsWithinPeriod(t *testing.T) {
	periods := []float64{300, 420, 600}
	offsets := ComputePhaseOffsets(periods)
	for i, o := range offsets {
		if o < 0 || o >= int(periods[i]) {
			t.Errorf("offset %d=%d out of [0,%v)", i, o, periods[i])
		}
	}
}
