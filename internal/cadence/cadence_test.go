package cadence

import (
	"errors"
	"testing"
)

func ptr(f float64) *float64 { return &f }

func resolveOK(t *testing.T, value string, refresh *float64) (float64, bool) {
	t.Helper()
	got, resolved, err := ResolveCadence(value, refresh)
	if err != nil {
		t.Fatalf("ResolveCadence(%q): unexpected error: %v", value, err)
	}
	return got, resolved
}

func TestPlainNumberResolvesToItself(t *testing.T) {
	if got, err := ResolveCadenceNumber(300); err != nil || got != 300 {
		t.Fatalf("ResolveCadenceNumber(300) = %v, %v", got, err)
	}
	if got, resolved := resolveOK(t, "300", nil); !resolved || got != 300 {
		t.Fatalf(`ResolveCadence("300", nil) = %v, %v`, got, resolved)
	}
	if got, resolved := resolveOK(t, "300", ptr(250)); !resolved || got != 300 {
		t.Fatalf(`ResolveCadence("300", 250) = %v, %v`, got, resolved)
	}
}

func TestPlaceholdersResolveToLiveValue(t *testing.T) {
	if got, resolved := resolveOK(t, "%refreshTime%", ptr(250)); !resolved || got != 250 {
		t.Fatalf(`%%refreshTime%% = %v, %v`, got, resolved)
	}
	if got, resolved := resolveOK(t, "%auto%", ptr(250)); !resolved || got != 250 {
		t.Fatalf(`%%auto%% = %v, %v`, got, resolved)
	}
}

func TestArithmeticWithPrecedence(t *testing.T) {
	cases := []struct {
		expr    string
		refresh float64
		want    float64
	}{
		{"%refreshTime% * 1.2", 300, 360},
		{"%refreshTime% + 30", 300, 330},
		{"(%refreshTime% + 100) / 2", 300, 200},
		{"%refreshTime% * 2 + 10", 100, 210},
	}
	for _, c := range cases {
		got, resolved := resolveOK(t, c.expr, ptr(c.refresh))
		if !resolved || got != c.want {
			t.Fatalf("ResolveCadence(%q, %v) = %v, %v; want %v", c.expr, c.refresh, got, resolved, c.want)
		}
	}
}

func TestNullWhenRefreshTimeUnknown(t *testing.T) {
	got, resolved, err := ResolveCadence("%refreshTime% * 1.1", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resolved {
		t.Fatalf("expected unresolved (null) when refreshTime unknown, got %v", got)
	}
	if !NeedsRefreshTime("%auto%") {
		t.Fatal(`NeedsRefreshTime("%auto%") = false, want true`)
	}
	if NeedsRefreshTime("300") {
		t.Fatal(`NeedsRefreshTime("300") = true, want false`)
	}
}

func TestMalformedOrUnsafeExpressionsError(t *testing.T) {
	cases := []struct {
		value   string
		refresh *float64
	}{
		{"300; rm -rf", ptr(300)},
		{"%refreshTime% / 0", ptr(300)},
		{"", ptr(300)},
		{"1 + ", ptr(300)},
	}
	for _, c := range cases {
		_, _, err := ResolveCadence(c.value, c.refresh)
		if err == nil {
			t.Fatalf("ResolveCadence(%q): expected error, got nil", c.value)
		}
		var ce *Error
		if !errors.As(err, &ce) {
			t.Fatalf("ResolveCadence(%q): error %v is not *Error", c.value, err)
		}
	}
}
