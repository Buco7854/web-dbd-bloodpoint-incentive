package registry

import (
	"fmt"
	"log/slog"
	"strings"

	"github.com/buco7854/bloodpoint-incentives/internal/db"
	"github.com/buco7854/bloodpoint-incentives/internal/domain"
	"github.com/buco7854/bloodpoint-incentives/internal/token"
)

// ProvisionInput is a provisioned-agent declaration from the boot manifest.
type ProvisionInput struct {
	ProvisionID string
	Token       string
	Region      string
	Provider    string
	Label       *string
}

type resolvedProvision struct {
	provisionID string
	token       string
	region      string
	provider    string
	platform    domain.Platform
	label       *string
}

func resolve(in ProvisionInput) (resolvedProvision, error) {
	provisionID := strings.TrimSpace(in.ProvisionID)
	tok := strings.TrimSpace(in.Token)
	region := strings.TrimSpace(in.Region)
	provider := strings.ToLower(strings.TrimSpace(in.Provider))
	if provisionID == "" || tok == "" || region == "" || provider == "" {
		return resolvedProvision{}, fmt.Errorf("a provisioned agent needs a non-empty id, token, region and provider")
	}
	if !domain.IsKnownRegion(region) {
		return resolvedProvision{}, fmt.Errorf("provisioned agent %q has an unknown region %q", provisionID, region)
	}
	if !domain.IsKnownProvider(provider) {
		return resolvedProvision{}, fmt.Errorf("provisioned agent %q has an unknown provider %q", provisionID, provider)
	}
	if !domain.IsSupportedProvider(provider) {
		return resolvedProvision{}, fmt.Errorf(
			"provisioned agent %q uses provider %q, which is not supported yet (supported: %s)",
			provisionID, provider, strings.Join(domain.SupportedProviders(), ", "))
	}
	return resolvedProvision{
		provisionID: provisionID, token: tok, region: region, provider: provider,
		platform: domain.PlatformForProvider(provider), label: in.Label,
	}, nil
}

// ParseProvisionAgents parses the PROVISION_AGENTS string: comma-separated
// id:token:region:provider entries (no field may contain ':').
func ParseProvisionAgents(raw string) ([]ProvisionInput, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	var out []ProvisionInput
	for _, part := range strings.Split(raw, ",") {
		spec := strings.TrimSpace(part)
		if spec == "" {
			continue
		}
		fields := strings.Split(spec, ":")
		for i := range fields {
			fields[i] = strings.TrimSpace(fields[i])
		}
		if len(fields) != 4 || fields[0] == "" || fields[1] == "" || fields[2] == "" || fields[3] == "" {
			return nil, fmt.Errorf("PROVISION_AGENTS entry %q must be <id>:<token>:<region>:<provider>", spec)
		}
		out = append(out, ProvisionInput{ProvisionID: fields[0], Token: fields[1], Region: fields[2], Provider: fields[3]})
	}
	return out, nil
}

// ApplyProvisioning upserts each declaration by ProvisionID (idempotent across
// re-deploys). Validated first so a bad entry fails fast; duplicate ids are rejected.
func ApplyProvisioning(repo *db.AgentsRepo, inputs []ProvisionInput, log *slog.Logger) (int, error) {
	resolved := make([]resolvedProvision, 0, len(inputs))
	seen := map[string]bool{}
	for _, in := range inputs {
		r, err := resolve(in)
		if err != nil {
			return 0, err
		}
		if seen[r.provisionID] {
			return 0, fmt.Errorf("provisioned agents contain a duplicate id %q", r.provisionID)
		}
		seen[r.provisionID] = true
		resolved = append(resolved, r)
	}
	for _, r := range resolved {
		if _, err := repo.UpsertProvisioned(db.ProvisionedAgent{
			ProvisionID: r.provisionID, TokenHash: token.Hash(r.token),
			Region: r.region, Provider: r.provider, Platform: r.platform, Label: r.label,
		}); err != nil {
			return 0, err
		}
	}
	if len(resolved) > 0 && log != nil {
		log.Info("applied provisioned agents from the boot manifest", "count", len(resolved))
	}
	return len(resolved), nil
}
