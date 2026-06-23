import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { HealthPayload } from '../../shared/types.js';
import type { AppConfig } from '../config.js';
import type { Logger } from '../logger.js';
import type { IncentiveCache } from '../poll/cache.js';
import { registerAccessAuth } from './accessAuth.js';

export interface ServerDeps {
  config: AppConfig;
  cache: IncentiveCache;
  publicDir: string;
  log: Logger;
}

/** Builds the Fastify app: the cache-only API, the health check, and the SPA. */
export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const { config, cache, publicDir, log } = deps;
  const app = Fastify({ logger: false, trustProxy: true, bodyLimit: 64 * 1024 });

  registerAccessAuth(app, config, log);

  app.get('/healthz', async (_req, reply) => {
    const healthy = cache.pollerStatus !== 'error';
    const payload: HealthPayload = {
      status: healthy ? 'ok' : 'unhealthy',
      uptimeSeconds: Math.round(process.uptime()),
      cacheAgeSeconds: cache.cacheAgeSeconds(),
      pollerStatus: cache.pollerStatus,
      regionsCached: cache.regionCount,
    };
    return reply
      .code(healthy ? 200 : 503)
      .header('cache-control', 'no-store')
      .send(payload);
  });

  app.get('/api/incentives', async (_req, reply) => {
    return reply.header('cache-control', 'no-store').send(cache.snapshot());
  });

  // In production the built SPA lives next to the server bundle. In dev it is
  // served by Vite, so skip static wiring when the directory is absent.
  const hasStatic = existsSync(publicDir);
  if (hasStatic) {
    await app.register(fastifyStatic, {
      root: publicDir,
      index: ['index.html'],
      wildcard: false,
      cacheControl: true,
      maxAge: '1h',
    });
  } else {
    log.warn({ publicDir }, 'static SPA directory not found; serving API only (dev mode?)');
  }

  // SPA fallback for client-side routes; everything else 404s as JSON.
  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0] ?? '/';
    if (hasStatic && req.method === 'GET' && !path.startsWith('/api') && path !== '/healthz') {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not found' });
  });

  return app;
}
