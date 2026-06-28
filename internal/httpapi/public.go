package httpapi

import (
	"context"
	"fmt"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/buco7854/bloodpoint-incentives/internal/auth"
	"github.com/buco7854/bloodpoint-incentives/internal/domain"
	"github.com/buco7854/bloodpoint-incentives/internal/forecast"
)

// readCacheControl is the cache policy for public reads. A gated instance must not
// let shared caches serve protected data, so caching is disabled while REQUIRE_AUTH
// is on; otherwise the data is identical for everyone and safe to cache briefly.
func (s *Server) readCacheControl(maxAge int) string {
	if s.deps.AuthRepo != nil && auth.GetRequireAuth(s.deps.AuthRepo) {
		return "no-store"
	}
	return fmt.Sprintf("public, max-age=%d, stale-while-revalidate=%d", maxAge, maxAge*4)
}

func parsePlatform(p string) (domain.Platform, error) {
	if !domain.IsKnownPlatform(p) {
		return "", huma.Error404NotFound("unknown platform")
	}
	return domain.Platform(p), nil
}

func requireRegion(region string) error {
	if !domain.IsKnownRegion(region) {
		return huma.Error404NotFound("unknown region")
	}
	return nil
}

type incentivesInput struct {
	Platform string `path:"platform" enum:"Windows,EGS,GRDK" doc:"Matchmaking platform"`
}

type incentivesOutput struct {
	CacheControl string                   `header:"Cache-Control"`
	Body         domain.IncentivesPayload `contentType:"application/json"`
}

type metaOutput struct {
	CacheControl string          `header:"Cache-Control"`
	Body         domain.SiteMeta `contentType:"application/json"`
}

type coverageOutput struct {
	CacheControl string                 `header:"Cache-Control"`
	Body         domain.CoveragePayload `contentType:"application/json"`
}

type historyInput struct {
	Platform string `path:"platform" enum:"Windows,EGS,GRDK"`
	Region   string `path:"region" doc:"Region id, e.g. eu-central-1"`
	From     int64  `query:"from" doc:"Window start (epoch ms); defaults to 24h before 'to'"`
	To       int64  `query:"to" doc:"Window end (epoch ms); defaults to now"`
}

type historyOutput struct {
	CacheControl string                     `header:"Cache-Control"`
	Body         domain.HistoryRangePayload `contentType:"application/json"`
}

type activityInput struct {
	Platform string `path:"platform" enum:"Windows,EGS,GRDK"`
	Region   string `path:"region"`
	Limit    int    `query:"limit" default:"10" minimum:"1" maximum:"50" doc:"Max entries (1-50)"`
}

type activityOutput struct {
	CacheControl string                       `header:"Cache-Control"`
	Body         domain.RegionActivityPayload `contentType:"application/json"`
}

type forecastInput struct {
	Platform string `path:"platform" enum:"Windows,EGS,GRDK"`
	Region   string `path:"region"`
}

// forecastBody is the forecast response: future points + leak-free hindcast + actuals.
type forecastBody struct {
	Region       string              `json:"region"`
	Platform     domain.Platform     `json:"platform"`
	GeneratedAt  int64               `json:"generatedAt"`
	HorizonHours int                 `json:"horizonHours"`
	Confidence   forecast.Confidence `json:"confidence"`
	Points       []forecast.Point    `json:"points"`
	Past         []forecast.Point    `json:"past"`
	Actual       []forecast.ActualPt `json:"actual"`
}

type forecastOutput struct {
	CacheControl string       `header:"Cache-Control"`
	Body         forecastBody `contentType:"application/json"`
}

func (s *Server) registerPublic() {
	huma.Register(s.API, huma.Operation{
		OperationID: "get-incentives",
		Method:      "GET",
		Path:        "/api/v1/platforms/{platform}/incentives",
		Summary:     "Current incentives for a platform",
		Tags:        []string{"incentives"},
		Security:    readSecurity,
		Middlewares: huma.Middlewares{s.mwReadGate},
	}, func(ctx context.Context, in *incentivesInput) (*incentivesOutput, error) {
		platform, err := parsePlatform(in.Platform)
		if err != nil {
			return nil, err
		}
		return &incentivesOutput{CacheControl: s.readCacheControl(15), Body: s.deps.Store.Incentives(platform, time.Now())}, nil
	})

	huma.Register(s.API, huma.Operation{
		OperationID: "get-coverage",
		Method:      "GET",
		Path:        "/api/v1/platforms/{platform}/coverage",
		Summary:     "Agent coverage per region for a platform",
		Tags:        []string{"incentives"},
		Security:    readSecurity,
		Middlewares: huma.Middlewares{s.mwReadGate},
	}, func(ctx context.Context, in *incentivesInput) (*coverageOutput, error) {
		platform, err := parsePlatform(in.Platform)
		if err != nil {
			return nil, err
		}
		return &coverageOutput{CacheControl: s.readCacheControl(30), Body: s.deps.Store.Coverage(platform)}, nil
	})

	huma.Register(s.API, huma.Operation{
		OperationID: "get-meta",
		Method:      "GET",
		Path:        "/api/v1/meta",
		Summary:     "Hub-wide UI and configuration metadata",
		Tags:        []string{"system"},
		Security:    readSecurity,
		Middlewares: huma.Middlewares{s.mwReadGate},
	}, func(ctx context.Context, _ *struct{}) (*metaOutput, error) {
		return &metaOutput{CacheControl: s.readCacheControl(120), Body: s.deps.Store.SiteMeta()}, nil
	})

	huma.Register(s.API, huma.Operation{
		OperationID: "get-region-history",
		Method:      "GET",
		Path:        "/api/v1/platforms/{platform}/regions/{region}/history",
		Summary:     "Adaptive-resolution history for a region",
		Tags:        []string{"incentives"},
		Security:    readSecurity,
		Middlewares: huma.Middlewares{s.mwReadGate},
	}, func(ctx context.Context, in *historyInput) (*historyOutput, error) {
		platform, err := parsePlatform(in.Platform)
		if err != nil {
			return nil, err
		}
		if err := requireRegion(in.Region); err != nil {
			return nil, err
		}
		now := time.Now().UnixMilli()
		to := now
		if in.To > 0 && in.To < now {
			to = in.To
		}
		from := to - 24*60*60*1000
		if in.From > 0 {
			from = in.From
		}
		if from > to {
			from = to - 24*60*60*1000
		}
		retentionMs := int64(s.deps.Config.DataRetentionDays) * 24 * 60 * 60 * 1000
		if to-from > retentionMs {
			from = to - retentionMs
		}

		out := &historyOutput{CacheControl: s.readCacheControl(60)}
		out.Body = domain.HistoryRangePayload{Region: in.Region, Platform: platform, Resolution: domain.ResolutionRaw, Points: []domain.HistoryPoint{}}
		if s.deps.Readings != nil {
			rng, err := s.deps.Readings.RangeSeries(platform, in.Region, from, to)
			if err != nil {
				return nil, huma.Error500InternalServerError("history query failed")
			}
			out.Body.Resolution = rng.Resolution
			out.Body.BucketMs = rng.BucketMs
			out.Body.Points = rng.Points
			if ext, _ := s.deps.Readings.Extent(platform, in.Region); ext != nil {
				out.Body.FirstAt = &ext[0]
				out.Body.LastAt = &ext[1]
			}
		}
		return out, nil
	})

	huma.Register(s.API, huma.Operation{
		OperationID: "get-region-activity",
		Method:      "GET",
		Path:        "/api/v1/platforms/{platform}/regions/{region}/activity",
		Summary:     "Recent readings and change log for a region",
		Tags:        []string{"incentives"},
		Security:    readSecurity,
		Middlewares: huma.Middlewares{s.mwReadGate},
	}, func(ctx context.Context, in *activityInput) (*activityOutput, error) {
		platform, err := parsePlatform(in.Platform)
		if err != nil {
			return nil, err
		}
		if err := requireRegion(in.Region); err != nil {
			return nil, err
		}
		limit := in.Limit
		out := &activityOutput{CacheControl: s.readCacheControl(30)}
		out.Body = domain.RegionActivityPayload{Region: in.Region, Platform: platform, Recent: []domain.ReadingEntry{}, Changes: []domain.ReadingEntry{}}
		if s.deps.Readings != nil {
			recent, err := s.deps.Readings.Recent(platform, in.Region, limit)
			if err != nil {
				return nil, huma.Error500InternalServerError("activity query failed")
			}
			changes, err := s.deps.Readings.Changes(platform, in.Region, limit)
			if err != nil {
				return nil, huma.Error500InternalServerError("activity query failed")
			}
			out.Body.Recent = recent
			out.Body.Changes = changes
		}
		return out, nil
	})

	huma.Register(s.API, huma.Operation{
		OperationID: "get-region-forecast",
		Method:      "GET",
		Path:        "/api/v1/platforms/{platform}/regions/{region}/forecast",
		Summary:     "Next-24h forecast with leak-free hindcast for a region",
		Tags:        []string{"incentives"},
		Security:    readSecurity,
		Middlewares: huma.Middlewares{s.mwReadGate},
	}, func(ctx context.Context, in *forecastInput) (*forecastOutput, error) {
		platform, err := parsePlatform(in.Platform)
		if err != nil {
			return nil, err
		}
		if err := requireRegion(in.Region); err != nil {
			return nil, err
		}
		return s.buildForecast(platform, in.Region)
	})
}

func (s *Server) buildForecast(platform domain.Platform, region string) (*forecastOutput, error) {
	out := &forecastOutput{CacheControl: s.readCacheControl(300)}
	out.Body = forecastBody{
		Region: region, Platform: platform, GeneratedAt: time.Now().UnixMilli(),
		HorizonHours: 24, Confidence: forecast.ConfidenceLow,
		Points: []forecast.Point{}, Past: []forecast.Point{}, Actual: []forecast.ActualPt{},
	}
	if s.deps.Readings == nil {
		return out, nil
	}
	meta, _ := domain.RegionMetaFor(region)
	tz := meta.TZ
	if tz == "" {
		tz = "UTC"
	}
	now := time.Now().UnixMilli()
	windowMs := int64(s.deps.Config.ForecastWindowDays) * 24 * 60 * 60 * 1000
	rows, err := s.deps.Readings.ReadingsSince(platform, region, now-windowMs)
	if err != nil {
		return nil, huma.Error500InternalServerError("forecast query failed")
	}
	result := forecast.Forecast(rows, tz, now)
	out.Body.HorizonHours = result.HorizonHours
	out.Body.Confidence = result.Confidence
	out.Body.Points = result.Points

	// Leak-free hindcast: one forecast made 24h ago, projected across the past day.
	dayAgo := now - 24*60*60*1000
	var before []forecast.RawReading
	for _, r := range rows {
		if r.T <= dayAgo {
			before = append(before, r)
		}
	}
	if len(before) > 0 {
		out.Body.Past = forecast.Forecast(before, tz, dayAgo).Points
	}
	for _, r := range rows {
		if r.T >= dayAgo {
			out.Body.Actual = append(out.Body.Actual, forecast.ActualPt{T: r.T, Survivor: r.Survivor, Killer: r.Killer})
		}
	}
	return out, nil
}
