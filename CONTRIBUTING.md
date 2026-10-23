# Contributing

> Revised draft, pending independent re-review. This file does not activate a repository, contribution agreement, CI workflow or accepted release. Earlier failures remain pending new review.

## Start With The User Problem

Describe the task, observable obstacle and result that would solve it. Read README.md, KNOWN_LIMITATIONS.md and the release's AGENTS rules. Propose changes to sources, permissions, cloud processing, telemetry, model choice or default capture behavior before implementing them.

Documentation, reproducible synthetic bug reports and improvements to source attribution, Chinese input, retrieval and access boundaries are useful contributions. Do not attach real bookmark collections, private notes, tokens, pairing codes, databases, browser profiles or full configuration.

## Explain The Change

Keep patches scoped. State the purpose, affected components, dependencies, risk, known failures, and which checks were or were not run. Preserve strict TypeScript and separate connectors, storage, retrieval, permissions, transport and desktop UI.

Do not rewrite expected results, discard failures or change gold labels to make a patch appear correct. A result found in retrieval must not become an instruction or permission to execute it.

## Development And Acceptance

Follow the project's maintainer-approved AGENTS rules. Development handoff includes feature and executable acceptance checklists; acceptance is not automatically triggered by edits, PR creation or a phase boundary. Product authors must not approve their own work. Formal test authorship, execution and adversarial review remain separate when applicable.

No test automation is enabled by this document. See [TESTING.md](TESTING.md) for exact file-scoped commands, the bounded independent execution record and still-pending checks. A recorded command result is not automatically a formal acceptance verdict. Each handoff must include a feature checklist (entry point, operation, observable result, limitations, artifact author/context) and an executable test checklist (feature mapping, prerequisites, exact steps/commands, expected behavior, risk/authorization, evidence, cleanup and known failures). Explicitly state not-run checks.

Product plus formal-test changes require four distinct identities: product author, isolated-context formal-test author, non-author executor and separate adversarial reviewer. Test authors must not execute/accept their own test changes or modify the product. Record identities, context provenance and ownership; existing tests retain historical authorship rather than being attributed to a curator. Missing author/context evidence is a blocker. Documentation-only acceptance needs no invented test author, but still needs independent execution and review.

Freeze the original goal, scope, expected results/gold, denominators, thresholds and exclusions before execution. Preserve failures, skipped/blocked cases and counterevidence. Both independent gates must explicitly PASS for the same scoped file hashes with no unresolved required failures. A changed scoped file invalidates the old verdict; a repair rerun still needs a current user request. Final user acceptance and publication approval are separate.

## Rights And Security

The project uses MIT for project-owned code. Contribute only material you have the right to provide, retaining applicable third-party notices. This draft does not introduce a CLA, DCO or a promise about other contributors' rights.

Potential vulnerabilities do not belong in public issue details. Consult [SECURITY.md](SECURITY.md): the maintainer designated `a13526738157@gmail.com` and confirmed one self-addressed test receipt. Do not imply independently verified external delivery, a response deadline or a security audit.
