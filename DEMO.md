# Synthetic Source Demo

> Synthetic demonstration, not real-host acceptance. On 2026-10-23 a non-author executor ran the unchanged memory demo and the separately authored source-copy SDK and hidden desktop checks. The executor and red team each inspected seven required desktop screenshots. See TESTING.md for recorded exits, provenance and limits; these factual documentation updates await separate review. No video recording or actual Codex task is claimed.

## Scope

`scripts/demo.ts` opens SQLite `:memory:`, creates a source named `synthetic-demo`, normalizes one inline bookmark (`Example research`, `https://example.org/research`), stores three lines of self-authored synthetic text and issues a process-local example `public_text` grant. The URL is an identifier, not fetched. Nothing depends on personal bookmarks, databases, a browser profile, another workspace, model weights or private configuration.

The script imports the same core/storage/normalization source as selected foundation checks. It does not start MCP/Electron/Chrome or register/install anything. It closes its database in `finally`. Its recorded execution exited 0 and emitted the synthetic hit, bounded read and revoked denial. It is not an end-to-end release demo.

## Reproduction Prerequisites

Prerequisites: reviewed source export including `scripts/demo.ts` and its source imports; Node `>=24.18.0 <25`; matching dependencies installed under the separately approved [installation](INSTALL.md) plan. No model setup is needed. A current explicit acceptance request must include this demo, with a non-implementing executor and separate red-team reviewer.

From that export root, the existing command is:

```powershell
node scripts/demo.ts
```

There is deliberately no new npm demo/test runner. Do not pipe a private connection/capability into this command or replace its source with real data.

## Memory Demo Contract

| Step in existing source | Expected observation | Evidence limit |
| --- | --- | --- |
| Search `source-linked` | JSON identifies `synthetic: true` and contains the inline reference, source/resource identity and snapshot | One literal hit, not semantic quality or task suitability |
| Read using returned resource/snapshot, line start 2, max 2 | Bounded synthetic lines 2-3 with source URL and snapshot identity | Core read, not actual Codex reading/citation |
| Revoke that grant, search again | Access denial is caught; JSON states `accessAfterRevocation: denied` | Same-process synthetic denial, not persistent restart/race/host evidence |
| Finish or throw | Memory DB closes in `finally`; unexpected failure is retained as failure | Recorded run exited 0; this is not a general cleanup or lifecycle verdict |

Executor must record exact command, environment, exit code, original output and scoped hashes. Unexpected missing result/read/denial errors must be kept, not edited out or accepted after changing expectations. No file cleanup is intended by the demo itself. If an abnormal run leaves an owned process, terminate only that run's process after identifying it.

## What Is Still Missing

No-match behavior is covered in selected existing `tests/core.test.ts`, not this memory demo. Do not add a synthetic no-match result to its transcript or call it a complete sequence.

## Independently Installed Source Workflow

The separate `tests/source-preview-workflow.test.ts` is authored in an isolated formal-test context. The recorded run used a reviewed source copy with independently installed locked dependencies and the full runtime setup in [INSTALL.md](INSTALL.md), then ran:

```powershell
node --test tests/source-preview-workflow.test.ts
```

The sequence uses that source copy's production broker for synthetic pairing/synchronization, production connection provisioning, its production MCP main through an SDK stdio client, keyword search and bounded read with resource/snapshot/source citation, then live and restarted-service rejection of the same revoked connection. The non-author executor recorded 1/1 passing test, zero skips and exit 0; the separate red team reviewed that evidence. No private helpers, parent dependencies, real profiles or models supplied the run. The separate ignore-scripts-only SDK path was not rerun and is not inferred from this full-install result.

This is a simulated Chrome source and an SDK host. It is not actual Chrome pairing, actual Codex task use, Electron installation or model quality acceptance. The earlier deliberately nonexecutable structural-package rehearsal is not the installation evidence for this workflow.

## Separate Real-Host Evidence

### Synthetic Desktop Check Is Separate From The SDK Check

After the separately approved full dependency/runtime installation and source build in the reviewed temporary copy, the independently authored desktop candidate is:

```powershell
node --test tests/source-preview-desktop.test.ts
```

This check used that copy's Electron/Playwright and built app, self-authored synthetic data and owned temporary configuration only. The non-author executor recorded 1/1 passing test, zero skips and exit 0. The executor and separate red team each viewed all seven screenshots for the fixed 760/390 CSS-width search, metadata preview and grant-revocation states. No other workspace's runtime, private QA runner, real Chrome profile, clipboard/open effects or system hook supplied the run. This bounded result does not establish physical hotkeys, real IME/DPI/focus behavior, actual Codex use, full accessibility or model quality.

Real-host acceptance remains separate: source pairing, actual Chrome event synchronization, desktop search/read, actual Codex task use and attribution, no matches, persistent revocation denial/restart and failures without selective editing. Model behavior, public-page capture and native Windows actions need their own approval and evidence. No live source/grant/configuration/capture operation is authorized here.

See [TESTING.md](TESTING.md) for the execution record, retained failures and feature-mapped checks, and [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) before using this example as evidence.
