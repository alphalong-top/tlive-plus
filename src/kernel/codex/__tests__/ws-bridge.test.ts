import { createServer, connect, type AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { startTcpUnixBridge } from '../ws-bridge-main.js';

describe('startTcpUnixBridge', () => {
  it('forwards raw TCP bytes to the managed unix socket', async () => {
    const sockPath = join(mkdtempSync(join(tmpdir(), 'tlive-codex-bridge-')), 'app-server.sock');
    const upstream = createServer((socket) => socket.pipe(socket));
    await new Promise<void>((resolve) => upstream.listen(sockPath, resolve));
    const bridge = await startTcpUnixBridge(sockPath, '127.0.0.1', 0);
    const port = (bridge.address() as AddressInfo).port;

    const reply = await new Promise<string>((resolve, reject) => {
      const client = connect(port, '127.0.0.1', () => client.write('ping'));
      client.once('data', (data) => { client.destroy(); resolve(data.toString()); });
      client.once('error', reject);
    });

    expect(reply).toBe('ping');
    await Promise.all([
      new Promise<void>((resolve) => bridge.close(() => resolve())),
      new Promise<void>((resolve) => upstream.close(() => resolve())),
    ]);
  });
});
