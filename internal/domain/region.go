package domain

// RegionMeta is static metadata for one matchmaking region.
type RegionMeta struct {
	Region      string `json:"region"`
	DisplayName string `json:"displayName"`
	Flag        string `json:"flag"`
	// TZ is a representative IANA timezone, used to model local-time seasonality.
	TZ string `json:"-"`
}

// Regions is the canonical region list (BHVR ids + our labels/flags/timezones).
var Regions = []RegionMeta{
	{"eu-west-1", "EU West (Ireland)", "🇮🇪", "Europe/Dublin"},
	{"eu-west-2", "EU West (London)", "🇬🇧", "Europe/London"},
	{"eu-central-1", "EU Central (Frankfurt)", "🇩🇪", "Europe/Berlin"},
	{"us-east-1", "US East (N. Virginia)", "🇺🇸", "America/New_York"},
	{"us-east-2", "US East (Ohio)", "🇺🇸", "America/New_York"},
	{"us-west-1", "US West (N. California)", "🇺🇸", "America/Los_Angeles"},
	{"us-west-2", "US West (Oregon)", "🇺🇸", "America/Los_Angeles"},
	{"ca-central-1", "Canada (Montreal)", "🇨🇦", "America/Toronto"},
	{"sa-east-1", "South America (São Paulo)", "🇧🇷", "America/Sao_Paulo"},
	{"ap-southeast-1", "SE Asia (Singapore)", "🇸🇬", "Asia/Singapore"},
	{"ap-southeast-2", "Oceania (Sydney)", "🇦🇺", "Australia/Sydney"},
	{"ap-northeast-1", "Asia (Tokyo)", "🇯🇵", "Asia/Tokyo"},
	{"ap-northeast-2", "Asia (Seoul)", "🇰🇷", "Asia/Seoul"},
	{"ap-east-1", "Asia (Hong Kong)", "🇭🇰", "Asia/Hong_Kong"},
	{"ap-south-1", "Asia (Mumbai)", "🇮🇳", "Asia/Kolkata"},
}

var (
	regionIndex = func() map[string]RegionMeta {
		m := make(map[string]RegionMeta, len(Regions))
		for _, r := range Regions {
			m[r.Region] = r
		}
		return m
	}()
	regionOrder = func() map[string]int {
		m := make(map[string]int, len(Regions))
		for i, r := range Regions {
			m[r.Region] = i
		}
		return m
	}()
)

// RegionMetaFor returns the metadata for a region id (ok=false if unknown).
func RegionMetaFor(region string) (RegionMeta, bool) {
	m, ok := regionIndex[region]
	return m, ok
}

func IsKnownRegion(region string) bool {
	_, ok := regionIndex[region]
	return ok
}

// AllRegionIDs returns every region id in canonical order.
func AllRegionIDs() []string {
	ids := make([]string, len(Regions))
	for i, r := range Regions {
		ids[i] = r.Region
	}
	return ids
}

// RegionOrder is the canonical sort index for a region (0 if unknown).
func RegionOrder(region string) int { return regionOrder[region] }
