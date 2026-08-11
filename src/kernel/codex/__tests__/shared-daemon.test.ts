import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CODEX_WS_URL_ENV,
  codexAppServerWsUrl,
  writeCodexDesktopSharedEnvAgent,
  writeSharedDaemonConfig,
} from '../shared-daemon.js';

describe('writeSharedDaemonConfig', () => {
  it('preserves existing config while enabling the shared daemon', () => {
    const home = mkdtempSync(join(tmpdir(), 'tlive-shared-'));
    writeFileSync(join(home, 'config.json'), JSON.stringify({ mode: 'full', codex: { autoRetry: { enabled: true } } }));

    writeSharedDaemonConfig(home, true);

    expect(JSON.parse(readFileSync(join(home, 'config.json'), 'utf-8'))).toEqual({
      mode: 'full',
      codex: { autoRetry: { enabled: true }, sharedDaemon: true },
    });
  });

  it('points Codex App directly at the managed unix app-server', () => {
    const home = mkdtempSync(join(tmpdir(), 'tlive-shared-app-'));
    const codexHome = join(home, '.codex');

    const path = writeCodexDesktopSharedEnvAgent(home, codexHome);
    const plist = readFileSync(path, 'utf-8');

    expect(codexAppServerWsUrl(codexHome)).toBe(`ws+unix:${codexHome}/app-server-control/app-server-control.sock:/`);
    expect(plist).toContain(`<string>${CODEX_WS_URL_ENV}</string>`);
    expect(plist).toContain(`<string>${codexAppServerWsUrl(codexHome)}</string>`);
    expect(plist).not.toContain('CODEX_APP_SERVER_USE_LOCAL_DAEMON');
  });
});
