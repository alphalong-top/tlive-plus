# Uninstalling / cleaning up tlive

[Back to Getting Started](getting-started.md)

## Uninstall (global npm install)

```bash
tlive stop                 # optional; the step below does it too
npm uninstall -g tlive
```

`npm uninstall` runs tlive's `preuninstall` hook, which **best-effort**:

- stops the daemon (`tlive stop`), and
- removes the vendor plugins registered by `tlive setup`
  (`claude plugin uninstall tlive@tlive`, `codex plugin remove tlive@tlive`).

Your **`~/.tlive` config and logs are preserved** so a reinstall picks up where
you left off. Nothing else is touched.

## Full purge (also remove config, logs, state)

```bash
rm -rf ~/.tlive                # config.json, web-token, daemon.log, inbox/, …
rm -f  ~/.local/bin/tlive      # only if you created a dev symlink to a repo build
```

## If the vendor plugin wasn't removed automatically

The `preuninstall` cleanup is best-effort and silently skips when the vendor CLI
is missing or on an older version. Remove the plugin by hand if `claude plugin
list` / `codex` still shows it:

```bash
claude plugin uninstall tlive@tlive
codex  plugin remove   tlive@tlive
```

Ran a **pre-plugin dev build** that wrote hooks directly into
`~/.claude/settings.json` / `~/.codex/hooks.json`? Remove those entries by hand —
see [manual-hooks.md](manual-hooks.md). tlive's plugin path never edits your
vendor config, but old direct-write entries would otherwise double-fire.

## Migrating from v0.x / v1.x to v2

v2.0 is a **breaking rewrite** with no automatic migration (see the warning at
the top of the [README](../README.md)) — it no longer drives sessions and no
longer reads the old config schema. Purge the old state before installing v2 so
the switch lands clean:

```bash
# 1. stop any old daemon
tlive stop 2>/dev/null || pkill -f tlive-daemon.mjs

# 2. drop v0.x/v1.x runtime state that v2 doesn't use
rm -f  ~/.tlive/{workspaces.json,daemon.lock,daemon.pid,daemon.sock,cost-rollups.jsonl}
rm -rf ~/.tlive/sessions
```

- The old `channels.*` config schema is **not read** by v2 (v2 uses
  `adapters.*` + top-level `allowedSenders` — see the
  [Telegram](setup-telegram.md) / [Feishu](setup-feishu.md) guides). Re-run
  `tlive setup` to write the new schema rather than hand-editing the old one.
- Old direct-write hooks: remove them per [manual-hooks.md](manual-hooks.md),
  then let `tlive setup` register the plugin.
- The last v1.0 (Agent-SDK bridge) release is preserved at git tag
  `v1.0-sdk-bridge` if you need to refer back to it.

Then install v2 and set up fresh:

```bash
npm i -g tlive
tlive setup
tlive start
```

## Windows

Paths live under `%USERPROFILE%\.tlive`; the daemon uses named pipes rather than
unix sockets, so the `daemon.sock` entry above doesn't apply. `npm uninstall -g
tlive` and the vendor-plugin removal work the same way.

---

Back to [Getting Started](getting-started.md) · [CLI command reference](commands.md).
