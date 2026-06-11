# Sky Novel Hermes

Sky Novel Hermes is a Tauri desktop app for lawful novel download management, local library organization, AI-assisted analysis, preview, and export packaging.

The GUI is built with Tauri, Vite, React, and TypeScript. Crawling, queueing, storage, exports, and AI analysis run in a Node.js v22 local service. The first hard-coded site adapter targets `https://big5.quanben5.io`.

## Requirements

- Node.js 22+
- pnpm 9+
- Rust stable and Cargo for Tauri
- A running LiteLLM/OpenAI-compatible API endpoint if AI features are enabled

## Quick Start

```powershell
pnpm install
pnpm dev
```

`pnpm dev` runs the Node service and Tauri desktop app in parallel. You can also run them in two terminals when debugging one side at a time:

```powershell
# terminal 1
pnpm dev:service

# terminal 2
pnpm dev:desktop
```

The Node service defaults to `http://127.0.0.1:17891`. The desktop app reads from `VITE_HERMES_SERVICE_URL` when set, otherwise it uses that local URL.

## First Sample

The initial sample source is:

```text
https://big5.quanben5.io/n/moshi_wodunliaoyiwanwuzi/xiaoshuo.html
```

The `quanben5-big5` adapter extracts book metadata, catalog entries, and authorized chapter content. Downloader behavior is rate-limited and records source attribution.

## Main Scripts

- `pnpm dev` runs service and desktop in parallel.
- `pnpm dev:service` runs the Node service.
- `pnpm dev:desktop` runs the Tauri desktop app.
- `pnpm build` builds all packages.
- `pnpm test` runs package tests.
- `pnpm typecheck` checks TypeScript.

Run `pnpm build` before using package-level `start` scripts that expect generated `dist/` output.
The default desktop build skips Windows installer bundling so local verification does not depend on downloading WiX/NSIS. Use `pnpm --filter @sky-novel-hermes/desktop build:bundle` when you explicitly need an installer.
