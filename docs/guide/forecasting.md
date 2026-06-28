# Forecasting model

Each region gets a next-24-hour, hourly forecast of its survivor and killer
bonuses. This page explains what the forecast is and how to read it, at a
conceptual level, not in code.

The forecast is available per region via the API
(`GET /api/v1/platforms/{platform}/regions/{region}/forecast`) and is what the
per-region page's forecast chart draws.

## What it predicts

Bloodpoint incentives move with player population, which is strongly seasonal: a
region tends to look similar at the same hour on the same kind of
day from one week to the next (a Saturday evening resembles other Saturday
evenings, a weekday morning resembles other weekday mornings).

The model exploits this. For each future hour it produces:

- a most-likely level (the median), and
- a p25–p75 band around it (the interquartile range), for each role.

Levels are quantized (bonuses come in discrete steps), and the model never
averages those discrete levels into something that can't actually occur. It
reports real levels and the spread between them.

## How it's built

The forecast blends two ideas:

1. **Seasonal climatology**: a day-of-week × hour-of-day picture of how the
   region usually behaves, computed in the region's local timezone
   (distinguishing weekday from weekend patterns). This captures the recurring
   weekly rhythm.
2. **Persistence**: the recent, current value carries information about the very
   near future, so the blend leans on where the region is *right now* as well as
   where it usually is.

These are combined with recency weighting: more recent history counts for
more than older history, so the forecast tracks gradual shifts in a region's
behaviour rather than treating months-old data as equally relevant.

The history the model trains on is governed by `FORECAST_WINDOW_DAYS` (84 days by
default), which is configured independently of the data retention window. See
[Configuration](./configuration#core).

## Confidence

Each forecast carries a confidence level (`high`, `medium`, or `low`) that
reflects how much history backs it. A region with months of consistent
readings yields a confident forecast. A region that's only recently gained
coverage, or has sparse history, yields a low-confidence one. Use it to judge how
much to trust the band.

## Hindcast: the model graded against reality

The forecast chart also shows a hindcast (what the model *would have
predicted* for the past day) drawn against the actual values that
occurred.

The hindcast is leak-free: when computing the prediction for a past hour, the
model only uses data it would have had *before* that hour, never the actual value
it's being compared to. That makes the hindcast an honest, visual check of how
well the model has been tracking reality recently. If the hindcast line hugs the
actuals, the forward forecast is more trustworthy. If it diverges, treat the
forecast with more caution.

## The forecast response

The endpoint returns the region, platform, when it was generated, the horizon,
the confidence level, and a list of hourly points, each with the median plus the
low/high band for both roles. See the
[API Reference](/operations/) for the exact schema, and
[Using the API](./api) for where it sits among the other
endpoints.
