# UI/UX

Working notes for the GM workspace and the player-facing window. See [Brainstorm](brainstorm-doc.md) for the broader feature ideas and [Player Presentation](player-presentation.md) for the projected window's content and overlays.

## App shell

The GM works in one main app window. Campaign records can open in tabs and resizable side-by-side or stacked panes so the GM can keep, for example, session notes beside an NPC card or map. Presenter is a dedicated mode entered from the top bar rather than a tab. The same tab bar shows GM tabs or Presenter view tabs depending on the mode. Presenter has one preview and no split view. Both modes' layouts should be restored when the campaign is reopened.

### Top bar

- **Sidebar toggle:** An icon closes and reopens the sidebar.
- **Back / Forward:** Arrow buttons beside the sidebar toggle, in the top-left navigation cluster. Keep global search centered and presentation controls on the right. Disable an arrow when there is no available destination.
- **Global search:** A search control in the **center** of the top bar opens the command palette. `Cmd+K` opens the same palette from anywhere in the GM app to find and open campaign content.
- **Presentation controls:** In the **top right**, a triangle **Play** button opens or restores the player window on a projector or second screen and enters Presenter mode. While running, Play becomes a square **Stop** button beside a **Pause** button. While paused, Pause becomes a triangle **Resume** button; Stop remains available. A separate clickable **Presenting** status with a halo and elapsed time, or `Cmd+Option+P`, switches between Presenter and the GM's previous campaign workspace without stopping output. The player window shows only player-facing content.

The top bar stays available across the GM workspaces. Global search belongs here, not in the sidebar.

### Workspace tabs and windows

- Closing a GM tab or workspace window keeps it available in a recently closed list.
- `Cmd+Shift+T` reopens the most recently closed tab in the current mode or a recently closed GM workspace window, including its content and split layout when possible. It does not reopen the player window: closing that window ends the presentation.
- Reopening a closed view is a workspace navigation action; it does not undo an edit to campaign data.
- Each mode remembers its own open tabs and selected tab. GM tabs also remember split layout and pane sizes; Presenter tabs remember their selected player-safe record or map. Each tab keeps its own scroll position, map pan and zoom, and relevant local selection or filters. Switching modes restores these positions without reloading a different view onto the projector.
- Restore these workspaces when the campaign reopens. Reopening the campaign restores the GM and Presenter layouts, but does not start a presentation or reopen the player window.

### Back and Forward navigation (behavior proposal)

- Follow the order of visited destinations, including tab switches, sidebar selections, and record links. For example, Sessions → NPC → Map → Back returns to the NPC. These arrows follow visit history rather than the tabs' left-to-right order.
- Keep a separate history for each campaign, GM window, and mode. Back does not switch from GM into Presenter mode or start/stop a presentation.
- Focus an existing destination tab and pane where possible. If its tab was closed, reopen the destination without reconstructing an entire old split layout. Skip deleted or unavailable destinations gracefully.
- Restore the destination's latest remembered scroll, selection, and map position. Scrolling, typing, moving tokens, and panning do not each add navigation entries. Navigation never restores an older version of a record or discards its draft.
- Going Back and then opening a different destination clears the forward branch. Back/Forward traversal does not append new visits; selecting the already active destination does not add a duplicate.
- In Presenter mode, history navigation follows the same rules as selecting a Presenter tab: publish player-safe content while running, stage Next while paused. It does not replay old overlays, media playback, or presentation commands. GM history never changes the projector.
- Suggested shortcuts: `Cmd+[` / `Cmd+]` on macOS and `Alt+Left` / `Alt+Right` on Windows/Linux. Avoid intercepting editor-owned shortcuts or text selection. Final shortcut conflict checks belong to implementation.

### Sidebar

The app has **one sidebar shell and one tab bar**. In GM mode they show campaign navigation and GM tabs; in Presenter mode they show player-facing views, presentation cues, and Presenter tabs. Each mode remembers the sidebar's open or closed state and width. The top bar remains in place in both modes.

- **Campaign selector**
- **Overview**
- **Sessions:** The next session and previous sessions
- **Characters:** NPCs and enemies
- **Factions**
- **Locations & Maps**
- **Items:** Including crafting
- **Story Threads**
- **Puzzles**
- **Settings:** Shows D&D 5.5e as the current statblock field set; v1 offers no other choice

Selecting a sidebar destination opens its workspace in the main area. Campaign records within it can open in tabs or split panes.

## Shared UI foundations

- Establish core reusable components as the first screens are built, including buttons, inputs, tabs, split panes, inspectors, dialogs, popovers, toasts, and record cards.
- Define shared color tokens with light and dark mode variants so the GM workspace and player-facing window remain consistent in both themes.
- Check contrast, focus states, and readability in both variants, especially for maps, overlays, and projected content.

### UI tooling decision

Use **shadcn/ui and Tailwind CSS v4** with the existing React, TypeScript, and Vite frontend. These are selected tools; installation and integration remain implementation work.

- **shadcn/ui:** Use its editable component source as the foundation for our component library: buttons, forms, dialogs, menus, sidebar, command palette, and resizable panels. Keep primitives in `src/components/ui/` and campaign-specific components such as NPC cards and presentation controls in `src/components/campaign/`. Review upstream changes when updating customized components. See the [shadcn introduction](https://ui.shadcn.com/docs).
- **Workspace behavior:** The [Resizable component](https://ui.shadcn.com/docs/components/resizable) supplies pane resizing through `react-resizable-panels`. Tab lifecycle, split-layout persistence, mode switching, scroll restoration, and Live/Next behavior remain application responsibilities. Presenter still has one preview and no split view.
- **Tailwind and themes:** Establish semantic tokens for surfaces, text, spacing, typography, focus, selection, and Live/Paused states. Define light and dark variants centrally. GM and player views may use different density and sizing while sharing appropriate primitives. See [shadcn theming](https://ui.shadcn.com/docs/theming) and [Tailwind's Vite integration](https://tailwindcss.com/docs/installation/using-vite).
- **Desktop compatibility:** Choose and test minimum supported operating-system/webview versions before release. Tailwind v4 documents browser baselines including Safari 16.4 and Chrome 111; Tauri uses platform webviews, so testing in a development browser alone is insufficient. See [Tailwind compatibility](https://tailwindcss.com/docs/compatibility) and [Tauri webview versions](https://v2.tauri.app/reference/webview-versions/).

### Design-system linting

Adopt **`@shadcn/lint`** incrementally as the component conventions settle. It supports Tailwind v4 and integrates with ESLint or Oxlint; choose a supported linter/version during setup. Begin with `no-raw-colors`, `no-unknown-classes`, and `no-restyle`, allowing layout adjustments. Component implementations need the documented overrides so they can define their own appearance.

Define narrow exceptions for dynamic map/token coordinates, zoom transforms, overlay positioning, and user-selected colors. Do not apply blanket bans on inline styles or arbitrary values to these features. Tighten rules after the first components establish usable variants. Lint checks supplement visual, contrast, keyboard, and projector-readability reviews. See the [official linter repository](https://github.com/shadcn-ui/lint) and [rule configuration](https://github.com/shadcn-ui/lint/blob/main/docs/rules.md).

## Interaction language

Use a content-first desktop workspace. The surface chosen for an action should follow its purpose consistently across sessions, NPCs, maps, and other records.

| Surface | Use it for | Example |
| --- | --- | --- |
| Main tab or split pane | Reading, writing, or comparing campaign content for more than a quick action | Edit session notes beside an NPC card or map |
| Inline right-side inspector | Contextual details and short edits while keeping the main content visible | Edit a map marker's label or an NPC card's public details |
| Modal dialog | A brief decision that must interrupt the current task | Confirm removing a record; name a new campaign |
| Popover or menu | A short list of choices anchored to the control that opened it | Choose a map layer or a record action |
| Toast or inline message | Non-blocking feedback; show errors next to the affected field when possible | Confirm a save or offer Undo after a change |
| Command palette | Search and keyboard-driven navigation or actions | `Cmd+K` to find a session or NPC |
| Separate player window | Content the GM chooses to present to players | Map, scene image, or NPC portraits |

Long forms and reference material belong in tabs or panes, not modals. The right-side inspector is an inline panel that can be shown or hidden; it should not block work in the main pane. Avoid stacking dialogs. Player-facing image overlays are part of the presented scene and are distinct from GM-interface panels or dialogs.

## Presenter mode

Presenter is a full GM mode entered with Play or `Cmd+Option+P` while output is active. It controls the separate, read-only [Player Presentation](player-presentation.md) window. The same sidebar changes its contents when the mode changes: campaign navigation in GM mode, player-facing views and cues in Presenter mode. The projector still shows a clean presentation canvas. Presenter mode has a clear **Presenting** heading and subtle active outline; the top-right status keeps its halo and timer even when the GM returns to Sessions or another workspace. Clicking the status or using the shortcut switches modes on demand.

In Presenter mode the sidebar lists the player-facing views and content available to open: Maps, Inventory, Characters, Factions, Locations, Crafting Progress, Scene, and prepared media. Opening one creates or focuses a **Presenter view tab** in the shared tab bar. Switching back to GM mode restores the GM tab set in that same bar. Presenter remains a single-pane workspace with one preview and no split view.

When output is running, selecting a Presenter view tab immediately shows its player-safe content on the projector and triggers the Available Views hint. Opening or switching ordinary GM workspace tabs, such as Sessions and Characters, never changes the projector. While **Paused**, Presenter tab switches change only the private staged view; the projector keeps its previous frame. The central preview shows one view at a time, labeled **Live** or **Next** as appropriate. A **View Live** control lets the GM inspect the paused output without a side-by-side preview. Pressing the top-right triangle **Resume** atomically publishes Next, or keeps Live if nothing was staged, and shows the views hint. A **Discard staged changes** action restores Next from Live before resuming. Mark the live tab clearly when a different tab is staged.

The square **Stop** button closes the player window and ends active output. Closing the player window directly performs the same Stop action. The halo disappears and the GM returns to the prior workspace if Presenter was open. Save the last player-safe Live frame, any staged Next view, paused/running state, elapsed presentation time, Presenter view tabs, and their scroll or map positions. The next Play restores that saved presentation, including its paused state, and continues the timer from its saved elapsed duration. A separate **New Presentation** action can reset the saved output and timer when the GM intentionally starts fresh while keeping the workspace tabs.

Successfully saved edits to public information already on screen refresh the player view automatically while running, including edits made from GM mode. Unsaved or private edits are not shown. Refreshing content preserves the selected view and its position where possible. While paused, these updates affect Next and appear on Resume; Live stays frozen. A saved "frame" refers to presentation state details rather than a screenshot requirement.

The GM can:

- Choose which player-facing view is active, including Characters, Factions, Locations, Inventory, Crafting Progress, Full Map, Current Area, and Scene.
- Show a map or static image as the main visual.
- Keep an image on screen for a scene or show one briefly as an overlay.
- Show NPC portraits as a presence overlay over any view, mark who is speaking, and use an unknown silhouette when the party does not know an identity.
- Open a larger player-facing NPC card on request, separate from the presence overlay.
- Show a temporary **Available Views** hint on request; the same hint appears automatically when the live base view changes or output resumes from Pause, highlighting the current view.
- Keep player-facing views open as Presenter tabs and switch among them with one click while live.
- Prepare the next visual while Paused and inspect either Live or Next in the single preview.
- Clear a temporary spotlight and return to the previous map, scene, or reference view.
- **Pause** the current player output while navigating or editing privately, then use **Resume** to publish the staged view. Pausing keeps the exact last player-safe frame on screen, including its overlays, until the GM resumes.

Opening a record from the GM's Characters or Sessions workspace should offer an explicit **Open in Presenter** action using its public version. It switches to Presenter mode and creates or focuses a Presenter view tab; if output is running, that tab is presented immediately, and if Paused, it is staged privately. Ordinary GM navigation never changes Live.

The GM can reach relevant images from session notes and present them quickly during a lull. Songs can also be tied to session notes or story beats; their playback behavior remains to be designed.

## To discuss

- How content moves from a campaign record into Presenter mode.
- Controls for temporary overlays, persistent visuals, and clearing the screen.
- How NPC portraits are arranged and how the current speaker is highlighted.
- Behavior when the player window is moved between displays.
- The visual direction: typography, density, icon style, motion, and how much fantasy styling belongs in the GM workspace versus the player-facing window.
