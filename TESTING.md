# Acceptance Record And Checklist

> Bounded execution facts plus retained acceptance plans. A non-author executor completed the run recorded below on 2026-10-23; a separate red team reviewed its raw evidence and images. These factual documentation updates require a fresh review/scope. The old execution window is preserved, not represented as a rerun against later document hashes. No command here is permission to start another run, and earlier failures remain recorded.

## 1. Stage, Goal And Status

The maintainer explicitly requested basic-runtime repair and independent re-review, a reviewed source preview with a synthetic installation/pairing/search/reference/revocation workflow, then voluntary external feedback. The original checklist is retained as planning history, not an assertion that no work has run. The new SDK and desktop tests belong to `source_preview_test_author_v3` (originally `fork_turns=none`), not the product/document author. Non-author execution and separate raw-evidence review have occurred for their unchanged bytes; final verdicts for the corrected public documents remain separate.

### Recorded Execution Window

One exact 158-file reviewed source mapping was copied into a new owned system-TEMP directory on an existing Windows host, using Node 24.18.0 and npm 11.16.0. Empty owned npm configs, home/cache/config paths and a controlled environment prevented borrowing parent dependencies, runtime/cache or user npm configuration. This is not a clean OS installation, malicious-dependency sandbox, compatibility matrix or comprehensive dependency security/legal audit. Raw reports, hashes and screenshots remain in the maintainer's separate evidence set; they are not part of the public source export.

| Command in the temporary source copy | Recorded result | Evidence limit |
| --- | --- | --- |
| `npm.cmd ci --ignore-scripts --no-audit --no-fund` with owned cache/config arguments | exit 0; 183 packages | Preliminary acquisition for fresh installer review; tarballs contain native files |
| `npm.cmd ci --ignore-scripts=false --no-audit --no-fund` with the same owned cache/config and logging arguments | exit 0; 183 packages; esbuild, ONNX and protobufjs lifecycle entries emitted | Full dependency installation, not Electron-ready or model evidence |
| `node .\node_modules\electron\install.js` | exit 0; Electron 44.9.0; expected ZIP SHA256 matched | One explicit installation; no manual retry, source substitution or borrowed cache |
| `npm.cmd run typecheck` | exit 0 | Strict compilation only |
| `npm.cmd run build` | exit 0 | Source/build closure only; not a packaged release or real setup |
| `node --test tests/source-preview-workflow.test.ts` | 1/1 pass, 0 skips, exit 0 | Production synthetic pairing, SDK citation, live and restarted revoked-connection denial; not actual Chrome/Codex |
| `node --test tests/source-preview-desktop.test.ts` | 1/1 pass, 0 skips, exit 0 | Hidden QA, synthetic keyword/metadata/grant flow; not ordinary native desktop acceptance |
| `node --test tests/core.test.ts` | 16/16, 0 skips, exit 0 | Historical author/context UNKNOWN; raw observations are not T04 formal acceptance |
| `node --test tests/ingestion.test.ts` | 10/10, 0 skips, exit 0 | Same historical provenance limitation |
| `node --test tests/evidence-location.test.ts` | 12/12, 0 skips, exit 0 | Same historical provenance limitation |
| `node --test tests/chrome.test.ts` | 16/16, 0 skips, exit 0 | Pure normalization, not a Chrome process/profile |
| `node scripts/demo.ts` | exit 0; synthetic hit, bounded read and revoked denial | In-memory core demo, not transport or real-host use |

The commands used the lockfile's existing sources: observed package requests included `cdn.npmmirror.com` and `registry.npmjs.org`. No registry/version was substituted to obtain success. The explicit Electron operation observed TLS-authorized `github.com` and `release-assets.githubusercontent.com`; its full HTTP redirect chain was not captured. No models, real Chrome/Codex configuration, extension installation or real user material supplied these checks. The source/SDK test ran after full installation; the standalone ignore-scripts-only SDK path was not independently rerun.

The executor and red team each actually viewed all seven required screenshots: results and metadata preview at 760 CSS pixels, results/long preview/revoke dialog/revoked row/revoked feedback at 390. They observed nonblank expected states and no incoherent text/control overlap in those states. These seven images do not establish general accessibility, physical DPI, IME, focus, hotkeys or all UI failure states.

A separate, non-exported startup regression recorded 39/41 passing tests, zero skips and exit 1. Its 22 S01 cases passed, including the newly authored installed-file/no-implicit-install counterexamples, but two unchanged symbolic-link privilege cases failed with EPERM. These 22 are not all newly authored tests; unchanged assertions/shared-harness provenance is not restored by their result. Those failures, the incomplete original 44-row acceptance set and the UNKNOWN historical author/context for the 54 passing legacy assertions remain unresolved; the small source-preview set does not replace them.

Known owned-process samples were absent and the desktop fixture was removed. Deletion of the larger install/cache/stage root was rejected by the execution tool before process creation: no deletion body ran, no alternative method was tried, and about 1.388 GB remains retained locally. That required cleanup subitem is BLOCKED, not PASS; any prospective decision to defer it must be explicit and cannot rewrite this old result. No source-only publication approval is asserted here.

### Added Workflow Feature And Executable Check

- F08: from a reviewed source copy with independently installed dependencies, use production pairing/synchronization, connection provisioning and the copy's MCP stdio server to produce bounded source-linked SDK references, then deny access after revocation both live and after server restart. This is synthetic Node/SDK evidence, not actual Chrome/Codex/Electron or full-product acceptance.
- T08 (F08, Node-only reproduction plan): a non-author executor first records the exact source-to-target inventory/hashes and completes the per-file review. In a unique system-TEMP copy, use an isolated npm cache/config and run `npm.cmd ci --ignore-scripts --no-audit --no-fund`, then `node --test tests/source-preview-workflow.test.ts`. This exact Node-only path was not separately rerun; the table above records the full-install SDK result. Dependency resolution must remain inside that copy; no parent `node_modules`, model/runtime lifecycle download, live browser/config/data or project-private helper may supply a missing prerequisite. The independent author freezes assertions before execution; failures remain failures. Record installation and test exits separately, raw synthetic output, source hashes and dependency/network limits. Red team reviews the same scope and evidence. Cleanup only owned temporary data/processes after checking absolute paths; retain the evidence separately. This does not replace T02's full Electron installation or the original product requirements.

The SDK and desktop tests are two exact additional candidates. The five existing synthetic files below remain unchanged; broad test globs, private harnesses and other fixtures are not selected. Earlier author-unknown records remain unknown and are not attributed to the new author.

Subsequent full-installation authorization: the maintainer explicitly allowed locked npm tarball native files, reviewed Electron/ONNX runtime installation and synthetic desktop/SDK validation only inside an owned temporary source copy. This does not retroactively remove the earlier V3 no-runtime wording conflict. The isolated formal author supplies a V4 baseline/handoff and a second exact candidate, `tests/source-preview-desktop.test.ts`; product/document authors do not modify it.

- F09: use the reviewed copy's own full runtime installation and built app for a synthetic desktop check, separate from the source/SDK test and from native Windows acceptance.
- T09 (F09, bounded execution recorded above): after the independent per-file review, use the complete-runtime T02/T03 steps below in an isolated temporary copy with owned home/config/cache/model paths and no inherited proxy/mirror/runtime overrides. A preliminary ignore-scripts install is for inspecting the freshly obtained locked installers and their download origins, not a desktop success claim. After approved normal dependency installation, explicit `node .\node_modules\electron\install.js` and `npm run build`, the non-author executor runs `node --test tests/source-preview-desktop.test.ts` according to the independent author's V4 prerequisites. Record actual app/runtime resolution, interaction results/screenshots, exits, owned-process cleanup and all failures; independent red team reviews the same source/runtime evidence. Do not use private project QA scripts, another runtime/cache, real profiles or data, system hooks or an actual clipboard/open side effect to make it pass. A launch or screenshot alone does not prove the intended interactions; physical keyboard/IME/DPI/actual-host work remain separate.

- Goal: fill the public source-preview preparation gaps without publishing private material, claiming unearned acceptance or changing the product goal.
- Scope: revised public documentation, candidate public package metadata and ignore template; selected existing synthetic files and existing demo are unchanged candidates, not newly authored tests.
- Actions outside the execution window: repository creation/push, package publication, external submission/contact, models, real collections, extension registration/installation and real Codex/Windows settings. A later conditional authorization to publish exact source after both final gates is not evidence that publication occurred, nor permission for the other actions.
- Implementation and user final acceptance remain distinct from the recorded command results. Original input/staged before-and-after hashes were collected and unchanged; corrected public documents need a new scope and independent delta review. No command is represented as having run against these later document hashes.
- Existing product failures, incomplete real-host quality, full portable notices and the previous OSS review FAIL are not reset by this checklist or selected small test subset.

## 2. Artifact And Role Ownership

Public artifacts are README.md, INSTALL.md, KNOWN_LIMITATIONS.md, TESTING.md, DEMO.md, CONTRIBUTING.md, SECURITY.md, the approved AGENTS mapping, package.json and the approved .gitignore mapping. The matching source lockfile is not regenerated or modified by this kit. Report files must remain distinct from scoped implementation/test hashes.

| Role | Identity/context and ownership | Current state |
| --- | --- | --- |
| Current product/document author | `root`, main task; launcher and current public-document updates, not formal tests | Cannot execute, review or accept this change |
| Earlier public-document author | `oss_public_docs_impl`, historical isolated task (`fork_turns=none`) | Historical ownership retained, not attributed to current roles |
| Static existing-test curator | `oss_public_test_curation`, isolated context (`fork_turns=none`); read-only selection, not test author or verdict | Existing files remain unchanged |
| Original formal-test authors | Historical identities/context must be recovered from original evidence, not attributed to curator or inferred from a successful run | Missing provenance is BLOCKED for an independence verdict |
| Formal-test author for new coverage | `source_preview_test_author_v3`, originally isolated `fork_turns=none`, continued for V4; owns the new SDK/desktop and S01 formal artifacts | Did not execute its tests or change product/public documents |
| Independent executor | `source_preview_executor_v3`, originally isolated `fork_turns=none`, continued; authored neither product nor formal tests | Recorded the sealed execution window, not current-document approval |
| Adversarial reviewer | `source_preview_redteam_v3`, separate originally isolated `fork_turns=none`, plus documented isolated read-only review batches | Independently read sources/installers/raw evidence and all seven images; final new-scope verdict separate |

Before running, independent roles must freeze original goal, file scope, expected results/gold, denominators, thresholds, exclusions and evidence levels. Four distinct identities are required if product and formal tests both change. Documentation-only acceptance needs no invented formal-test author, but still needs both independent gates. Each gate must explicitly PASS for the same scoped hashes with no unresolved required failures; absent authorship evidence is a blocker. Reruns after a repair still require a current scoped request. Never derive gold from current outputs, delete failures or shrink scope to get green results.

## 3. Feature Checklist

| ID | Entry point and operation | Observable intended result | Limit / status |
| --- | --- | --- | --- |
| F01 | Inspect public package.json beside exported lockfile and source | Same name/version/engines/direct dependency pins, `private: true`, only exported script targets; no new test/check/QA scripts | Fresh-copy type/build observed; final corrected-document review separate |
| F02 | Follow INSTALL.md in a new reviewed export | Exact prerequisites, effects, separate approvals, error/recovery and removal boundaries are actionable | One isolated source install observed; not a clean OS or real Chrome/Codex setup; cleanup BLOCKED |
| F03 | Read model/capture/setup sections | Model downloads, page collection and grants/config apply are distinct; missing models do not imply semantic success | Models/capture/real setup not tested; binaries/weights not exported |
| F04 | Run only the selected unchanged synthetic source checks after approval | Core keyword/read/permission/snapshot/ingestion/normalization contracts are exercised with synthetic data | 54 raw assertions passed; historical formal independence remains BLOCKED |
| F05 | Run existing scripts/demo.ts after approval | In-memory source-linked search, bounded snapshot read, revoked access denial | exit 0 observed; no empty-result step or full workflow |
| F06 | Read README/limits/security/contribution/ignore/license boundaries | No personal paths, secrets, fabricated repo/contact/use evidence, license overreach or accepted-release claim | `.gitignore` alone cannot prove privacy; pending independent review |
| F07 | Complete the future real Chrome/desktop/Codex workflow | Explicit profile pairing, event sync, human search/read, host task attribution, empty results, persistent denial | Still required; separate permissions/fixtures/host/native evidence missing |

## 4. Selected Existing Synthetic Files

The exact candidate list is:

| Existing file | Source-only selection rationale and pending feature coverage |
| --- | --- |
| `tests/core.test.ts` | Uses shared inline example references/temp SQLite; keyword/no matches, bounded reading, metadata/body separation, revocation and snapshots |
| `tests/ingestion.test.ts` | Self-created memory/temp SQLite and synthetic URLs/text; source/capture-revision and unrelated-database boundaries |
| `tests/evidence-location.test.ts` | In-memory synthetic body/locations; a throwing network substitute, not live capture; path-like strings are query literals |
| `tests/chrome.test.ts` | Pure bookmark-tree normalization and URL syntax cases, not a Chrome process/profile read; special-scheme strings are data |
| `tests/helpers.ts` | Required helper; three inline `example.org` bookmarks/self-authored text, `mkdtemp` SQLite setup and scoped cleanup |

No `tests/fixtures`, legacy DB fixture, real model, `.models`, asset directory, QA script, browser runner or private data is selected by this list. Historical authorship/rights still need evidence; static synthetic selection is not a rights audit or runtime verification. Do not use `tests/*.test.ts`: it would silently widen this scope.

The read-derived relative product import closure is `src/adapters/chrome/normalize.ts`; `src/core/contracts.ts`, `errors.ts`, `evidence.ts`, `hash.ts`, `limits.ts`, `match-location.ts`, `service.ts`; and `src/storage/bookmark-projection.ts`, `bookmarks.ts`, `database.ts`, `grants.ts`, `search-text.ts`. Node built-ins and locked `zod` are used. This closure also covers the existing demo. The complete app export has more source/dependencies; the small closure is not an alternative full-product release or an executed dependency-resolution result.

## 5. Executable Checklist: Only After Authorization

The checklist originated as an unexecuted authoring plan on 2026-10-22. Its prerequisites and required expected results are retained; the dated record above distinguishes actual observations from unmet requirements, including T04 provenance, required cleanup and real-host work. A command's presence here is not a new test request. Work from the root of a new explicitly reviewed source export, not an old/private working directory. Independent executor records environment, exact commands/exit codes, raw output, file hashes, skipped/blocked cases and cleanup; independent red team reviews those same scoped artifacts and evidence. Observed exits are not pre-filled acceptance verdicts.

### T01: Public Artifact And Export Review

- Maps to F01/F02/F03/F06. Prerequisites: approved candidate file-by-file manifest; repository/security facts supplied by the maintainer; no access to private source data.
- Manual steps: compare each public npm script's target to that manifest, follow build imports/copied assets, and compare package name/version/engines/dependency/devDependency values to lockfile root. Confirm no test/check/QA scripts or install-time project verification hooks. Read every mapped public document for unresolved links, personal paths/data, fabricated contacts/repo/adoption/approval, MIT overreach and missing setup effects. Inspect ignore coverage for local state, models, dependencies, dist/outputs, logs/caches, env, DB sidecars and keys. Inspect the approved source files themselves; ignored status is not evidence they are safe.
- Expected: every referenced source file/dependency is included or explicitly blocked; unsafe/unreviewed material is excluded. Missing security address, third-party evidence or author provenance stays blocked. An explanatory disclaimer does not compensate for a required missing artifact.
- Risk/cleanup: read-only within approved source copy; no credential/config/browser reads, no external contact; no cleanup. Evidence: signed per-artifact findings plus same-scope hash manifest, not a passing assertion by this author.

### T02: Clean Dependency Reproduction

- Maps to F01/F02. Prerequisites: T01-approved disposable export, Windows environment recorded, external Node in declared range, explicit network/lifecycle execution approval and reviewed lockfile origins.
- Commands: `node --version`, then `npm ci` and `node .\node_modules\electron\install.js` in export root, after reviewing and approving those exact installer effects. A preliminary `npm ci --ignore-scripts` can acquire locked package source for installer inspection, but is not the complete runtime installation result. Do not regenerate lockfile, change registry/version, reuse another workspace's node_modules/runtime/cache or disable failures to obtain success.
- Expected: the matching export/lockfile installs; Electron exact pin is available. Failures from registry, lifecycle/runtime or metadata mismatch remain failures, not successful reproduction. No model/grant/config registration is intended.
- Risk: package downloads including bundled native files, ONNX lifecycle behavior and the explicit pinned Electron runtime installer. Cleanup: quit only owned processes; remove only this disposable export/dependencies after identifying its resolved absolute path and confirming no retained data. Preserve evidence separately. Authorization must cover this full installation separately from a Node-only run.

### T03: Type And Build Entrypoints

- Maps to F01/F02. Prerequisites: T02, explicit type/build acceptance scope and same frozen export, no real connections.
- Commands: `npm run typecheck`, then `npm run build`; record each separately. No automatic test chaining is supplied.
- Expected: declared TypeScript/source inputs resolve and build-required assets are present; all build entries complete without relying on excluded docs/private files/old output. Type/build success does not accept user workflows. Any missing input/error remains visible.
- Risk/cleanup: compiler/bundler execution, local `dist` writes; no setup apply/model download. After evidence, remove only newly created dist within the disposable export if approved. Preserve source/lock and failure output.

### T04: Existing Synthetic Foundation Contracts

- Maps to F04 and the no-match part of F07, not other F07 evidence. Prerequisites: reviewed unchanged five-file selection, historical author/context evidence, T02 and explicit synthetic-test request. Freeze each existing test's cases as-is; selected-file denominator is four runnable files, not a substitute for the full product denominator.
- Commands, separately attributable:

```powershell
node --test tests/core.test.ts
node --test tests/ingestion.test.ts
node --test tests/evidence-location.test.ts
node --test tests/chrome.test.ts
```

- Expected: original assertions define the synthetic contract. All emitted failures/skips are retained; absence of failures in this subset cannot close unselected quality/permission/platform requirements. Do not add a runner, alter tests/fixtures/expected values or use private data.
- Risk/cleanup: Node processes; helper-created temp SQLite directories. No live network/model/browser/config access is intended by these files. Existing cleanup closes/removes its owned temp state; after abnormal termination identify exact created temp paths and remove only owned entries, never a broad temp parent. Record cleanup failures.

### T05: Existing In-Memory Demonstration

- Maps to F05. Prerequisites: unchanged reviewed `scripts/demo.ts` and imports, T02, explicit demo acceptance request.
- Command: `node scripts/demo.ts`.
- Expected: observations in [DEMO.md](DEMO.md), including synthetic source-linked hit/read and revoked denial. Preserve exit code and full synthetic output, not an authored success transcript. Do not infer no-match/Chrome/MCP/Codex/native/model behavior from it.
- Risk/cleanup: Node and memory-only SQLite, database closes in source `finally`; no file cleanup intended. Identify/stop only this run's remaining owned process on abnormal termination. The earlier authorized execution is recorded above; this checklist grants no new run.

### T06: Real Workflow And Negative Cases Remain A Separate Gate

- Maps to F02/F03/F07. Prerequisites: new explicit scope for actual Windows desktop, extension installation/HKCU registration, a user-created ordinary synthetic-only Chrome profile, permission to change only its designated synthetic bookmarks, separate metadata host grant/config, an independent real Codex execution context, and a frozen task/expected sources not derived from current search outputs. Body capture/body-host output/model download each need further explicit approval. These prerequisites are not currently established.
- Manual steps after approvals: follow INSTALL.md's exact source start/registration/pairing steps; record the intended ordinary profile before confirming extension pairing. In its designated synthetic area add an approved reference, rename/move/change URL/delete it one at a time and observe automatic convergence without manual-refresh substitution. Desktop: keyword query, preview/read, Chinese input, known no-match query and source unavailable state. Codex: actual `search` -> `read` with returned snapshot -> cited task result; keep task relevance evaluation independent. Revoke only the test metadata grant, repeat a tool request, restart the exact test service and request again; both must deny without reprovision. Record native shortcut/focus/IME/DPI and any missing cases separately. Do not open/fetch a source URL without its separate approval.
- Expected: complete required workflow, provenance and negative cases must all be demonstrated at their actual evidence layer. Old snapshots/changed URL/deleted items must not expose current old text; metadata must not leak body fields; revocation must not revive on restart. No-match cannot be substituted for denied/unavailable. Any unresolved required item, blocked prerequisite or test not executed prevents full-workflow PASS. These steps do not reduce original product/release requirements.
- Risk: actual profile, registry, persistent grants/config, processes and external-host output. Cleanup: revoke only test grants, disconnect only test source, quit owned processes, use exact generated matching `uninstall.ps1 -Apply` only when separately approved, unload only that extension and remove only added server section. Preserve source bookmarks and unrelated host settings; remove only explicitly approved synthetic items/paths, never the full user's profile. Retain failures and evidence.

## 6. Return And Release Gate

The executor and red team must supply independent verdicts, same scoped file hashes, original failures/counterexamples, environment/permission limits, not-run items and cleanup status. Missing scope/author evidence is BLOCKED, not PASS. Changed files invalidate their old scope and require current-request independent review; unchanged code/test/lock evidence may be cited only with explicit byte correspondence, never as a fictitious new-hash run. No self-triggered rerun. Final user acceptance does not itself authorize publication, and publication does not prove program admission, usage/adoption or third-party distribution rights. This execution record does not itself supply either final verdict or waive any blocked requirement.
