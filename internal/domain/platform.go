// Package domain holds the hub's core types and pure helpers. It depends on no
// infrastructure so every other package can build on it.
package domain

// Platform is a DBD matchmaking platform. Incentives are per-platform.
type Platform string

const (
	PlatformWindows Platform = "Windows"
	PlatformEGS     Platform = "EGS"
	PlatformGRDK    Platform = "GRDK"
)

// PlatformMeta pairs a platform with its human label.
type PlatformMeta struct {
	Platform Platform `json:"platform"`
	Label    string   `json:"label"`
}

// Platforms is the canonical platform list, in display order.
var Platforms = []PlatformMeta{
	{Platform: PlatformWindows, Label: "Steam"},
	{Platform: PlatformEGS, Label: "Epic"},
	{Platform: PlatformGRDK, Label: "Microsoft Store"},
}

// DefaultPlatform is requested by the UI until the visitor picks another.
const DefaultPlatform = PlatformWindows

func IsKnownPlatform(p string) bool {
	for _, m := range Platforms {
		if string(m.Platform) == p {
			return true
		}
	}
	return false
}

// providerPlatform maps a DBD auth provider to the platform it reports.
var providerPlatform = map[string]Platform{
	"steam": PlatformWindows,
	"epic":  PlatformEGS,
	"grdk":  PlatformGRDK,
}

// supportedProviders are the providers with a working auth + version-discovery impl.
var supportedProviders = []string{"steam"}

func IsKnownProvider(p string) bool {
	_, ok := providerPlatform[p]
	return ok
}

func IsSupportedProvider(p string) bool {
	for _, s := range supportedProviders {
		if s == p {
			return true
		}
	}
	return false
}

func PlatformForProvider(p string) Platform { return providerPlatform[p] }

func SupportedProviders() []string { return append([]string(nil), supportedProviders...) }
