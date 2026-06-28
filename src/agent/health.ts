import { createServer, type Server } from 'node:http';
import type { Logger } from '../common/logger.js';
import type { HubReportingSink } from './reporter.js';

/**
 * Minimal health endpoint so a container orchestrator can tell a wedged agent
 * (e.g. fatal auth error) from a healthy one. Returns 503 once polling has hit an
 * unrecoverable state, mirroring the hub's `/healthz` contract.
 */
export function startHealthServer(port: number, sink: HubReportingSink, log: Logger): Server {
  const server = createServer((req, res) => {
    if (req.url?.split('?')[0] !== '/healthz') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    const { status, reason, lastReportedAt } = sink.health();
    const healthy = status !== 'error';
    res.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(
      JSON.stringify({
        status: healthy ? 'ok' : 'unhealthy',
        pollerStatus: status,
        statusReason: reason,
        lastReportedAt,
        uptimeSeconds: Math.round(process.uptime()),
      }),
    );
  });
  server.listen(port, '0.0.0.0', () => log.info({ port }, 'agent health endpoint listening'));
  return server;
}
