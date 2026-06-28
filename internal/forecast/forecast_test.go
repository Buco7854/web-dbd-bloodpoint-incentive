package forecast

import (
	"testing"
	"time"
)

const hourMs = int64(60 * 60 * 1000)
const dayMs = 24 * hourMs

func mustParse(s string) int64 {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(err)
	}
	return t.UnixMilli()
}

var now = mustParse("2026-06-25T00:00:00.000Z")

func utcHour(ms int64) int {
	return time.UnixMilli(ms).UTC().Hour()
}

func utcDay(ms int64) int {
	return int(time.UnixMilli(ms).UTC().Weekday())
}

func TestEmptyHistoryZeroedLowConfidence(t *testing.T) {
	res := Forecast(nil, "UTC", now)
	if res.HorizonHours != 24 {
		t.Fatalf("HorizonHours = %d, want 24", res.HorizonHours)
	}
	if len(res.Points) != 24 {
		t.Fatalf("len(Points) = %d, want 24", len(res.Points))
	}
	if res.Confidence != ConfidenceLow {
		t.Fatalf("Confidence = %q, want low", res.Confidence)
	}
	for _, p := range res.Points {
		if p.Survivor != 0 || p.Killer != 0 {
			t.Fatalf("expected zeroed point, got survivor=%d killer=%d", p.Survivor, p.Killer)
		}
	}
}

func TestNeverAverages(t *testing.T) {
	// Hour 20 (UTC) over three weeks, the killer bonus alternates 100/150 by day.
	var rows []RawReading
	for d := int64(21); d >= 1; d-- {
		base := ((now-d*dayMs)/dayMs)*dayMs + 20*hourMs
		killer := 150
		if d%2 == 0 {
			killer = 100
		}
		rows = append(rows, RawReading{T: base, Survivor: 0, Killer: killer})
		rows = append(rows, RawReading{T: base + 5*60*1000, Survivor: 0, Killer: killer})
	}
	res := Forecast(rows, "UTC", now)
	var p20 *Point
	for i := range res.Points {
		if utcHour(res.Points[i].T) == 20 {
			p20 = &res.Points[i]
			break
		}
	}
	if p20 == nil {
		t.Fatal("no point at hour 20")
	}
	for _, v := range []int{p20.Killer, p20.KillerLo, p20.KillerHi} {
		if v != 100 && v != 150 {
			t.Fatalf("expected an observed level, got %d", v)
		}
	}
}

func TestModalWinsNotMean(t *testing.T) {
	// One day, hour 18: readings 110, 110, 150 -> mode 110 (mean would be ~123).
	base := ((now-2*dayMs)/dayMs)*dayMs + 18*hourMs
	rows := []RawReading{
		{T: base, Survivor: 0, Killer: 110},
		{T: base + 60_000, Survivor: 0, Killer: 110},
		{T: base + 120_000, Survivor: 0, Killer: 150},
	}
	res := Forecast(rows, "UTC", now)
	var p18 *Point
	for i := range res.Points {
		if utcHour(res.Points[i].T) == 18 {
			p18 = &res.Points[i]
			break
		}
	}
	if p18 == nil || p18.Killer != 110 {
		t.Fatalf("p18.Killer = %v, want 110", p18)
	}
}

func TestEveryValueIsObservedLevel(t *testing.T) {
	levels := []int{0, 50, 100, 110, 150}
	var rows []RawReading
	for d := int64(16); d >= 1; d-- {
		for h := int64(0); h < 24; h++ {
			rows = append(rows, RawReading{T: now - d*dayMs + h*hourMs, Survivor: 0, Killer: levels[(d+h)%int64(len(levels))]})
		}
	}
	allowed := map[int]bool{}
	for _, l := range levels {
		allowed[l] = true
	}
	for _, p := range Forecast(rows, "UTC", now).Points {
		for _, v := range []int{p.Killer, p.KillerLo, p.KillerHi, p.Survivor, p.SurvivorLo, p.SurvivorHi} {
			if !allowed[v] {
				t.Fatalf("forecast produced an unobserved level: %d", v)
			}
		}
	}
}

func TestDayOfWeekGranularity(t *testing.T) {
	// Find a real Friday 15:00 and the next day (Saturday) 15:00, in UTC.
	friday15 := time.Date(2026, 6, 1, 15, 0, 0, 0, time.UTC).UnixMilli()
	for utcDay(friday15) != 5 {
		friday15 += dayMs
	}
	saturday15 := friday15 + dayMs
	// Five weeks where Fridays at 15h ran a +150 killer bonus, Saturdays ran 0.
	var rows []RawReading
	for w := int64(1); w <= 5; w++ {
		rows = append(rows, RawReading{T: friday15 - w*7*dayMs, Survivor: 0, Killer: 150})
		rows = append(rows, RawReading{T: saturday15 - w*7*dayMs, Survivor: 0, Killer: 0})
	}
	var friPoint, satPoint *Point
	friRes := Forecast(rows, "UTC", friday15-hourMs)
	for i := range friRes.Points {
		if utcDay(friRes.Points[i].T) == 5 && utcHour(friRes.Points[i].T) == 15 {
			friPoint = &friRes.Points[i]
			break
		}
	}
	satRes := Forecast(rows, "UTC", saturday15-hourMs)
	for i := range satRes.Points {
		if utcDay(satRes.Points[i].T) == 6 && utcHour(satRes.Points[i].T) == 15 {
			satPoint = &satRes.Points[i]
			break
		}
	}
	if friPoint == nil || friPoint.Killer != 150 {
		t.Fatalf("friPoint.Killer = %v, want 150", friPoint)
	}
	if satPoint == nil || satPoint.Killer != 0 {
		t.Fatalf("satPoint.Killer = %v, want 0", satPoint)
	}
}

func TestConfidenceRises(t *testing.T) {
	var rows []RawReading
	for d := int64(20); d >= 1; d-- {
		for h := int64(0); h < 24; h++ {
			rows = append(rows, RawReading{T: now - d*dayMs + h*hourMs, Survivor: 50, Killer: 0})
		}
	}
	if c := Forecast(rows, "UTC", now).Confidence; c != ConfidenceHigh {
		t.Fatalf("Confidence = %q, want high", c)
	}
}
