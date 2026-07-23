# Releasing tlive

Maintainer runbook. v2 ships to a small group first via an npm **`beta`
dist-tag**, then gets promoted to `latest` for the public launch.

## Pre-publish checklist

```bash
npm run ci                       # typecheck + tests + build (must be green)
npm pack --dry-run               # confirm the tarball contents (see below)
```

- The tarball **must** contain both `dist/src/` (CLI + daemon) and `dist/web/`
  (dashboard + terminal assets). The daemon serves `dist/web` at runtime, so a
  tarball missing it installs a broken web feature. This is why `package.json`
  `files` includes `dist/` (not just `dist/src/`).
- If anything under `plugins/**` changed, both bundled `plugin.json` versions
  must be bumped in lockstep and the lock refreshed
  (`node scripts/plugin-lock.mjs --update`) — enforced by
  `plugin-consistency.test.ts`.

## Beta release (npm `beta` dist-tag)

```bash
npm version 2.0.0-beta.0 --no-git-tag-version   # prerelease; leaves `latest` alone
npm run ci
npm publish --tag beta
npm dist-tag ls tlive                            # expect: latest -> 0.8.0, beta -> 2.0.0-beta.0
```

Testers install with:

```bash
npm i -g tlive@beta          # persistent global install (the hooks need it)
# or, for a quick one-off bootstrap:
npx tlive@beta setup
```

Subsequent betas: bump the prerelease (`2.0.0-beta.1`, …) and
`npm publish --tag beta` again.

## Promote to GA (`latest`)

When v2 is ready for everyone:

```bash
npm version 2.0.0 --no-git-tag-version
npm run ci
npm publish                  # publishes 2.0.0 as `latest`
```

(If `2.0.0` is already on the registry under another tag, promote instead of
republishing: `npm dist-tag add tlive@2.0.0 latest`.)

Then drop the beta scaffolding from the docs: the `> [!NOTE] v2 is in beta`
blocks and the `@beta` suffixes in `README.md`, `README_CN.md`, and
`docs/getting-started{,-cn}.md`.

## `release-please` caveat

The repo has a `release-please--branches--main--components--tlive` branch:
release-please auto-manages the version + `CHANGELOG.md` on `main` from
conventional commits, and opens a release PR.

- Manual `npm version` bumps for the beta can drift from what release-please
  expects. During the manual v2 beta, either **(a)** publish manually (as above)
  and reconcile release-please when going GA, or **(b)** pause release-please
  until GA.
- Don't hand-edit the release-please branch — it's bot-managed and will be
  recreated if deleted.

## Notes

- `preuninstall` stops the daemon and removes the vendor plugins on
  `npm uninstall -g tlive`; see [uninstall.md](uninstall.md).
- The GitHub install path (`claude plugin marketplace add y49/tlive`) pulls the
  plugin straight from the repo's root `marketplace.json` and needs no npm
  publish — handy for testers who prefer not to use the beta tag.
