import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crc32 } from 'node:zlib';
import { buildWebApiTicket, ipToUint32 } from './webApiTicket.js';

const u32 = (buf: Buffer, off: number): number => buf.readUInt32LE(off);

test('buildWebApiTicket produces the SteamKit2 web-api layout', () => {
  const gcToken = Buffer.alloc(20, 0xab); // GC tokens are 20 bytes
  const ownership = Buffer.alloc(40, 0xcd);
  const t = buildWebApiTicket({
    gcToken,
    ownership,
    publicIp: '1.2.3.4',
    connectedMs: 1234,
    connectionCount: 7,
    identity: 'KRAKEN_DBD',
  });

  // Core (unpadded) layout.
  assert.equal(u32(t.full, 0), 20, 'gc token length');
  assert.deepEqual(t.full.subarray(4, 24), gcToken, 'gc token bytes');
  assert.equal(u32(t.full, 24), 24, 'session header size');
  assert.equal(u32(t.full, 28), 1, 'unknown = 1');
  assert.equal(u32(t.full, 32), 5, 'web-api ticket type');
  assert.equal(u32(t.full, 36), ipToUint32('1.2.3.4'), 'external ip');
  assert.equal(u32(t.full, 40), 0, 'filler');
  assert.equal(u32(t.full, 44), 1234, 'connected ms');
  assert.equal(u32(t.full, 48), 7, 'connection count');
  assert.equal(u32(t.full, 52), ownership.length, 'ownership length prefix');
  assert.deepEqual(t.full.subarray(56, 56 + ownership.length), ownership, 'ownership bytes');

  // authTicket = first 52 bytes; crc matches.
  assert.equal(t.authTicket.length, 52);
  assert.deepEqual(t.authTicket, t.full.subarray(0, 52));
  assert.equal(t.ticketCrc, crc32(t.authTicket) >>> 0);

  // Identity rides in server_secret, padded to the web-api size.
  assert.equal(t.serverSecret.toString('utf8'), 'str:KRAKEN_DBD\0');
  assert.equal(t.full.length, 2560);
});

test('buildWebApiTicket does not shrink tickets larger than the web-api size', () => {
  const t = buildWebApiTicket({
    gcToken: Buffer.alloc(20),
    ownership: Buffer.alloc(3000),
    publicIp: null,
    connectedMs: 0,
    connectionCount: 1,
    identity: 'X',
  });
  assert.ok(t.full.length >= 4 + 20 + 4 + 24 + 4 + 3000);
});

test('ipToUint32 handles bad input', () => {
  assert.equal(ipToUint32(null), 0);
  assert.equal(ipToUint32('not.an.ip'), 0);
  assert.equal(ipToUint32('255.255.255.255'), 0xffffffff);
});
