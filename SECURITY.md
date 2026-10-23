# Security

> Revised draft, pending independent re-review and publication approval. A designated contact and a reported test receipt do not establish security acceptance or guaranteed delivery.

## Reporting

Report security concerns privately to `a13526738157@gmail.com`, the maintainer-designated security contact. The maintainer confirmed receipt of one self-addressed test message on 2026-10-22; delivery from an external sender has not been independently verified. This does not establish a response deadline, bounty or security acceptance. No repository URL is invented here. GitHub private vulnerability reporting is not claimed enabled.

Do not disclose tokens, pairing codes, private URLs or content, databases, browser profiles or full configuration in public issues. Do not send a vulnerability to an unconfirmed contact address or use public issues as a substitute for private exploit details.

## Scope

Only investigate environments you own and have authorization to assess. A report should identify the affected release/component, prerequisites, potential impact and minimal reproduction using synthetic data. It should not include other people's content or secrets.

Relevant boundaries include revocable grants and output checks, metadata versus body-text access, Native Messaging pairing, public-network capture restrictions, snapshot citations and untrusted retrieved content. Listing these boundaries does not establish that they have passed a security audit.

Connection-file ACLs do not isolate hostile same-user processes. Pairing does not prove a Google identity or permit reading other profiles. Capture must not reuse browser cookies or logged-in sessions. Revocation cannot retract already returned content. Read [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) rather than interpreting source boundaries as absolute guarantees.

## Supported Versions

No independently accepted public release or security-support window is declared. `0.1.0-dev.0` is a source-preview candidate, not a supported stable release. The earlier release-preparation FAIL remains pending fresh independent review; these edits do not close it. Channel configuration, independent code acceptance and publication approval are distinct prerequisites.
