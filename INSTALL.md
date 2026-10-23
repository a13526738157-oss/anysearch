# Source Installation

> Source instructions with one bounded synthetic reproduction recorded in TESTING.md. A non-author executor installed and built a reviewed copy on an existing Windows host; this is not clean-machine OS, real Chrome/Codex setup or release acceptance. These factual documentation updates await separate review. Do not apply settings without the relevant explicit authorization.

## Target And Prerequisites

| Item | Source constraint and evidence boundary |
| --- | --- |
| OS | Windows is the first target. Portable packaging requires Windows x64. An exact supported Windows release/build matrix has not been frozen or reproduced. |
| Node | External Node `>=24.18.0 <25`, as declared in package metadata. Node provides `node:sqlite` and direct erasable TypeScript execution. A declared range is not a tested patch-version matrix. |
| Electron | The pinned npm package is `44.9.0`; its runtime is a separate installation prerequisite. `npm ci` alone is not proof that the executable exists. Do not substitute a global runtime or set `ELECTRON_RUN_AS_NODE` for desktop start. |
| Chrome | Stable ordinary profile; manifest minimum Chrome 120, not a measured compatibility matrix. Incognito/guest is excluded. |
| Shell | PowerShell for these examples. Codex config apply explicitly requires PowerShell 7.2+. Credential ACL and native activation helper use system Windows PowerShell. |
| Agent host | Codex is the first MCP host. No host-version compatibility promise or actual host acceptance is established for this source cut. |
| Files | A reviewed source export with its matching lockfile, public package metadata, `tsconfig.json`, source/build scripts and public documents. Repository name is `anysearch`; repository availability alone does not establish an accepted release. |

Choose a new writable local source directory without old user databases/credentials, separate from old versions and other projects. Generated native launchers reject shell-control characters; use a simple local path without `&`, parentheses, `%`, `!` or reparse points. Do not copy another user's state. Administrator access is not part of this workflow.

## 1. Dependencies, Build And Start

### Node-Only Synthetic Workflow

For an explicitly approved synthetic source-preview check, use a separately reviewed copy in a new temporary directory, not this development workspace or its dependencies:

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
node --test tests/source-preview-workflow.test.ts
```

This installs the locked npm dependency tree while suppressing dependency lifecycle scripts. Native DLLs or other runtime files already inside those npm tarballs are still acquired: `--ignore-scripts` does not remove them. It does not run the separate Electron installer, ONNX installation scripts, model downloads, Chrome registration or Codex configuration. Registry package downloads still occur and require the approved network scope. Do not enable lifecycle scripts or borrow another workspace's `node_modules` to conceal a failure of this Node-only check; full runtime setup is a separate approved scope below.

The workflow uses the copy's production pairing/synchronization broker and MCP server with a synthetic SDK host, then tests bounded references and revocation. It is not actual Chrome/Codex and does not itself test Electron. The recorded SDK run passed after the full installation below; the ignore-scripts-only SDK path was not separately rerun. A command here is not proof of another environment's result.

### Desktop Installation Is A Different Scope

Only after dependency-network access and process execution are approved, open PowerShell in the reviewed export root:

```powershell
node --version
npm ci
node .\node_modules\electron\install.js
npm run build
npm run desktop
```

`npm ci` accesses the lockfile's registries, installs third-party code (including native files in package tarballs) and can run lifecycle scripts such as ONNX runtime setup. Do not infer that it installed Electron's executable: the currently inspected pinned Electron package exposes a separate `install.js` entry instead of a postinstall script. The explicit command above obtains the pinned runtime if absent and writes its package-local installation files. It is network/code execution, not a no-write preview or model setup. Inspect the installed pinned script, default download origin and package-supplied checksums before approving it; inherited mirror/override/proxy variables can change its effects. Independent acceptance must not reuse another project's Electron runtime or download cache as evidence of a clean installation.

For a controlled acceptance run, a non-author executor may first use `npm ci --ignore-scripts` to inspect the fetched locked installers, then run the separately approved normal installation and Electron installer in that same owned temporary environment. Record both phases; the inspection phase is not full desktop installation evidence. Do not silently switch registries, runtime or versions on failure. No check is attached to the public install/build scripts by this kit.

The inspected Electron package attempts its installer when `require('electron')` cannot find its executable, so requiring that npm entry is not a read-only availability probe. The source desktop launcher instead resolves package metadata and reads the installed `path.txt`/executable without evaluating that entry; missing or invalid files must return a dependency error rather than install a replacement. Complete the explicit reviewed runtime setup first. Controlled checks must independently verify this no-implicit-install behavior rather than assume it from a successful launch.

`build` generates desktop, Native host, MCP, extension and portable-helper artifacts in `dist`; it does not package/install a release or change Chrome/Codex settings. `desktop` starts Electron and initializes `.local/desktop` with its SQLite index, caches and Chromium session data. A startup receipt can report ready/already-running or a bounded error; ready is not UI acceptance. A timeout may leave a process alive: inspect/quit this instance rather than repeatedly spawning it. Use the tray menu to quit, since hiding a window is not necessarily exit.

Normal desktop startup can read only profile directory keys/display names from default Stable Chrome Local State for discovery, not bookmarks/history/cookies or Google identity. It can start the local Windows focus helper; double Shift remains disabled until explicitly confirmed for the current run. Review those local process/discovery effects before starting. A fresh directory has no source bookmarks before explicit pairing. Do not use a private old database as a fresh-install fixture.

## 2. Optional Models: A Separate Download

Keyword retrieval needs no model. Search never downloads missing weights. Source pins these separate assets:

| Role | Repository, revision and default directory |
| --- | --- |
| Embedding | `Xenova/multilingual-e5-small`, `761b726dd34fb83930e26aab4e9ac3899aa1fa78`, `.models/multilingual-e5-small` |
| Reranking | `onnx-community/bge-reranker-v2-m3-ONNX`, `6f5ff65298512715a1e669753bc754d2bc8f367b`, `.models/bge-reranker-v2-m3` |

The fixed quantized ONNX/tokenizer/config files, sizes and integrity values are in `src/retrieval/model-files.ts` and `reranker-files.ts`. Combined declared assets exceed 700 MB; allow additional runtime/dependency/cache space. Weights are excluded. Applicable model-artifact notice provenance for redistribution is unresolved; project MIT does not relicense models, and no full portable distribution is approved.

Only after separate review/approval of terms, destinations, storage and exact assets:

```powershell
npm run semantic:setup
npm run semantic:setup -- --reranker
```

Default origin is Hugging Face; `--mirror` instead selects `hf-mirror.com`, a separately reviewed destination. `--model-dir` accepts an explicit absolute local directory; existing different files are refused. `ANYSEARCH_MODEL_DIR` / `ANYSEARCH_RERANKER_DIR` select separately reviewed local assets for processes that read them. Do not point these at private-data directories. No download was run here.

With absent/corrupt/unavailable assets or a semantic timeout, hybrid retrieval is intended to return keyword results and `semantic.status: unavailable`. The desktop text is `语义模型不可用，当前为关键词结果`; choose `关键词` for explicit lexical mode. Normal desktop/MCP constructs both providers, so installing only the embedding model does not establish ready hybrid retrieval. This fallback still needs independent acceptance for the public cut.

## 3. Chrome Extension And Native Setup

Build/start does not perform these actions. Loading an extension and confirming pairing allow the intended profile's entire existing/future bookmark tree, not a folder. Use a new user-created ordinary synthetic-only profile for scoped acceptance; never open another person's profile or infer authorization from its existence.

1. After specific approval, manually enable developer mode in the intended profile's extensions page and Load unpacked from this export's `dist/chrome-extension`. Review manifest permissions: `bookmarks`, `storage`, `nativeMessaging`, `alarms`.
2. Obtain that displayed 32-character extension ID. Identical IDs can exist across profiles and do not prove profile identity. Initialize the default desktop database first; then generate local preview files from the export root:

```powershell
$root = (Get-Item -LiteralPath '.').FullName
$extensionId = Read-Host 'Exact extension ID in the intended ordinary Chrome profile'
npm run native:setup -- --extension-id $extensionId --data-dir (Join-Path $root '.local\desktop') --output-dir (Join-Path $root '.local\native-host')
& (Join-Path $root '.local\native-host\install.ps1')
```

3. Read generated `native-config.json`, host manifest, `.cmd` launcher, `registry-preview.json`, `install.ps1`, `uninstall.ps1` and README. Confirm exact Node/build/data paths, initialized `index.sqlite`, extension origin and HKCU Registry32 key. Data/output directories must be separate absolute children below this export's `.local`. The generator writes previews; the installer without `-Apply` only previews. Different existing files/registration are refused. No HKLM, autostart, source bookmark or Codex change is intended.
4. Only after separate approval of the exact registration, apply it:

```powershell
& (Join-Path $root '.local\native-host\install.ps1') -Apply
```

5. Desktop: `来源与连接` -> select the intended profile or `从当前 Chrome 连接` -> `生成配对码`. Intended ordinary profile's extension: enter code -> `核对配对` -> read selected-profile information -> confirm current window -> `确认此配置并同步`. Desktop selection alone must not ingest bookmarks. A Google account/login is not required or used as proof.
6. Source count, last-sync status and actual synthetic bookmark changes are future acceptance observations, not outcomes established here. Never create/edit/delete existing personal bookmarks as an installation probe.

## 4. Codex Connection: Review Separately

This development setup uses the export's default `.local/desktop/index.sqlite`, not a generic `ANYSEARCH_DATA_DIR` migration. It needs exactly one enabled, paired, successfully synchronized source; do not copy a database/grant to satisfy prerequisites. Metadata is default, `.local/codex-connection/connection.json`, server `anysearch`. Body text is separate, `public-text.json`, server `anysearch_public_text`; local capture does not authorize that host access.

Review `scripts/codex-permissions.ps1`, `scripts/codex-setup.ts` and `scripts/codex-install.ps1` before granting or applying anything. Each following effect needs its relevant explicit approval:

```powershell
# Changes credential-directory ACLs to current Windows user and SYSTEM.
& .\scripts\codex-permissions.ps1 -Apply

# Creates/reuses a persistent metadata grant and secret local connection file.
npm run codex:setup -- provision --apply

# Reads the existing Codex config; writes a local plan, not the config.
npm run codex:setup -- preview
```

ACLs are not isolation from hostile same-user processes. Provisioning is persistent authorization, not a preview. Existing revoked/conflicting connections must fail rather than be silently upgraded or revived. Credentials, plans, pairing codes and backups must not be published.

`preview` targets an existing `config.toml` under `CODEX_HOME`, or current user's default Codex home, and emits `planPath`. Review its exact target, server section, content level, connection and executable/bundle paths without exposing config contents. Do not hand-edit plans. Only after approval of that exact append, run PowerShell 7.2+:

```powershell
$plan = Read-Host 'Absolute planPath from the reviewed preview'
pwsh -NoProfile -File .\scripts\codex-install.ps1 -PlanPath $plan
# The previous command does not apply. This next command does, after approval.
pwsh -NoProfile -File .\scripts\codex-install.ps1 -PlanPath $plan -Apply
```

Apply intends to preserve existing bytes, create a private backup and append only if the reviewed original hash still matches. It must not replace other MCP entries. Reload/restart the actual host through its reviewed workflow before real-host acceptance. `npm run mcp` alone is not a configured connection: it requires a valid `--connection` argument or explicit capability/database environment contract. Do not paste secrets into logs.

For separately approved body-text access, use `--content-level public_text` on its distinct `provision --apply` and `preview` operations, then separately review/apply its plan. Do not do this merely to test a guide. It does not collect pages, add another source or authorize new collection.

## 5. Capture Is Not Installation Or Model Setup

Only with an explicit single-target network approval, choose an existing approved bookmark, open its desktop preview and `采集公开正文`. Requests are anonymous and restricted: no browser cookies/login, arbitrary URL entry or batch crawler. Failure leaves metadata. Query strings, private networks, login/JS-only pages and other unsupported responses may fail. See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md). Subsequent Codex `public_text` access still needs its separate grant. No real capture is authorized by this guide.

## Revocation, Removal And Recovery

- `来源与连接` provides source pause/disconnect and `本机授权`. Revoking one non-session grant is intended not to change Chrome sync or other grants. Current desktop-session grants cannot be revoked from that list; quitting revokes them. Disconnect invalidates the source's existing connections/grants without editing source bookmarks.
- Specifically approved metadata revocation: `npm run codex:setup -- revoke --apply`; for body text append `--content-level public_text`. This does not remove host config/connection files or recall prior output. Preserve revoked evidence; do not delete/reprovision to make a check pass.
- Generated Native `uninstall.ps1` without arguments previews; `-Apply` removes only its still-matching HKCU registration. Extension, database and source bookmarks remain. Unload only the exact extension you installed, in the intended profile, via Chrome UI after approval.
- No general automatic Codex uninstall is supplied. After reviewing current changes, remove only the exact AnySearch server section you added, preserving other entries. Do not restore an entire backup over later edits. Review host reload separately.
- Quit only this instance and its owned processes before cleanup. Keep `.local` data by default. Before deleting any new test directory, resolve its absolute path, confirm ownership/scope and obtain the needed cleanup approval. Do not recursively remove old projects, browser profiles or shared databases.
- On setup failure, stop and record the safe error/environment. Do not broaden permissions, overwrite differing registrations, change thresholds/models, repoint private databases or replace host configuration to obtain success.

## Portable Helpers And Acceptance

`release:*` entries point to existing source helpers, not an approved package recipe. Full packaging requires build assets, exact models, runtime files and applicable notices; it refuses absent inputs. No model/runtime package was produced here. Do not substitute approximate notices or present a keyword-only payload as full functionality.

Follow [TESTING.md](TESTING.md) only after an explicit scoped acceptance request. Its record distinguishes the observed temporary installation, SDK and hidden desktop checks from actual Codex tasks, real Chrome events and native Windows acceptance. Models and real setup were not exercised; the original product gaps remain.
