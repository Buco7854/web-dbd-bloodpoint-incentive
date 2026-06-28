# syntax=docker/dockerfile:1

# ---- Build the SPA + agent bundle (Node) ----
FROM node:22-trixie-slim AS build-web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:web && npm run build:agent

# ---- Build the hub binary (Go, static / no cgo) ----
FROM golang:1.25-trixie AS build-hub
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /out/bloodpoint-hub ./cmd/hub

# ---- Production deps: agent (includes steam-user / steam-totp) ----
FROM node:22-trixie-slim AS deps-agent
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- Hub image (Go binary + SPA; serves the API, docs, and the site) ----
FROM debian:trixie-slim AS hub
ENV PORT=3000 \
    TZ=UTC \
    STATE_DIR=/app/data \
    DB_PATH=/app/data/bloodpoint.db \
    PUBLIC_DIR=/app/dist/public \
    APP_USER=app
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu ca-certificates curl tzdata \
  && rm -rf /var/lib/apt/lists/* \
  && useradd -r -m -d /home/app app
COPY docker-entrypoint.sh ./
COPY --from=build-hub /out/bloodpoint-hub /app/bloodpoint-hub
COPY --from=build-web /app/dist/public /app/dist/public
RUN mkdir -p /app/data && chown -R app:app /app && chmod +x /app/docker-entrypoint.sh /app/bloodpoint-hub
ENTRYPOINT ["/app/docker-entrypoint.sh"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3000}/healthz" || exit 1
CMD ["/app/bloodpoint-hub"]

# ---- Agent image (single-region poller, Node) ----
FROM node:22-trixie-slim AS agent
ENV NODE_ENV=production \
    TZ=UTC \
    STATE_DIR=/app/data \
    APP_USER=node
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/*
COPY docker-entrypoint.sh ./
COPY --from=deps-agent --chown=node:node /app/node_modules ./node_modules
COPY --from=build-web --chown=node:node /app/dist/agent ./dist/agent
COPY --chown=node:node package.json ./
RUN mkdir -p /app/data && chown -R node:node /app && chmod +x /app/docker-entrypoint.sh
ENTRYPOINT ["/app/docker-entrypoint.sh"]
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.AGENT_HEALTH_PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/agent/index.cjs"]
