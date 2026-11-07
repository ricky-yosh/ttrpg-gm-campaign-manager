# Development commands

For the new Rust core, JSON-RPC host, CLI, and embedded Turso workflow, see [Headless development](headless-development.md). That workspace builds from the repository root independently of the desktop app. Shared persistence regression tests now run with `cargo test --workspace --all-features` from the root; the desktop crate's tests cover its remaining host-specific code.

Run the commands in this guide from the app directory:

```sh
cd ttrpg-gm-cm-app
```

## Run and build

- `pnpm install` installs the frontend and Tauri CLI dependencies. Run this after cloning or when dependencies change.
- `pnpm dev` starts only the Vite frontend in a browser.
- `pnpm tauri dev` starts the desktop app and its frontend dev server.
- `pnpm build` type-checks and builds the frontend into `dist/`.
- `pnpm lint` runs Oxlint on the frontend code.
- `pnpm test` runs TypeScript business-logic tests with Node's built-in test runner.
- `pnpm tauri build` builds the desktop app and its distributable package.

These are the Tauri CLI's standard development and build commands; see the [Tauri project guide](https://tauri.app/start/create-project/).

## TypeScript tests

Use Node's built-in `node:test` runner for focused TypeScript business-logic tests. Tests live in `tests/*.test.mjs` and can import app `.ts` modules directly through Node's native TypeScript stripping; run them with `pnpm test` from the app directory. Keep logic tests independent of the Tauri UI when possible. Use a browser or end-to-end test tool only when behavior depends on rendering, layout, or real platform integration.

## Inspect React components in the Tauri desktop app

The shortcuts are defined in `ttrpg-gm-cm-app/package.json`. On macOS, use the standalone React Developer Tools app to inspect React components, props, and state in the Tauri window.

From the app directory, open React DevTools in one terminal:

```sh
pnpm devtools
```

This runs `pnpm dlx --allow-build=electron react-devtools`. It downloads the tool into pnpm's temporary package cache, allows Electron's installer to run, and opens the DevTools window. The tool is not added as an app dependency. Leave that terminal and window running.

Stop any existing Tauri development process, then start the app from a second terminal:

```sh
pnpm tauri:devtools
```

This runs `REACT_DEVTOOLS=1 tauri dev`, equivalent to `REACT_DEVTOOLS=1 pnpm tauri dev`. The environment variable enables Vite's connection script at `http://localhost:8097` before React loads. These environment-variable commands work in macOS/Linux shells.

DevTools initially shows **Waiting for React to connect**. Once Tauri loads, the **Components** tab shows the React component tree. Open an NPC panel to inspect `CharacterPanel`, `NpcGmReference`, `NpcPlayerDescription`, and `NpcNotesEditor`. Use the component picker to select UI in the Tauri window, or select a component in the tree to inspect its props and state.

Normal `pnpm tauri dev` leaves the connection disabled. Production builds exclude the connection script, even if `REACT_DEVTOOLS=1` is set.

If the first tool installation reports **Electron failed to install correctly**, use Node 22 or 24 for installation and check the active version with `node --version`. Node 26 can exit before Electron's ZIP extraction finishes, leaving a partial cached installation. If switching Node versions still reuses that broken pnpm cache, launch `npx --yes react-devtools` under Node 22 or 24 to install through npm's separate cache. Keep the same Tauri connection command.

See the [React Developer Tools guide](https://react.dev/learn/react-developer-tools) and [pnpm's build approval option](https://pnpm.io/cli/pnx#--allow-build) for the standalone connection and installer setup.

## Clean generated files

Usually no cleanup is needed. Use these when a build is stale or you need to reclaim space:

- `rm -rf dist` removes the generated frontend build. Vite recreates it on the next build.
- `cargo clean --manifest-path src-tauri/Cargo.toml` removes Rust build artifacts under `src-tauri/target/`. Cargo will rebuild them next time.
- `rm -rf node_modules && pnpm install` removes and reinstalls frontend dependencies if the install is broken. It does not remove the pnpm package store.

Cargo's clean command removes generated artifacts from its target directory; see the [Cargo clean reference](https://doc.rust-lang.org/cargo/commands/cargo-clean.html).

## Try campaign persistence

Start the desktop app with `pnpm tauri dev` (restart it after adding Rust commands or plugins). Click **Save** to keep the sample campaign, or **New campaign** to create an empty one. On first Save, the native Save dialog starts with the campaign name and a `.campaign` file-type filter; the app attaches `.campaign` after the user accepts the name. The app creates a package folder containing `campaign.sqlite` and `assets/`. In a built and registered macOS app, Finder presents it as one item with **Show Package Contents** available for browsing. New campaigns are unsaved drafts until their first Save. Closing or switching away from unsaved work offers Save, Don’t save, and Cancel. Choose Close without saving to discard an accidental campaign without creating a file. Previously saved campaign files are retained.

Click **New NPC**, enter a name, then edit its notes. Insert an image with the note toolbar. Once a campaign file exists, edits autosave; the Save button also flushes pending changes. **Open campaign** reopens a saved package and restores its NPCs and workspace layout. For a backup, wait for **Saved**, then ZIP the entire `.campaign` folder, including `campaign.sqlite` and `assets/`.

Storage regression checks:

- From the repository root, `cargo test --workspace --all-features` checks portable image/note round trips, missing/corrupt assets, failed-save preservation, the Turso adapter, and the legacy persistence adapter. `cargo test --manifest-path src-tauri/Cargo.toml` from the app directory checks desktop-specific image conversion.
- `node --test tests/campaign-store.test.mjs` (Node 22.18+ with native TypeScript stripping, or newer) checks concurrent save requests, edits during a write, duplicate NPC names, canceled/failed opens, campaign isolation, discarded drafts, close cancellation, and autosave suspension through mocked Tauri IPC.

Frontend builds and browser UI checks do not exercise native file dialogs. For desktop verification, create two `.campaign` packages, add/edit NPCs and a local image, split their tabs, close/restart the app, reopen each campaign, and repeat after moving one folder. Check normal window close and canceling the first-save dialog as well.
