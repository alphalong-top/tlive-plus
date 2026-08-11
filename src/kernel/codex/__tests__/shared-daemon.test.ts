import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSharedDaemonConfig } from '../shared-daemon.js';

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
});
