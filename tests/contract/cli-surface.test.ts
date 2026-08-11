import { describe, it, expect } from 'vitest';
import { CLI_SUBCOMMANDS } from '../../src/kernel/contracts/cli-surface.js';
describe('v2 CLI surface', () => {
  it('is exactly the 8 core subcommands + mode + codex shared-daemon control + the 4 runtime toggles', () => {
    expect([...CLI_SUBCOMMANDS].sort()).toEqual([
      'codex', 'desktop', 'hook', 'logs', 'mode', 'mute', 'run', 'safe', 'setup', 'start', 'status', 'stop', 'trust', 'url',
    ]);
  });
});
