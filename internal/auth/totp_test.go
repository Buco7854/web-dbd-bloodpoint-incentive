package auth

import (
	"testing"
	"time"
)

func TestVerifyTotpStepReturnsStableCounterForReplay(t *testing.T) {
	secret := GenerateTotpSecret()
	now := time.Unix(1_700_000_000, 0)
	code := generateTotpAt(secret, now)

	step1, ok := VerifyTotpStep(secret, code, now, 1)
	if !ok {
		t.Fatal("expected valid code to verify")
	}
	// The same code presented again within the window matches the same time-step,
	// so a replay-guarding caller (step <= last) can reject it.
	step2, ok := VerifyTotpStep(secret, code, now.Add(5*time.Second), 1)
	if !ok || step2 != step1 {
		t.Fatalf("replay should match the same step: got (%d,%v) want (%d,true)", step2, ok, step1)
	}
}

func TestVerifyTotpStepAdvancesAcrossPeriods(t *testing.T) {
	secret := GenerateTotpSecret()
	now := time.Unix(1_700_000_000, 0)
	later := now.Add(60 * time.Second) // two 30s steps on

	s1, ok1 := VerifyTotpStep(secret, generateTotpAt(secret, now), now, 1)
	s2, ok2 := VerifyTotpStep(secret, generateTotpAt(secret, later), later, 1)
	if !ok1 || !ok2 {
		t.Fatal("both codes should verify")
	}
	if s2 <= s1 {
		t.Fatalf("later step %d should exceed earlier step %d", s2, s1)
	}
}

func TestVerifyTotpRejectsGarbage(t *testing.T) {
	secret := GenerateTotpSecret()
	if VerifyTotp(secret, "000000", time.Unix(1_700_000_000, 0), 1) &&
		VerifyTotp(secret, "abcdef", time.Unix(1_700_000_000, 0), 1) {
		t.Fatal("non-matching/non-numeric codes must not verify")
	}
}

// generateTotpAt mirrors how a client computes the current code for a secret.
func generateTotpAt(secret string, at time.Time) string {
	return hotp(secret, uint64(at.Unix()/totpStep))
}
