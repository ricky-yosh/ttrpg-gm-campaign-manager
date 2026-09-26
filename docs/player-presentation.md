# Player Presentation

Working design for the read-only window shown on a projector or second screen. The GM controls it from **Presenter mode** in the main app; players do not edit or navigate the projected window directly. It presents selected, player-safe campaign information without copying the GM workspace layout.

## GM control and player output

- **Presenter (GM):** Enter from the top-bar button or shortcut to compose the output, choose the active view, manage overlays and NPC presence, and see a live preview. It is a mode, not an outer GM workspace tab.
- **Player Presentation (players):** Show only selected, player-safe campaign content. It contains no GM notes, hidden map pins, private NPC information, or editing controls.

## Player-facing layout

The projector is a **presentation canvas**, with no persistent sidebar or controls that imply players can navigate it. The GM chooses the live view from Presenter mode. Its content comes from the same campaign records as the GM workspace, filtered to fields the party may see.

- **Base view:** A map, current area, scene image, or full-page reference such as Inventory or Characters. A small title or location label may give context without taking substantial screen space.
- **Available views hint:** A brief, noninteractive overlay lists the views players can ask to see and emphasizes the current one. The GM can show it on demand; it also appears after a base view change and when Pause ends. It then fades so maps and scenes regain the full canvas.
- **Spotlight:** A temporary public card or image over the base view, such as an NPC card or item reveal. Clearing it returns to the underlying view.
- **Presence layer:** NPC portraits and speaker state can remain over any base view. The GM may hide or reposition this layer when it covers important content.

The GM app uses one sidebar and one tab bar that change contents with the mode. In Presenter mode they show player-facing content and Presenter view tabs; in GM mode they show campaign navigation and GM tabs. Neither sidebar state nor Presenter tabs are projected. There is no split preview: the central preview shows one view at a time, labeled Live or Next. Players can ask for a reference while the GM stays in session notes; the GM can open that record's public version in Presenter, or Pause and stage it first.

## Presentation session

The top-right **Play** triangle opens or restores the player window. While active it becomes a square **Stop** button beside **Pause**; while paused, Pause becomes a triangle **Resume** button. The centered top-bar search remains available through `Cmd+K`. A separate clickable **Presenting** status shows a halo and accumulated elapsed time. The status or `Cmd+Option+P` toggles between Presenter and the prior GM workspace without stopping output. The player window never shows these GM controls or timer.

The app saves the complete presentation checkpoint as presentation changes happen: last player-safe Live image/frame, staged Next view, overlays, all open and active tabs, scroll positions, map pan/zoom and framing, paused state, and accumulated elapsed time. The square Stop button and closing the player window, including its system close control, are the same action. Both save the final checkpoint and end active output. Pressing Play again restores that checkpoint instead of starting from an empty Presenter. If the checkpoint was paused, the restored player window shows its saved Live frame and remains paused until Resume. A deliberate **New Presentation** action can reset the output and timer while keeping the GM's open tabs.

The saved "frame" means presentation state details: selected view and records, image asset references, overlays, positions, and the other checkpoint fields above. It does not require screenshot capture or video recording. Keep enough player-safe display data to restore the held view when paused.

### Updates to displayed records

While output is running, successfully saved changes to public information already displayed automatically refresh that content on the player screen. For example, saving an edit to the visible NPC's public description updates its card without another Present action. Unsaved edits and private fields are not published, and editing a different record does not switch the active view. Preserve the current framing and scroll position when refreshing content where possible.

While paused, saved changes do not alter Live. Relevant public changes update the staged Next view and become visible on Resume. Ordinary GM navigation still does not change what is presented.

### Available views hint

The hint is an orientation cue, not a second sidebar. For example, while Maps is live it might read:

```text
Inventory
Maps                 ← current
Characters
```

When the GM switches to Inventory, Inventory becomes the emphasized row. The list contains only views enabled for players; it never names private GM workspaces. Related views can share a short label: Full Map and Current Area may both appear under **Maps**, with the current map name shown separately if useful. Keep the hint visually distinct from clickable controls, readable at projector distance, and positioned away from critical map detail and the NPC presence strip.

Show the hint automatically when a different base view goes Live and whenever **Resume** ends Pause, so players regain their bearings. Changing only a speaker portrait or temporary card does not retrigger it. The GM has a **Show Views Hint** cue for reminders while output is running. Start with a roughly four-second display before it fades; the GM can dismiss it earlier. While Paused, the frozen player image must not change, so a requested hint waits until Resume.

## Live, Next, and Pause

- **Live** is the exact player-safe state currently on the projector. Browsing or editing GM records does not change it. While running, selecting a Presenter view tab changes Live immediately.
- **Next** is the private, player-safe state being prepared while Paused. Switching Presenter tabs, choosing an NPC directory, panning a map, or choosing an image while Paused changes Next only. The GM can toggle the single preview between Next and the paused Live frame.
- **Pause** freezes Live, including overlays, while the GM stages changes or handles unexpected work. The projector retains that exact frame even if underlying public records change. An explicit Present action from elsewhere also stages rather than bypassing Pause. The GM window clearly indicates Paused.
- **Resume** publishes Next in one step if it differs from Live; otherwise the same Live frame continues. The available views hint appears in either case. **Discard staged changes** sets Next back to Live before resuming when the GM wants to keep the prior view.

For example, the GM can keep **Maps**, **Inventory**, and **Characters** open as Presenter view tabs. While running, one click on the Inventory tab changes the projector to Inventory. If the GM needs to find a particular NPC, they can Pause the current view, select the Characters tab, locate the public card privately, and press Resume when ready. Switching to GM mode restores the prior session-notes tab and its scroll position; the projector remains on that NPC until a Presenter action changes the view or the player window closes. Saved public edits to that NPC refresh its displayed content while running.

| View | What players see |
| --- | --- |
| **Inventory** | The party's player-visible items and relevant item details. |
| **Crafting Progress** | The party's current crafting projects, materials collected, progress, and completed results that the GM has chosen to reveal. |
| **Characters** | A directory of NPCs the party knows, with only their revealed names, portraits, and public details. The GM can open a player-safe NPC card from this view or directly during play. |
| **Factions** | A directory of factions the party knows, with their revealed descriptions, symbols, and public relationships. |
| **Locations** | Places the party knows about, with revealed descriptions and links to player-safe maps when available. |
| **Full Map** | A larger campaign or city map with only discovered or GM-revealed information. “Full” refers to the map view, not permission to see secret pins or unexplored areas. |
| **Current Area** | The active battle map or dungeon/exploration map, including player-visible tokens and fog state. |
| **Scene** | A static mood image or other visual the GM wants to hold on screen between maps and encounters. |

The player window should never show GM-only destinations such as private session plans, hidden enemies, or editing settings.

**Known to the party** is persistent campaign knowledge. **On screen now** is temporary presentation state. A known NPC need not be present in the current scene; an unknown person can appear as a silhouette in the NPC overlay without appearing in Characters. Revealing their identity can add their public profile to Characters when the GM chooses.

## NPC presence overlay

An NPC portrait strip can appear above **any** view without replacing it. It helps players recognize who is present and who is speaking.

| State | Display |
| --- | --- |
| **Present, not speaking** | Portrait remains visible but muted or greyed. |
| **Speaking** | Portrait becomes full opacity and gains a clear border or speaker marker. |
| **Unknown identity** | Use a silhouette with a `?` and a neutral public label such as “Unknown”; it can still be marked as speaking. |
| **Absent** | Remove the portrait from the strip. |

Identity and speaking status are separate: an unknown person can be the current speaker, and a known NPC can be present but quiet. The GM controls both states. Use more than opacity or color alone to distinguish the speaker, and keep portraits readable against bright maps and dark scenes. The strip should have a safe position or layout option so it does not cover important map details.

## NPC card is a different presentation

When players ask what they know about an NPC, the GM can open a larger **NPC card** with selected public details and an image. This is a deliberate reference view, distinct from the compact presence overlay. Closing the card returns to the prior map, inventory, or scene view with the NPC presence strip intact.

## Presentation safety

The player window should receive an explicit player-safe **Live** state assembled by the GM app. Private fields must be excluded from that state rather than merely hidden by styling. The GM's single preview should render either Live or a separately assembled, player-safe Next state, with a clear label. Ordinary GM navigation and private edits are never mirrored to the player window; deliberate Presenter tab selection while running is a live cue.

The campaign should have one source record for each NPC, faction, and location. The player directory is a filtered projection of those records, not a separate copy that the GM has to maintain. The GM controls whether a record is known to players and edits its public details separately from private notes.

## Questions to discuss

- Should the NPC strip sit along the bottom or side by default, and may the GM reposition it per scene?
- Does opening an NPC card fill the main canvas or appear as a large overlay over the current view?
- What item details belong in the projected Inventory view, especially for unidentified items?

## Layout alternatives considered

| Pattern | Benefit | Cost | Decision |
| --- | --- | --- | --- |
| Persistent player sidebar | Categories remain visible | Repeats GM navigation, takes map space, and can look interactive on a display players cannot control | Do not use for the projector |
| Context strip or small heading | Gives orientation with little space | Does not advertise all available references | Use where context helps |
| Transient available views hint | Gives orientation after a switch or Pause release and can be shown on request | Only visible briefly | Use on the projector |
| Player-controlled companion app | Players can browse known information themselves | Adds devices, synchronization, permissions, and a separate interaction flow | Revisit if direct player access becomes a goal |

The same player-safe data projection can later serve an interactive player companion with real navigation. That would be a separate interface, not a duplicated projector sidebar.

## Interaction references

- [Owlbear Rodeo casting](https://docs.owlbear.rodeo/docs/casting/) lets the GM cast a player-safe view, hide cast UI, and sync its framing when the cast device has no input.
- [GMhub Community Screen](https://github.com/b34rblack-glitch/GMhub-CommunityScreen) is an open-source tabletop example of a clean TV view with content pushed from the GM screen.
- [ProPresenter's user interface](https://support.renewedvision.com/hc/en-us/articles/360041345954-Understanding-The-ProPresenter-User-Interface) keeps live controls with the operator; its [output layers](https://support.renewedvision.com/hc/en-us/articles/13634000690323-ProPresenter-Output-Layers) support independent audience content layers.
- [Nielsen Norman Group: clickable elements](https://www.nngroup.com/articles/clickable-elements/) explains why controls should have recognizable interaction cues. Applying that guidance here, a noninteractive projector should avoid navigation-shaped decoration.

## Accessibility reference

- [W3C: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color) explains why the speaking state should use a shape, label, or marker in addition to color and opacity.
