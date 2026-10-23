# Third-Party Materials

Prepared: 2026-10-22. Public-source preview documentation candidate, not a complete binary notice set or redistribution approval. No public release or independent acceptance is established by this file.

## Project License And Distribution Scope

The accompanying root `LICENSE` applies to project-owned AnySearch code. It does not relicense dependencies, icons, models, runtimes, collected web content or other third-party material. Selecting MIT does not establish ownership of every source file or replace a source-provenance review.

A source-only preview should contain only the separately approved source and metadata. A dependency reference in `package.json` or `package-lock.json` is not a copy of that package's code. Copying dependency code, building bundles, including icons, or distributing runtime/model binaries creates a different notice scope. This document is an index, not a replacement for original license and attribution files.

## Declared Direct npm Dependencies

These versions and license labels are recorded from the current project manifest and lockfile. The notice paths identify original files in the corresponding public npm packages, not files embedded in this document. Package metadata is not proof of every component's rights, notice completeness or binary redistribution compliance.

| Package | Declared version | Lockfile license label | Original package notice entry | Upstream reference from package metadata |
| --- | --- | --- | --- | --- |
| `@huggingface/transformers` | `4.3.1` | `Apache-2.0` | `LICENSE` | [Transformers.js](https://github.com/huggingface/transformers.js) |
| `@modelcontextprotocol/sdk` | `1.32.1` | `MIT` | `LICENSE` | [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) |
| `@mozilla/readability` | `0.6.0` | `Apache-2.0` | `LICENSE.md` | [Readability](https://github.com/mozilla/readability) |
| `ipaddr.js` | `2.5.0` | `MIT` | `LICENSE` | [ipaddr.js](https://github.com/whitequark/ipaddr.js) |
| `linkedom` | `0.18.13` | `ISC` | `LICENSE` | [LinkeDOM](https://github.com/WebReflection/linkedom) |
| `lucide-react` | `1.59.0` | `ISC` | Complete `LICENSE`, including the Feather-derived icon section | [Lucide](https://github.com/lucide-icons/lucide) |
| `react` | `19.3.1` | `MIT` | `LICENSE` | [React](https://github.com/react/react) |
| `react-dom` | `19.3.1` | `MIT` | `LICENSE` | [React DOM](https://github.com/react/react) |
| `robots-parser` | `3.0.1` | `MIT` | `LICENSE.md` | [robots-parser](https://github.com/samclarke/robots-parser) |
| `smol-toml` | `1.9.1` | `BSD-3-Clause` | `LICENSE` | [smol-toml](https://github.com/squirrelchat/smol-toml) |
| `zod` | `4.6.7` | `MIT` | `LICENSE` | [Zod](https://github.com/colinhacks/zod) |

This is a direct-dependency list, not a transitive inventory. Any distributed dependency tree needs its lock-resolved transitive, optional, peer and platform-specific components considered as well. Development tools are a separate scope; their use does not justify copying their binaries or omitting notices for code that actually enters an output.

## Bundles And Icons

For a built release, the build-input metadata and the actual output must be reconciled with the locked packages. Preserve the complete applicable original LICENSE, COPYING, NOTICE and third-party attribution files. A banner in a JavaScript bundle or an SPDX identifier alone is not a complete notice set.

Lucide's original notice includes ISC terms and a separate MIT attribution for icons derived from Feather. Preserve the whole applicable notice rather than retaining only the `ISC` package label. The [official Lucide license page](https://lucide.dev/license) describes both parts.

For example, Apache-2.0 redistribution conditions include providing the license and retaining applicable notices, including an upstream NOTICE where applicable. The [original Apache-2.0 text, section 4](https://www.apache.org/licenses/LICENSE-2.0) controls; this summary does not replace it or establish which files apply to a particular output.

## Runtimes And Native Components

Node.js, Electron/Chromium, ONNX Runtime, sharp/libvips and their native or embedded components are not covered by the project MIT file. A full portable package requires version-specific original notices for the actual binaries, including Electron's `LICENSES.chromium.html` and any applicable nested license material.

The current Windows sharp package `@img/sharp-win32-x64@0.35.5` declares `Apache-2.0 AND LGPL-3.0-or-later`. Treating it as only Apache-2.0 would lose a declared term. Native binary, source-availability and other applicable distribution requirements need their own release-specific review; this document does not establish that those obligations have been met.

## Fixed Model Artifacts

| Artifact | Frozen identity | Notice status |
| --- | --- | --- |
| Embedding | `Xenova/multilingual-e5-small@761b726dd34fb83930e26aab4e9ac3899aa1fa78:q8` | Exact upstream conversion input and complete applicable license/notice chain remain unresolved |
| Reranker | `onnx-community/bge-reranker-v2-m3-ONNX@6f5ff65298512715a1e669753bc754d2bc8f367b:q8` | Exact upstream conversion input and complete applicable license/notice chain remain unresolved |

The fixed conversion repositories are [embedding](https://huggingface.co/Xenova/multilingual-e5-small/tree/761b726dd34fb83930e26aab4e9ac3899aa1fa78) and [reranker](https://huggingface.co/onnx-community/bge-reranker-v2-m3-ONNX/tree/6f5ff65298512715a1e669753bc754d2bc8f367b). A current upstream license label, another revision's license, or a provenance research note must not be substituted for the missing applicable original notice chain. Model redistribution is not cleared by this document. Models are not included in the proposed source-only preview.

## Remaining Release Work

Before any distribution, freeze its file inventory and scope, establish source/asset provenance, reconcile actual bundled and binary components against the lockfile, retain the applicable unmodified notices, and resolve missing terms. Public web references or privately indexed content are not licensed for redistribution merely because AnySearch can retrieve them. No claim of complete license coverage, legal clearance or acceptance is made here.
