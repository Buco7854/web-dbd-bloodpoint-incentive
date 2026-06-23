import { randomFillSync } from 'node:crypto';
import { crc32 } from 'node:zlib';

// Web-API auth ticket shape (mirrors SteamKit2's GetAuthTicketForWebApi).
const SESSION_HEADER_SIZE = 24;
const TICKET_TYPE_WEBAPI = 5;
const WEB_API_TICKET_SIZE = 2560;

export function ipToUint32(ip: unknown): number {
  if (typeof ip !== 'string') return 0;
  const p = ip.split('.').map((n) => Number.parseInt(n, 10));
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n))) return 0;
  return ((((p[0] ?? 0) << 24) >>> 0) + ((p[1] ?? 0) << 16) + ((p[2] ?? 0) << 8) + (p[3] ?? 0)) >>> 0;
}

export interface WebApiTicketParts {
  /** 20-byte GC token from CMsgClientGameConnectTokens. */
  gcToken: Buffer;
  /** App ownership ticket bytes. */
  ownership: Buffer;
  publicIp: string | null;
  connectedMs: number;
  connectionCount: number;
  identity: string;
}

export interface WebApiTicket {
  /** The padded ticket blob sent to the server (hex-encode for the token). */
  full: Buffer;
  /** GC token + session header (the bytes Steam CRCs and we register). */
  authTicket: Buffer;
  ticketCrc: number;
  /** "str:<identity>\0", goes in CMsgAuthTicket.server_secret. */
  serverSecret: Buffer;
}

/**
 * Builds the bytes of a Steam Web-API auth ticket. Identical to the auth-session
 * ticket except the session header carries the web-api ticket type and the blob
 * is padded to the web-api size; the identity is not in the bytes (it rides in
 * server_secret on the ClientAuthList registration).
 */
export function buildWebApiTicket(parts: WebApiTicketParts): WebApiTicket {
  const { gcToken, ownership } = parts;

  // [gcLen][gcToken][24][unknown=1][ticketType][ip][0][timestamp][connCount][ownLen][ownership]
  const head = Buffer.alloc(4 + gcToken.length + 4 + SESSION_HEADER_SIZE + 4);
  let o = head.writeUInt32LE(gcToken.length, 0);
  o += gcToken.copy(head, o);
  o = head.writeUInt32LE(SESSION_HEADER_SIZE, o);
  o = head.writeUInt32LE(1, o);
  o = head.writeUInt32LE(TICKET_TYPE_WEBAPI, o);
  o = head.writeUInt32LE(ipToUint32(parts.publicIp), o);
  o = head.writeUInt32LE(0, o);
  o = head.writeUInt32LE(parts.connectedMs >>> 0, o);
  o = head.writeUInt32LE(parts.connectionCount >>> 0, o);
  head.writeUInt32LE(ownership.length, o);
  const core = Buffer.concat([head, ownership]);

  const authTicket = Buffer.from(core.subarray(0, 4 + gcToken.length + 4 + SESSION_HEADER_SIZE));
  const ticketCrc = crc32(authTicket) >>> 0;

  const size = Math.max(core.length, WEB_API_TICKET_SIZE);
  const full = Buffer.alloc(size);
  core.copy(full, 0);
  if (size > core.length) randomFillSync(full, core.length, size - core.length);

  return {
    full,
    authTicket,
    ticketCrc,
    serverSecret: Buffer.from(`str:${parts.identity}\0`, 'utf8'),
  };
}
