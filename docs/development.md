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
- `pnpm tauri build` builds the desktop app and its distributable package.

These are the Tauri CLI's standard development and build commands; see the [Tauri project guide](https://tauri.app/start/create-project/).

## Clean generated files

Usually no cleanup is needed. Use these when a build is stale or you need to reclaim space:

- `rm -rf dist` removes the generated frontend build. Vite recreates it on the next build.
- `cargo clean --manifest-path src-tauri/Cargo.toml` removes Rust build artifacts under `src-tauri/target/`. Cargo will rebuild them next time.
- `rm -rf node_modules && pnpm install` removes and reinstalls frontend dependencies if the install is broken. It does not remove the pnpm package store.

Cargo's clean command removes generated artifacts from its target directory; see the [Cargo clean reference](https://doc.rust-lang.org/cargo/commands/cargo-clean.html).
