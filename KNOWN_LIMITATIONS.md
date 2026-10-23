# Known Limitations

> Early source-preview limits. TESTING.md records one independent temporary installation and bounded synthetic run; the facts below do not convert it into complete product acceptance. These factual documentation updates await separate review. Earlier failures, blocked cases and missing evidence remain recorded.

## Release And Reproducibility

- One fresh source installation was observed on an existing Windows host, not a clean OS installation or supported Windows build matrix. Repository availability does not establish an accepted release, adoption or security-support window.
- Source version `0.1.0-dev.0` declares Node `>=24.18.0 <25` and Electron `44.9.0`. Portable packaging explicitly requires Windows x64 and non-Electron Node 24.18+. These source constraints are not a demonstrated compatibility matrix.
- Only reviewed source and selected existing synthetic checks are export candidates. Local dependencies, built output, runtime binaries, weights, private data and raw internal reports are excluded. `.gitignore` is not privacy proof or export authorization.
- Source installation, Chrome registration, profile pairing, credential ACLs and Codex configuration are separate operations. No verified one-click installation/uninstallation or automatic connection migration is supplied.
- `release:*` helpers are source, not an available release. Full packaging needs build assets, exact fixed models, runtimes and applicable notices. Model-artifact notice provenance is unresolved, so full portable redistribution remains blocked. Program rollback does not restore old data or revive grants.

## Search And References

- Keyword and hybrid retrieval exist in source. Chinese natural-language recall, ranking, real-task reference selection, full-context agent planning and resource/latency performance still need acceptance for this public cut.
- Models are not shipped. Normal desktop/MCP hybrid retrieval depends on fixed embedding and reranker assets. Missing/corrupt/timed-out model work is intended to return keyword results with semantic-unavailable status, not silent semantic success. An empty result does not prove no reference exists.
- MCP supplies bounded `search` / `read`, not execution of a retrieved skill, a PPT/video generator, or proof an agent read/understood/adopted a source. Candidates are not necessarily appropriate or installed.
- References bind resource, content level and snapshot. Changed content may require a new search; stale positions must not be reused. Semantic passage positions are not literal query matches.
- Metadata means bookmark title, URL and folders, not body text. Body availability requires explicit successful capture. Stored text can differ from a currently changed live page.

## Sources And Capture

- First source: all existing/future bookmarks of one confirmed ordinary Stable Chrome profile. Not all profiles, history, Google identity, authenticated pages, arbitrary local files or an Obsidian connector.
- Profile directory keys/display names do not establish the extension's actual directory. Confirm inside the intended extension context; incognito/guest pairing is unsupported.
- Real Chrome add/edit/move/delete convergence, reconnect/import/restart and stale references still need evidence for this public cut. First sync, manual refresh, a test bridge or popup status is not sufficient.
- Capture is explicit, one existing bookmark, anonymous public requests. No browser cookies, authentication reuse, proxy state, JS rendering or automatic batch crawling. Public-address, default-port, same-origin, site-directive and size/time restrictions narrow coverage.
- Nonempty query strings, private/loopback addresses, login-only pages, cross-origin redirects, compressed responses, PDFs and script-only pages can be rejected/unsupported. Publicly reachable does not imply unrestricted copying rights.
- Capture progress/failure is session-local, not durable job history. Stored text does not prove a page remains reachable or unchanged.

## Permissions And The Host

- Metadata and `public_text` use distinct grants/connection files. Local body capture does not authorize Codex body access; that grant and config need separate review.
- Persistent grants and output checks exist, but real races, pause/disconnect, in-flight cancellation/revocation, restart and public host integration need independent evidence. A button label is not such evidence.
- Connection ACLs do not protect against hostile same-user processes. This is not a single-chat identity sandbox.
- Local retrieval/inference does not keep content returned to an external host local. Revocation cannot recall earlier output, other copies, completed actions or host logs.

## Desktop And Demonstration

- Native shortcuts, double Shift, Chinese IME, focus return, tray/DPI behavior, startup receipts and resource consumption are not accepted for this public cut. An accelerator registration or browser key event is not system-level acceptance.
- Double Shift is off by default, requiring explicit in-app confirmation for the current run. Focus helper uses Windows PowerShell `Add-Type`; system policy and foreground-window rules can make it unavailable. Focus return is not guaranteed.
- `scripts/demo.ts` uses an in-memory synthetic source. It does not cover no matches, Chrome pairing/events, SDK/actual Codex, a native window, models or public capture. Selected foundation checks do not fill those end-to-end gaps.
- The separate source-copy SDK and hidden desktop checks passed once, with both independent roles inspecting seven fixed-state screenshots. SDK references are not actual Codex task citations; hidden QA is not ordinary desktop/native acceptance. See TESTING.md for the exact bounds.
- A separate historical startup suite still exited 1 with two symbolic-link privilege failures (EPERM). New missing-runtime checks passing does not close those failures or the original 44-row acceptance set. Historical foundation-test author/context remains unknown despite 54 passing raw assertions.
- Temporary installation cleanup was blocked by the execution tool before deletion ran. About 1.388 GB of owned install/cache/evidence material was retained locally; sampled owned processes were absent, not comprehensively instrumented. These files and runtime binaries are not public export candidates.

## Publication Blockers

The security contact is `a13526738157@gmail.com`; the maintainer confirmed one self-addressed test receipt, not independently verified external delivery. File-by-file review of 158 exact source candidates and a temporary installation/synthetic execution window were recorded by separate independent roles. Final source-publication verdicts must bind the corrected documents and unchanged code/test/lock bytes explicitly; this document does not supply either verdict. Adoption, program eligibility and application acceptance are not established. Unresolved model/runtime redistribution notices apply to a bundled binary, not a source preview that excludes those artifacts. Publication, binary distribution and external submission each require separate explicit approval; a source-only publication approval is not approval for the other actions.
