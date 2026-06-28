// Package cadence resolves a poll-cadence value that may be a plain number of
// seconds or a small expression referencing the live DBD refresh cadence via
// %refreshTime% (or its alias %auto%), e.g. "%refreshTime%",
// "%refreshTime% * 1.2", "%auto% + 30".
//
// The expression grammar is tiny: numbers, the placeholders, and + - * / ( ).
// It is parsed by a recursive-descent evaluator, never eval, so a config value
// can't run arbitrary code.
package cadence

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

// DefaultMaxRatio is the default ratio of max:min for the poll interval when no
// explicit max is set.
const DefaultMaxRatio = 1.33

// Error mirrors the TS CadenceError.
type Error struct {
	Msg string
}

func (e *Error) Error() string { return e.Msg }

func newError(format string, args ...any) *Error {
	return &Error{Msg: fmt.Sprintf(format, args...)}
}

var placeholder = regexp.MustCompile(`(?i)%(refreshTime|auto)%`)

// NeedsRefreshTime reports whether the expression needs the live refreshTime to
// resolve.
func NeedsRefreshTime(value string) bool {
	return placeholder.MatchString(value)
}

// ResolveCadenceNumber returns value if finite, else an error.
func ResolveCadenceNumber(value float64) (float64, error) {
	if !isFinite(value) {
		return 0, newError("cadence %v is not finite", value)
	}
	return value, nil
}

// ResolveCadence resolves value to a number of seconds. resolved is false (with
// nil error) when the expression references refreshTime but none is known yet
// (the caller falls back to a bootstrap value).
func ResolveCadence(value string, refreshTimeSeconds *float64) (seconds float64, resolved bool, err error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return 0, false, newError("cadence expression is empty")
	}

	if NeedsRefreshTime(trimmed) && refreshTimeSeconds == nil {
		return 0, false, nil
	}

	substituted := trimmed
	if refreshTimeSeconds != nil {
		substituted = placeholder.ReplaceAllString(trimmed, formatNumber(*refreshTimeSeconds))
	}

	result, err := newEvaluator(substituted).evaluate()
	if err != nil {
		return 0, false, err
	}
	if !isFinite(result) {
		return 0, false, newError("cadence expression %q did not resolve to a finite number", value)
	}
	return result, true, nil
}

// formatNumber mirrors JS String(number) for the values used here.
func formatNumber(f float64) string {
	return strconv.FormatFloat(f, 'g', -1, 64)
}

func isFinite(f float64) bool {
	return !math.IsInf(f, 0) && !math.IsNaN(f)
}

// evaluator is a recursive-descent evaluator for + - * / and parentheses over
// numbers.
type evaluator struct {
	src []rune
	pos int
}

func newEvaluator(src string) *evaluator {
	return &evaluator{src: []rune(src)}
}

func (e *evaluator) evaluate() (float64, error) {
	value, err := e.expr()
	if err != nil {
		return 0, err
	}
	e.skipSpace()
	if e.pos < len(e.src) {
		return 0, newError("unexpected %q in cadence expression", string(e.src[e.pos]))
	}
	return value, nil
}

func (e *evaluator) expr() (float64, error) {
	value, err := e.term()
	if err != nil {
		return 0, err
	}
	for {
		e.skipSpace()
		op := e.peek()
		if op == '+' || op == '-' {
			e.pos++
			rhs, err := e.term()
			if err != nil {
				return 0, err
			}
			if op == '+' {
				value += rhs
			} else {
				value -= rhs
			}
		} else {
			return value, nil
		}
	}
}

func (e *evaluator) term() (float64, error) {
	value, err := e.factor()
	if err != nil {
		return 0, err
	}
	for {
		e.skipSpace()
		op := e.peek()
		if op == '*' || op == '/' {
			e.pos++
			rhs, err := e.factor()
			if err != nil {
				return 0, err
			}
			if op == '/' && rhs == 0 {
				return 0, newError("division by zero in cadence expression")
			}
			if op == '*' {
				value *= rhs
			} else {
				value /= rhs
			}
		} else {
			return value, nil
		}
	}
}

func (e *evaluator) factor() (float64, error) {
	e.skipSpace()
	if e.peek() == '-' {
		e.pos++
		v, err := e.factor()
		if err != nil {
			return 0, err
		}
		return -v, nil
	}
	if e.peek() == '(' {
		e.pos++
		value, err := e.expr()
		if err != nil {
			return 0, err
		}
		e.skipSpace()
		if e.peek() != ')' {
			return 0, newError("missing \")\" in cadence expression")
		}
		e.pos++
		return value, nil
	}
	return e.number()
}

func (e *evaluator) number() (float64, error) {
	e.skipSpace()
	start := e.pos
	for e.pos < len(e.src) && (e.src[e.pos] == '.' || (e.src[e.pos] >= '0' && e.src[e.pos] <= '9')) {
		e.pos++
	}
	text := string(e.src[start:e.pos])
	if text == "" || text == "." {
		return 0, newError("expected a number in cadence expression at position %d", start)
	}
	value, perr := strconv.ParseFloat(text, 64)
	if perr != nil || !isFinite(value) {
		return 0, newError("invalid number %q in cadence expression", text)
	}
	return value, nil
}

func (e *evaluator) peek() rune {
	if e.pos < len(e.src) {
		return e.src[e.pos]
	}
	return 0
}

func (e *evaluator) skipSpace() {
	for e.pos < len(e.src) && isSpace(e.src[e.pos]) {
		e.pos++
	}
}

func isSpace(r rune) bool {
	switch r {
	case ' ', '\t', '\n', '\r', '\v', '\f':
		return true
	}
	return false
}
