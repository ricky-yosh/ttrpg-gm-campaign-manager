# Agent guidance

## Tech stack

- Frontend: React with TypeScript, built with Vite.
- Styling and components: Tailwind CSS and shadcn/ui. Use the project's configured shadcn style and component conventions.
- Dockable workspace layout: Dockview (`dockview-react`).
- Frontend state management: Zustand, including Back/Forward navigation history.
- Interactive map canvas: Konva with its React bindings (`react-konva`). Use it for rendering and interacting with imported map images, pins, tokens, fog, grids, and map gestures.
- Rich text editing: Plate (`platejs` and the `@platejs/*` packages). The project uses the Plate registry configured in `components.json`.
- Desktop shell and backend: Tauri 2 with Rust.

## Documentation

- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/docs/)
- [Vite](https://vite.dev/guide/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [shadcn/ui](https://ui.shadcn.com/docs)
- [Dockview React](https://dockview.dev/docs/overview/quickstart/?framework=react)
- [Konva React integration](https://konvajs.org/docs/react/index.html)
- [Plate](https://platejs.org/docs)
- [Tauri 2](https://v2.tauri.app/)
- [Rust](https://doc.rust-lang.org/book/)

## UI implementation

- Prefer Tailwind CSS utilities and existing shadcn/ui components over custom CSS or one-off UI components.
- Extend or compose the project's shadcn/ui components when they need app-specific behavior. Add custom styling or components when the existing patterns cannot meet the requirement.

## Change checks

After making changes to this app, run `pnpm lint` and fix all errors.
