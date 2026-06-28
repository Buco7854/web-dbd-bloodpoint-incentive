// Package orchestrator turns the registry + cadence config + the live refreshTime
// into a concrete poll assignment (interval + phase offset) for one agent.
package orchestrator

import (
	"math"

	"github.com/buco7854/bloodpoint-incentives/internal/cadence"
	"github.com/buco7854/bloodpoint-incentives/internal/domain"
	"github.com/buco7854/bloodpoint-incentives/internal/registry"
)

// hardMinSeconds is the floor on any resolved interval, for API hygiene.
const hardMinSeconds = 300

// Orchestrator computes agent assignments. It is pure given (registry, refreshTime).
type Orchestrator struct {
	registry            func() *registry.Registry
	globalCadence       domain.CadenceSpec
	bootstrapMinSeconds int
}

// New returns an orchestrator.
func New(reg func() *registry.Registry, global domain.CadenceSpec, bootstrapMinSeconds int) *Orchestrator {
	return &Orchestrator{registry: reg, globalCadence: global, bootstrapMinSeconds: bootstrapMinSeconds}
}

// AssignmentFor resolves the interval + phase offset for one agent's slot.
func (o *Orchestrator) AssignmentFor(slot registry.Slot, refreshTime *float64) domain.AgentAssignment {
	reg := o.registry()
	groupIDs := reg.AgentsInGroup(slot.Region, slot.Platform)
	count := len(groupIDs)
	if count < 1 {
		count = 1
	}
	mins := make([]int, len(groupIDs))
	maxes := make([]int, len(groupIDs))
	midpoints := make([]float64, len(groupIDs))
	for i, id := range groupIDs {
		mins[i] = o.resolveMin(reg, id, refreshTime)
		maxes[i] = o.resolveMax(reg, id, refreshTime, mins[i], count)
		midpoints[i] = float64(mins[i]+maxes[i]) / 2
	}
	phases := ComputePhaseOffsets(midpoints)

	pos := slot.Index
	if pos < 0 {
		pos = 0
	}
	if pos > len(groupIDs)-1 {
		pos = len(groupIDs) - 1
	}

	min := o.bootstrapMinSeconds
	if min < hardMinSeconds {
		min = hardMinSeconds
	}
	max := int(math.Round(float64(min) * cadence.DefaultMaxRatio))
	phase := 0
	if pos >= 0 && pos < len(groupIDs) {
		min = mins[pos]
		max = maxes[pos]
		phase = phases[pos]
	}

	return domain.AgentAssignment{
		Region:             slot.Region,
		Platform:           slot.Platform,
		PollMinSeconds:     min,
		PollMaxSeconds:     max,
		PhaseOffsetSeconds: phase,
		ProbeImmediately:   slot.Index == 0 && refreshTime == nil,
	}
}

func (o *Orchestrator) specFor(reg *registry.Registry, agentID int64) domain.CadenceSpec {
	spec := o.globalCadence
	if override, ok := reg.CadenceFor(agentID); ok {
		if override.Min != nil {
			spec.Min = *override.Min
		}
		if override.Max != nil {
			spec.Max = *override.Max
		}
	}
	return spec
}

func (o *Orchestrator) resolveMin(reg *registry.Registry, agentID int64, refreshTime *float64) int {
	resolved, ok, err := cadence.ResolveCadence(o.specFor(reg, agentID).Min, refreshTime)
	value := float64(o.bootstrapMinSeconds)
	if err == nil && ok {
		value = resolved
	}
	r := int(math.Round(value))
	if r < hardMinSeconds {
		r = hardMinSeconds
	}
	return r
}

func (o *Orchestrator) resolveMax(reg *registry.Registry, agentID int64, refreshTime *float64, min, count int) int {
	resolved, ok, err := cadence.ResolveCadence(o.specFor(reg, agentID).Max, refreshTime)
	raw := int(math.Round(float64(min) * cadence.DefaultMaxRatio))
	if err == nil && ok {
		raw = int(math.Round(resolved))
	}
	// Cap jitter to ~half the inter-agent gap so wobble can't blur the spacing.
	capped := min + min/(2*count)
	if raw < capped {
		capped = raw
	}
	if capped < min {
		capped = min
	}
	return capped
}
