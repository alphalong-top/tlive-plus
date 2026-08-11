import { execFile as nodeExecFile } from 'node:child_process';
import { createServer, connect as netConnect, type Server } from 'node:net';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { CODEX_LOCAL_DAEMON_ENV, CODEX_WS_URL_ENV } from './shared-daemon.js';

const execFile = promisify(nodeExecFile);

async function waitForUnixSocket(path: string): Promise<void> {
  for (let i = 0; i < 25; i++) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = netConnect(path);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
    });
    if (connected) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`managed Codex app-server socket is unavailable: ${path}`);
}

export async function startTcpUnixBridge(sockPath: string, host: string, port: number): Promise<Server> {
  await waitForUnixSocket(sockPath);
  const server = createServer((client) => {
    const upstream = netConnect(sockPath);
    const close = () => {
      client.destroy();
      upstream.destroy();
    };
    client.once('error', close);
    upstream.once('error', close);
    client.pipe(upstream).pipe(client);
  });
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve();
    });
  });
  return server;
}

async function main(): Promise<void> {
  const [sockPath, host, portText] = process.argv.slice(2);
  const port = Number(portText);
  if (!sockPath || !host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Usage: tlive-codex-bridge <unix-socket> <host> <port>');
  }
  const server = await startTcpUnixBridge(sockPath, host, port);
  await execFile('/bin/launchctl', ['setenv', CODEX_WS_URL_ENV, `ws://${host}:${port}`]);
  await execFile('/bin/launchctl', ['unsetenv', CODEX_LOCAL_DAEMON_ENV]);
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
}
