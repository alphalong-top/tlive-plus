# Changelog

## [2.0.0](https://github.com/alphalong-top/tlive-plus/compare/v3.0.0...v2.0.0) (2026-08-17)


### ⚠ BREAKING CHANGES

* **mode:** approvals.holdSubagents is removed. Run `tlive mode all` to hold sub-agent approvals for a remote answer, and `tlive mode full` to go back. A stale key in config.json is ignored.

### Features

* add Codex session browsing and reliable Feishu continuation ([2c8ddef](https://github.com/alphalong-top/tlive-plus/commit/2c8ddef2f94ce42a515d56053147c214d6c45ee6))
* add status icons to Feishu messages ([cebfca2](https://github.com/alphalong-top/tlive-plus/commit/cebfca2c4d1ad106a48282462e10ce973640c8ca))
* **daemon:** log why each permission request was or wasn't held ([4ffac3f](https://github.com/alphalong-top/tlive-plus/commit/4ffac3f94bd5c6b7375a2f69f5920feccbc799b1))
* **mode:** posture ladder off|notify|full|all, settable from IM ([#67](https://github.com/alphalong-top/tlive-plus/issues/67)) ([5925c83](https://github.com/alphalong-top/tlive-plus/commit/5925c83ab7e9c318edc8cb49c0661001a5ae5242))
* retry transient Codex capacity failures ([9dd24d6](https://github.com/alphalong-top/tlive-plus/commit/9dd24d6a33a4a9a7c05971d4707aab8dc6fb4a50))
* show Feishu continuation prompts in receipt cards ([0c398e4](https://github.com/alphalong-top/tlive-plus/commit/0c398e41a304362fc3974a951f98db1bb422956d))
* **web:** answer AskUserQuestion from the dashboard ([#50](https://github.com/alphalong-top/tlive-plus/issues/50)) ([#52](https://github.com/alphalong-top/tlive-plus/issues/52)) ([69d0ea2](https://github.com/alphalong-top/tlive-plus/commit/69d0ea2e098f1b8663868967b925a4bd3bc27ad0))


### Bug Fixes

* **ask:** answer every question in an AskUserQuestion batch, not just the first ([#54](https://github.com/alphalong-top/tlive-plus/issues/54)) ([c2ff11a](https://github.com/alphalong-top/tlive-plus/commit/c2ff11aa4248ccd1f172093690678a074638868a))
* **codex:** bridge desktop over loopback websocket ([fe56994](https://github.com/alphalong-top/tlive-plus/commit/fe56994eefa41dd951d5818e364c5cb4c5416f41))
* **codex:** connect desktop over managed unix socket ([47a2f7b](https://github.com/alphalong-top/tlive-plus/commit/47a2f7bd974138570898ad9f83e78dca5f2a0986))
* **codex:** load shell environment for app server ([0cd6f08](https://github.com/alphalong-top/tlive-plus/commit/0cd6f085be9950766d5ae3e9223ce88cf9daa3dc))
* **codex:** prevent companion poll backlog ([426bb1d](https://github.com/alphalong-top/tlive-plus/commit/426bb1d13d2256213ab8228ccdb633fe93c13c24))
* **codex:** recover IM completion after daemon restart ([ef6fa17](https://github.com/alphalong-top/tlive-plus/commit/ef6fa17fdaa3dde781ce1485520c5199ec6203bb))
* **codex:** share app-server with desktop ([58098a8](https://github.com/alphalong-top/tlive-plus/commit/58098a8e1f9e3cb275e46eb208e0201d77627dfd))
* **daemon:** don't process.exit from the shutdown safety-net under vitest ([#45](https://github.com/alphalong-top/tlive-plus/issues/45)) ([e9a13d4](https://github.com/alphalong-top/tlive-plus/commit/e9a13d4f350b8cd9520bddc2408509ead959cd9c))
* **daemon:** drain held IPC requests on shutdown (defer/null) ([#45](https://github.com/alphalong-top/tlive-plus/issues/45)) ([9dbdbe3](https://github.com/alphalong-top/tlive-plus/commit/9dbdbe3bce9e197e8f75d8d84e110bc8f59a5f62))
* **deps:** node-pty 1.2.0-beta.14 — ships the linux prebuilds 1.1.0 lacks ([#55](https://github.com/alphalong-top/tlive-plus/issues/55)) ([672e568](https://github.com/alphalong-top/tlive-plus/commit/672e568a6af233839d862968233eb306a56ac954))
* expose and extend Codex auto retries ([94b5a70](https://github.com/alphalong-top/tlive-plus/commit/94b5a70a1d5b0d4e2b20a189065dafc30ede7793))
* **feishu:** keep complete code in turn cards ([5a7975a](https://github.com/alphalong-top/tlive-plus/commit/5a7975a1014a15a5b4d2df38c0687a7a2245211e))
* **feishu:** recover websocket DNS lookup ([a520185](https://github.com/alphalong-top/tlive-plus/commit/a52018531e75934bb5cbb73a17c326fdd15d30e2))
* **ipc:** drain connections gracefully on close, destroy only stragglers ([#45](https://github.com/alphalong-top/tlive-plus/issues/45)) ([eb08863](https://github.com/alphalong-top/tlive-plus/commit/eb08863931ea804ed01f2255aab10e56552ebceb))
* **ipc:** flush replies (end + delay) before destroy on close ([#45](https://github.com/alphalong-top/tlive-plus/issues/45)) ([b656b96](https://github.com/alphalong-top/tlive-plus/commit/b656b9688fa68ad36bf59f3405cac634dc1c74ce))
* **ipc:** force-close in-flight connections on server shutdown ([#45](https://github.com/alphalong-top/tlive-plus/issues/45)) ([0598a73](https://github.com/alphalong-top/tlive-plus/commit/0598a7390545b0fd2d89c8d3c5d2f60544c2e541))
* make Codex auto-retry cancellable ([38940f5](https://github.com/alphalong-top/tlive-plus/commit/38940f57f6fe713967f23fe24c9a86b8485c309b))
* **notify:** surface waiting permission prompts locally in notify mode ([#49](https://github.com/alphalong-top/tlive-plus/issues/49)) ([#51](https://github.com/alphalong-top/tlive-plus/issues/51)) ([df81b0a](https://github.com/alphalong-top/tlive-plus/commit/df81b0af22a3a0f385b4e8d92fd9e8600b459889))
* **permissions:** stop tlive from changing what CC asks, and from hiding why ([5523fef](https://github.com/alphalong-top/tlive-plus/commit/5523fefad9f9f2531c81929d11bb1d0bff53efe7))
* preserve Codex continuation cards on restart ([ef94dc6](https://github.com/alphalong-top/tlive-plus/commit/ef94dc626e94337b554d3a446835bc1f2c140609))
* **pty:** close the shadow-terminal lag so an attaching client loses no bytes ([ee2f6af](https://github.com/alphalong-top/tlive-plus/commit/ee2f6af2e2feecba84194a19419ef640d7251ac1)), closes [#64](https://github.com/alphalong-top/tlive-plus/issues/64)
* **pty:** guard node-pty's unlistened win32 conin socket, and harden Windows CI ([#63](https://github.com/alphalong-top/tlive-plus/issues/63)) ([77f8535](https://github.com/alphalong-top/tlive-plus/commit/77f85358880df10a163fa24277cd604e7c4088fb))
* resume Codex threads from stale Feishu cards ([01b909c](https://github.com/alphalong-top/tlive-plus/commit/01b909c8c75be1c41fde737644411258ff89a487))
* retry Codex rate limits with visible reasons ([cc72fd7](https://github.com/alphalong-top/tlive-plus/commit/cc72fd7958ec42925e3b00dcedb0dbb5289c6bba))
* retry Codex upstream stream disconnects ([864df56](https://github.com/alphalong-top/tlive-plus/commit/864df564431fd7e3043f4b4d0fed961cfa71d5dc))
* route Feishu replies back to Codex threads ([34a9968](https://github.com/alphalong-top/tlive-plus/commit/34a9968766e4e6f32a730c8a89298a87b045e08c))
* surface Codex turn failures in IM ([e6cf4ca](https://github.com/alphalong-top/tlive-plus/commit/e6cf4cae5aa119fff7d43955159bfe86a27a95a8))
* **win:** root-fix Windows CI teardown flake + make Windows a hard gate ([#45](https://github.com/alphalong-top/tlive-plus/issues/45)) ([2542986](https://github.com/alphalong-top/tlive-plus/commit/25429861d5265e27f70768c8bfc0bf13ffb17cf6))


### Continuous Integration

* **release:** anchor release-please + target stable 2.0.0 + drop v1-era dead files ([#53](https://github.com/alphalong-top/tlive-plus/issues/53)) ([3f6be98](https://github.com/alphalong-top/tlive-plus/commit/3f6be987648e5a552aac8da501dc325bd7a6f584))

## [3.0.0](https://github.com/y49/tlive/compare/v2.1.0...v3.0.0) (2026-07-30)


### ⚠ BREAKING CHANGES

* **mode:** approvals.holdSubagents is removed. Run `tlive mode all` to hold sub-agent approvals for a remote answer, and `tlive mode full` to go back. A stale key in config.json is ignored.

### Features

* **mode:** posture ladder off|notify|full|all, settable from IM ([#67](https://github.com/y49/tlive/issues/67)) ([5925c83](https://github.com/y49/tlive/commit/5925c83ab7e9c318edc8cb49c0661001a5ae5242))

## [2.1.0](https://github.com/y49/tlive/compare/v2.0.0...v2.1.0) (2026-07-29)


### Features

* **daemon:** log why each permission request was or wasn't held ([4ffac3f](https://github.com/y49/tlive/commit/4ffac3f94bd5c6b7375a2f69f5920feccbc799b1))


### Bug Fixes

* **permissions:** stop tlive from changing what CC asks, and from hiding why ([5523fef](https://github.com/y49/tlive/commit/5523fefad9f9f2531c81929d11bb1d0bff53efe7))
* **pty:** close the shadow-terminal lag so an attaching client loses no bytes ([ee2f6af](https://github.com/y49/tlive/commit/ee2f6af2e2feecba84194a19419ef640d7251ac1)), closes [#64](https://github.com/y49/tlive/issues/64)
* **pty:** guard node-pty's unlistened win32 conin socket, and harden Windows CI ([#63](https://github.com/y49/tlive/issues/63)) ([77f8535](https://github.com/y49/tlive/commit/77f85358880df10a163fa24277cd604e7c4088fb))

## [2.0.0](https://github.com/y49/tlive/compare/v2.0.0-beta.0...v2.0.0) (2026-07-27)


### Features

* **web:** answer AskUserQuestion from the dashboard ([#50](https://github.com/y49/tlive/issues/50)) ([#52](https://github.com/y49/tlive/issues/52)) ([69d0ea2](https://github.com/y49/tlive/commit/69d0ea2e098f1b8663868967b925a4bd3bc27ad0))


### Bug Fixes

* **ask:** answer every question in an AskUserQuestion batch, not just the first ([#54](https://github.com/y49/tlive/issues/54)) ([c2ff11a](https://github.com/y49/tlive/commit/c2ff11aa4248ccd1f172093690678a074638868a))
* **daemon:** don't process.exit from the shutdown safety-net under vitest ([#45](https://github.com/y49/tlive/issues/45)) ([e9a13d4](https://github.com/y49/tlive/commit/e9a13d4f350b8cd9520bddc2408509ead959cd9c))
* **daemon:** drain held IPC requests on shutdown (defer/null) ([#45](https://github.com/y49/tlive/issues/45)) ([9dbdbe3](https://github.com/y49/tlive/commit/9dbdbe3bce9e197e8f75d8d84e110bc8f59a5f62))
* **deps:** node-pty 1.2.0-beta.14 — ships the linux prebuilds 1.1.0 lacks ([#55](https://github.com/y49/tlive/issues/55)) ([672e568](https://github.com/y49/tlive/commit/672e568a6af233839d862968233eb306a56ac954))
* **ipc:** drain connections gracefully on close, destroy only stragglers ([#45](https://github.com/y49/tlive/issues/45)) ([eb08863](https://github.com/y49/tlive/commit/eb08863931ea804ed01f2255aab10e56552ebceb))
* **ipc:** flush replies (end + delay) before destroy on close ([#45](https://github.com/y49/tlive/issues/45)) ([b656b96](https://github.com/y49/tlive/commit/b656b9688fa68ad36bf59f3405cac634dc1c74ce))
* **ipc:** force-close in-flight connections on server shutdown ([#45](https://github.com/y49/tlive/issues/45)) ([0598a73](https://github.com/y49/tlive/commit/0598a7390545b0fd2d89c8d3c5d2f60544c2e541))
* **notify:** surface waiting permission prompts locally in notify mode ([#49](https://github.com/y49/tlive/issues/49)) ([#51](https://github.com/y49/tlive/issues/51)) ([df81b0a](https://github.com/y49/tlive/commit/df81b0af22a3a0f385b4e8d92fd9e8600b459889))
* **win:** root-fix Windows CI teardown flake + make Windows a hard gate ([#45](https://github.com/y49/tlive/issues/45)) ([2542986](https://github.com/y49/tlive/commit/25429861d5265e27f70768c8bfc0bf13ffb17cf6))


### Continuous Integration

* **release:** anchor release-please + target stable 2.0.0 + drop v1-era dead files ([#53](https://github.com/y49/tlive/issues/53)) ([3f6be98](https://github.com/y49/tlive/commit/3f6be987648e5a552aac8da501dc325bd7a6f584))

## Changelog

Generated by [release-please](https://github.com/googleapis/release-please)
from Conventional Commits — one section per released version. Don't hand-edit
it; write the commit subject you want to read here instead.

Everything before 2.0.0-beta.0, including the v0.x history and the narrative on
why v2 replaced the v1 SDK bridge, is frozen in
[`docs/changelog-archive.md`](docs/changelog-archive.md).
