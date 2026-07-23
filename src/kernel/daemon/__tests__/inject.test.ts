import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionHost } from '../../pty/session-host.js';
import { bracketedPaste, injectInput } from '../inject.js';

// Per-session socket: a filesystem path on POSIX (kept directly in `dir`, no
// subdir), a named pipe on win32 (which has no unix sockets). basename(dir) is
// unique per mkdtemp, keeping the pipe name collision-free across tests.
const sessSock = (dir: string, name: string): string =>
  process.platform === 'win32' ? `\\\\.\\pipe\\tlive-t-${basename(dir)}-${name}` : join(dir, `${name}.sock`);

describe('bracketedPaste', () => {
  it('wraps text in paste markers and appends Enter', () => {
    const b = bracketedPaste('hi 你好').toString('utf8');
    expect(b.startsWith('\x1b[200~')).toBe(true);
    expect(b.endsWith('\x1b[201~\r')).toBe(true);
    expect(b).toContain('hi 你好');
  });

  it('strips embedded paste markers (no break-out / control-sequence injection)', () => {
    const evil = 'ok\x1b[201~rm -rf /\x1b[200~more';
    const b = bracketedPaste(evil).toString('utf8');
    // exactly one opening and one closing marker — the payload markers are gone
    expect(b.match(/\x1b\[200~/g)).toHaveLength(1);
    expect(b.match(/\x1b\[201~/g)).toHaveLength(1);
    expect(b).toContain('okrm -rf /more');
  });
});

describe('injectInput', () => {
  it('delivers text into the pty via the per-session socket', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tlive-inj-'));
    const sockPath = sessSock(dir, 'i1');
    // echo stdin back to stdout so we can observe delivery
    const host = new SessionHost({
      id: 'i1', cmd: process.execPath, args: ['-e', 'process.stdin.pipe(process.stdout)'],
      cwd: dir, sockPath, attachLocal: false,
    });
    await host.start();
    let seen = '';
    const done = new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`no echo: ${JSON.stringify(seen)}`)), 8000);
      // observe pty output through a second socket client
      // (attach so we receive Data broadcasts)
      import('node:net').then(({ createConnection }) => {
        import('../../web/stream-protocol.js').then(({ FrameDecoder, FrameType, encodeAttach }) => {
          const dec = new FrameDecoder();
          const sock = createConnection(sockPath, () => sock.write(encodeAttach(80, 24)));
          sock.on('data', (chunk: Buffer) => {
            for (const f of dec.push(chunk)) {
              if (f.type === FrameType.Data) {
                seen += f.payload.toString('utf8');
                if (seen.includes('INJECTED-TEXT')) { clearTimeout(t); sock.end(); resolve(); }
              }
            }
          });
          sock.on('error', reject);
        });
      });
    });
    await injectInput(sockPath, 'INJECTED-TEXT');
    await done;
    await host.stop();
  });

  it('rejects when the socket is gone', async () => {
    await expect(injectInput(sessSock(tmpdir(), 'nope-xyz'), 'x', 500)).rejects.toThrow();
  });
});
