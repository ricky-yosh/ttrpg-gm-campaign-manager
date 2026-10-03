# Development commands

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
- `pnpm tauri build` builds the desktop app and its distributable package.

These are the Tauri CLI's standard development and build commands; see the [Tauri project guide](https://tauri.app/start/create-project/).

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

- `cargo test --manifest-path src-tauri/Cargo.toml` checks portable image/note round trips, missing/corrupt assets, and preservation of the previous document on failed saves.
- `node --test tests/campaign-store.test.mjs` (Node 22.18+ with native TypeScript stripping, or newer) checks concurrent save requests, edits during a write, duplicate NPC names, canceled/failed opens, campaign isolation, discarded drafts, close cancellation, and autosave suspension through mocked Tauri IPC.

Frontend builds and browser UI checks do not exercise native file dialogs. For desktop verification, create two `.campaign` packages, add/edit NPCs and a local image, split their tabs, close/restart the app, reopen each campaign, and repeat after moving one folder. Check normal window close and canceling the first-save dialog as well.
