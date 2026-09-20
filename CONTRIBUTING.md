# Contributing to F2PX

Thanks for helping! F2PX is a small codebase (Electron main process, a sandboxed preload, a React interface) with a strong
opinion: **privacy first, nothing phones home**.

## Setup

```bash
npm install
npm run dev          # development mode with HMR
npm run typecheck
npm run test:unit
npm run build && npm run test:e2e    # drives the real app; needs a Windows desktop session
```

Node 24 is required (SQLite comes from `node:sqlite` inside Electron). If you run the app from a VS Code or Claude Code terminal,
`scripts/run.cjs` clears `ELECTRON_RUN_AS_NODE` for you.

## Ground rules

* **No network on its own.** Nothing may contact a server unless the user asked for it or opted in. `tests/e2e/06-no-background-traffic.mjs` guards this.
  Requests made by the main process go through `src/main/network/netSession.ts` so they follow the selected proxy / Tor route.
* **Fail closed.** If a proxy or Tor is required and unavailable, nothing is sent directly.
* **Every renderer call goes through the typed RPC** (`src/shared/ipc.ts` → `src/main/ipc/handlers.ts`) and declares a scope (`shell` / `page` / `both`).
* **Keep the shield honest.** If you add a protection, add a test that proves it, and state its limits in the README instead of overselling it.
* TypeScript strict mode, no `any` outside `src/preload/shieldMain.ts` (which runs in the page's own JS world and must stay a single self-contained function).
* Match the surrounding style: small modules, short comments that explain *why*.

## Tests

* Unit tests live in `tests/unit.mjs` and `tests/unit-privacy.mjs` (pure logic, no Electron).
* End-to-end suites in `tests/e2e/` launch the built app and drive it over CDP. **Rebuild (`npm run build`) after changing source** — they run `out/`.
* Test pages must not use paths such as `/pixel.gif` — EasyPrivacy blocks them; use `/assets/logo.gif`.

## Filter and threat lists

`npm run filters:update` and `npm run threats:update` regenerate `build/filters.txt.gz` and `build/threats.bin`. Commit the regenerated files
only in a dedicated commit so the diff stays reviewable, and keep [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) in sync when a source changes.

## Pull requests

1. Fork, branch from `main`.
2. Keep the change focused; describe *why* in the PR.
3. Make sure `npm test` passes (and the relevant e2e suites if you changed behaviour).
4. Screenshots are welcome for UI changes (`node scripts/capture-site-screenshots.mjs` regenerates the site shots).

Security problems: please follow [SECURITY.md](SECURITY.md) instead of opening an issue.
