package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// ConfigError is a fatal, user-facing configuration problem.
type ConfigError struct{ msg string }

func (e *ConfigError) Error() string { return e.msg }

func configErrorf(format string, args ...any) *ConfigError {
	return &ConfigError{msg: fmt.Sprintf(format, args...)}
}

func readString(name string) (string, bool) {
	v, ok := os.LookupEnv(name)
	if !ok {
		return "", false
	}
	v = strings.TrimSpace(v)
	if v == "" {
		return "", false
	}
	return v, true
}

func stringOr(name, fallback string) string {
	if v, ok := readString(name); ok {
		return v
	}
	return fallback
}

func boolOr(name string, fallback bool) bool {
	v, ok := readString(name)
	if !ok {
		return fallback
	}
	switch strings.ToLower(v) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func intOr(name string, fallback int) int {
	v, ok := readString(name)
	if !ok {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if hi > 0 && v > hi {
		return hi
	}
	return v
}
