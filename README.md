# AnySearch

Local references for people and coding agents.

> Early source preview. A non-author executor recorded one isolated synthetic installation and workflow run on an existing Windows host; see TESTING.md for results and limits. These factual documentation updates await separate review. This file does not certify a release, overall product acceptance or program admission; earlier failures remain recorded.

AnySearch aims to help Codex find references you have already saved and cite their sources. The first target is Chrome bookmarks on Windows, with a lightweight desktop interface and read-only MCP search/read access for Codex.

AnySearch is not another chat client. Saved articles and notes are reference material to compare, not instructions to execute or permission to access more data.

## Status

Source version `0.1.0-dev.0` is in early preview preparation. Source includes keyword retrieval, an optional local-model hybrid path, snapshot-bound reading, persistent revocable grants, a Chrome extension and a Windows Electron interface. These are implementation facts, not proof of Chinese retrieval quality, actual Codex task success, continuous browser synchronization or native usability. No claim of production readiness, adoption, support window or a security audit is made.

The intended workflow is explicit source pairing, local retrieval, bounded reading, source-linked citations and revocable access. Keyword and Chinese natural-language retrieval require their own quality evidence; a successful query is not proof that the right reference was found.

## Privacy And Access

- Only explicitly paired sources should enter the workflow. Other Chrome profiles, history, cookies and authenticated pages are not implicitly authorized.
- Metadata and public-text access are separate. A metadata connection must not silently become a body-text connection.
- Local retrieval does not mean content returned to Codex stays on your computer. Authorize only material you intend to share with that agent.
- Revocation can stop subsequent access; it cannot retract content already sent to an agent.
- Public-page capture remains subject to explicit scope and network/site restrictions. This is not permission for unrestricted crawling.

These describe intended boundaries, not a substitute for release-specific validation or a same-user operating-system security sandbox.

## Installation And Demo

See [INSTALL.md](INSTALL.md) for prerequisites and separately reviewed setup steps, [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) for missing evidence, and [TESTING.md](TESTING.md) for the bounded execution record and executable acceptance plans. Fresh copy-local dependency/runtime installation, type checking and building were observed once; real Chrome/Codex setup and a clean-machine OS installation were not reproduced. No one-click installer or accepted public binary release is supplied.

The existing [synthetic demo](DEMO.md) uses an in-memory source for search, bounded reading and revocation denial. It does not demonstrate no matches, extension pairing, actual Codex citation, models or native UI. Separate existing synthetic checks cover no matches; they do not replace the missing full workflow. No real bookmark database, credentials or knowledge base is included.

The separately authored source-copy SDK and hidden desktop checks each executed once with one passing test and zero skips, after reviewed full runtime installation and a source build. They covered production synthetic pairing/synchronization, SDK search/read/citation, live and restarted revoked-connection rejection, and bounded desktop search/preview/grant interactions. The executor and separate red team each inspected all seven required screenshots. See [DEMO.md](DEMO.md) and [TESTING.md](TESTING.md). These results do not prove actual Chrome/Codex, Chinese retrieval quality or native platform acceptance; the original 44-row acceptance set remains incomplete.

Public package metadata deliberately has no `test`, `check`, QA or evaluation scripts. Follow the explicit file-scoped checklist only after a current acceptance request, not a development lifecycle hook.

Additional platforms, knowledge sources and one-click installation are not implied by this preview.

## Contributing And Security

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Do not put private references, tokens, connection files, full configuration or databases in public issues. The maintainer designated `a13526738157@gmail.com` as the security contact and confirmed receipt of one self-addressed test message; independent external delivery and a response-time commitment are not established.

## License

Project-owned code is offered under MIT; see LICENSE in the approved source distribution. Dependencies, Electron/Chromium, Node.js, models and reference material retain their own terms. Neither this README nor the package's MIT field relicenses them. Model/runtime binaries are not included. Unresolved model-artifact notice provenance blocks a full portable redistribution.

## 中文简介

AnySearch 希望让 Codex 找回你收藏过的参考资料，并引用出处。首批面向 Windows、一个明确配对的 Chrome 书签配置及 Codex MCP。独立执行者已在专用临时源码副本完成一次依赖与运行时安装、构建、SDK 和隐藏桌面合成流程；本文事实更新仍待独立复核。真实 Chrome、Codex、中文检索质量及整体产品验收尚未通过，不提供已验收的公开二进制包。
