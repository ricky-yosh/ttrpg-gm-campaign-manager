# NPC Presentation Design Notes

## Goal

Design one complete GM-authored NPC reference page, with an optional combat statblock that can be as long and detailed as the supplied second reference image. The statblock is part of the same page, not a separate tab. The player window gets a much smaller presentation: the NPC's portrait and a short, explicitly player-facing description.

These notes interpret the two supplied images as visual references, not as instructions to copy their text, names, illustrations, exact layout, or game rules. The first image suggests the breadth and editorial hierarchy of an NPC dossier. The second suggests the density and variable length of a full combat statblock.

## Current implementation

- NPC records retain their Plate notes and add a saved presentation model for banner, portrait, player description, GM reference, and a ruleset-versioned statblock.
- The GM NPC page is read-only by default. Edit mode stages a draft until Save changes; Cancel restores the saved values.
- The statblock is inline with the GM reference. The initial field set is D&D 5.5e; the campaign Settings view identifies the active field set.
- Presenter preview and the separate player display use only the NPC name, portrait, and player description. Live and paused behavior remains in memory for this first pass.
- Campaign packages store image data through the managed asset pipeline and continue to open older packages with default NPC presentation values.

Keep the existing NPC record as the single source of truth. Treat the NPC page as GM material by default. Add a dedicated **Description for Players** field and an explicit player-safe portrait reference; never repurpose the existing private notes as public content.

## NPC dossier content

Treat the GM's NPC page as several named sections rather than one enormous text field. The GM can keep the full character concept, history, personality, and secrets together, while one short **Description for Players** block is intentionally written for projection. Suggested sections based on the first reference:

| Section | Suggested content | Initial visibility |
| --- | --- | --- |
| Name and epithet | NPC identity, title, optional short subtitle | GM reference; choose the player display name deliberately |
| Banner | Optional wide image for the GM's NPC page | GM-only by default |
| Portrait | Optional artistic/full-body NPC image | Explicitly player-safe when selected for presentation |
| Description for Players | A few concise sentences introducing the NPC | The primary player-facing prose block |
| Token image | Compact combat/map representation, placed in the statblock | GM combat/map use |
| Description / background | Full appearance, history, and relevant context | GM-only |
| Characteristics | Wants, ideals, bond, flaw, secrets, reaction | GM-only |
| Roleplaying notes | Personality, mannerisms, notable actions, voice | GM-only |
| Combat statblock | Rules-facing statistics and abilities | GM-only by default; inline on the same page |
| Other GM notes | Clues, reminders, spoilers, and freeform prep | GM-only |

The default should protect surprises. In particular, a section labeled “Secrets” must not become public merely because the NPC is presented. For the first player view, publish only the selected portrait and **Description for Players**. Everything else stays GM-only unless a later feature adds a deliberate, separately scoped reveal. A temporary on-screen display should not silently mark an NPC as permanently known to the party.

### NPC banner

Give each NPC a dedicated optional banner asset, separate from the portrait. The banner is a wide visual header for the GM's NPC page; the portrait remains the recognizable image of the character. Let the GM choose/import, replace, or remove the banner in edit mode, reusing campaign-managed media assets. Keep the banner out of the initial player projection; decide later if the GM should be able to include it in a reveal.

Render the banner across the GM page's content width near the top, with a consistent maximum height and a cover-style crop that does not distort the source. Preserve an adjustable focal position if the image crop needs tuning. If no banner is assigned, omit the region rather than leaving a blank slab. Provide an accessible image label and clear replace/remove controls in the editor.

### NPC portrait

Give each NPC a dedicated portrait asset field. In the GM page, reserve a prominent portrait area near the name and description (like the portrait column in the first reference), separate from the banner and long-form text. The portrait can be full-body character art or another expressive illustration; it is not the token. Let the GM choose/import an image, replace it, or remove it while in edit mode. Reuse the campaign's managed media assets rather than embedding image bytes in NPC text. Keep its campaign asset ID with the NPC record.

In the player display, show the artistic portrait with **Description for Players** when the GM presents that NPC. If no portrait is assigned, use a deliberate initials/silhouette fallback rather than a broken image or a large blank area. Preserve a useful crop/focal position and do not distort images. The editor should include an accessible image label/alt text and clear replace/remove affordances.

### Responsive GM page layout

Below the full-width banner and NPC identity, let the ruleset-specific statblock occupy a bounded upper-right area while the portrait, **Description for Players**, and narrative GM reference begin on the left and flow beside it. Once the text passes the bottom of a short statblock, let it use the full page width so there is no empty right-side gap. Keep everything in one continuous page with one natural page scroll; the statblock is not a tab or separately scrolling pane. When the available panel width becomes too narrow, stack the content in this order: portrait, statblock (including its token image), **Description for Players**, then the remaining GM reference. Base this switch on available container width (including Dockview splits), not only the overall window width.

### Token image

Keep the tabletop token image separate from the artistic portrait. Place its picker and preview inside the statblock's identity/core-stat area so it is understood as combat/map representation. The GM can import or choose a compact token image independently; do not automatically crop or reuse the portrait. Keep token rendering concerns such as circular masks, borders, and map scale with the token/map UI rather than applying them to the portrait. The initial player projection includes the portrait and **Description for Players**, never the token image.

## Statblock direction

The statblock is a substantial block within the same GM NPC page, not a separate tab or view. It may be much longer than the narrative sections, so the page should use natural vertical scrolling and a clear heading hierarchy. Keep the NPC identity easy to recognize as the GM scrolls. Include the distinct token image in its identity/core-stat area. On wide panels, narrative content flows to its left and continues across the full width beneath it once the statblock ends. On narrow panels, place the statblock above **Description for Players**. The initial player projection does not include the statblock or token image.

The statblock field set comes from the campaign's selected TTRPG type and rules version. The NPC dossier is system-neutral; the statblock editor and renderer are selected by a field-set ID/version. Do not put D&D-only fields directly on the common NPC object or assume that all TTRPGs share ability scores, defenses, or action categories.

The existing [campaign data-model notes](data-model.md#design-principle) specify one bundled field set for v1: D&D 5.5e. Settings should identify that active campaign field set. Statblock values should retain their field-set ID and version, so changing the campaign's selected TTRPG later changes the editor for new values without erasing or silently converting existing statblocks. The available D&D 5.5e categories can include creature type/size/alignment, armor class, hit points, speed, six ability scores, saves, skills, resistances/immunities, senses, languages, and challenge information, plus repeatable named features with rich-text descriptions. Optional feature groups should not render as empty headings. Avoid deriving challenge rating, attack bonuses, or damage automatically in the first pass.

Keep the field-set definition responsible for labels, field types, validation, grouping, and rendering order. Keep individual feature descriptions flexible and long-form so a boss statblock can be as long as the second reference. Do not make the rules engine a prerequisite for storing or presenting these values. For the D&D 5.5e field set, the official 2024 Basic Rules use categories including Traits, Actions, Bonus Actions, Reactions, and Legendary Actions ([Creature Stat Blocks](https://www.dndbeyond.com/sources/dnd/br-2024/creature-stat-blocks)); that reference informs the D&D field set only and does not define the generic NPC model. The supplied image remains a reference for information density, not a binding schema.

## GM authoring experience

Extend the existing NPC editor rather than creating a second NPC system. Keep one scrollable GM-authored NPC page with:

1. **NPC identity and art** — name, banner, artistic portrait.
2. **Description for Players** — short, intentionally public-facing text.
3. **GM reference sections** — background, characteristics, roleplaying notes, and private prep.
4. **Combat statblock** — optional, potentially long rules data and a separate token image, inline in the same page.

### Read and edit modes

The NPC page opens in read mode by default. A clearly labeled pencil icon/button enters edit mode so ordinary viewing, selecting text, or scrolling cannot accidentally change content. Show an unsaved-changes indicator while a draft differs from the saved NPC record.

Edits are a local draft until the GM chooses **Save changes**. Saving applies the draft to the campaign record; the app's campaign persistence then saves the committed change. **Cancel** discards the draft and returns to read mode with the prior saved content. Neither typing nor leaving an input should mutate the NPC record. If the GM tries to leave edit mode or switch NPCs with a dirty draft, offer Save, Discard, and Continue editing choices.

The same explicit draft/commit/cancel behavior applies to GM reference sections, the player description, banner and portrait selection/crop, and statblock fields. A public-description draft must never appear in Presenter preview or on the player display before Save. After Save, Presenter reflects the committed record according to Live/Next behavior; changing committed content must not bypass Pause or implicitly publish a different NPC.

The authoring UI should make the player-facing description unmistakable and provide a preview of exactly what the player window will receive: portrait plus **Description for Players**. The other narrative sections and statblock are GM reference material by default. Keep **editing/publication** separate from **saved player knowledge**: saving the player description makes it available to Presenter, but does not by itself permanently mark the NPC as known to the party.

For a long statblock, prioritize readable hierarchy, consistent field labels, inline editing, and scrolling over a fixed-height editor. It can have collapsible groups within the same page to make the reference sheet easier to scan, but do not move it to a separate tab. On wide panels, avoid a rigid two-column grid that leaves a blank area beside a short statblock; let narrative content wrap and reclaim that space.

## Presenter and player-window behavior

- Selecting an NPC opens its complete GM reference page in Presenter mode; it does not by itself reveal private sections.
- Presenting an NPC sends a read-only player view containing only the selected portrait and **Description for Players**. The first version does not provide separate dossier/statblock tabs on the player display.
- While Live, an explicit Presenter selection publishes the player-safe portrait and description. While Paused, changes should stage as Next and leave the exact current player image unchanged, consistent with `docs/player-presentation.md`.
- The player window has no NPC navigation or editing controls. It does not receive the GM's banner, private narrative sections, statblock, Plate notes, or workspace layout.
- Send a typed allowlisted snapshot rather than the full `Npc` record. Missing, deleted, or empty NPC content should produce a deliberate empty state rather than stale content from the last NPC.

The first implementation can keep Live/Next in memory; durable restoration of the NPC view after restarting the app remains a separate presentation-persistence decision. Preserve the distinction between the public content model and persistence so a later checkpoint can store a view identifier plus a safe content snapshot.

## Suggested implementation sequence

1. Connect the campaign's selected TTRPG field-set ID/version to a field-set definition. Use the documented D&D 5.5e field set for v1; keep other systems as future field sets.
2. Add the dedicated player description, optional portrait/banner assets, GM reference sections, and a separately tagged statblock to the existing NPC model. Preserve current private notes when loading existing campaigns. Store the statblock's field-set ID/version with its values.
3. Extend the NPC editor as one read-only-by-default scrollable page with explicit edit/save/cancel. Keep the ruleset-dependent statblock inline on the page.
4. Replace the Presenter NPC placeholder with a read-only preview of the full GM page and a separate player preview showing only portrait plus **Description for Players**.
5. Add a typed, allowlisted player-view payload and update the player window to render it. Verify that private notes and unrevealed sections cannot cross the window boundary.
6. Connect the existing Live/Paused controls so live selection publishes and paused selection stages. Check create, edit, delete, empty-content, and campaign-reopen paths.

## Later decisions

- Which D&D 5.5e fields and feature groups belong in the first field-set definition? Should it include equipment, spellcasting, lair actions, and regional effects?
- If additional TTRPG field sets are added, should changing a campaign's ruleset require an explicit migration/copy action before an old statblock can be edited with the new form? Existing values should remain intact either way.
- Should the player view include the banner, or stay limited to portrait and **Description for Players**?
- What aspect ratio and minimum source quality should the token image picker recommend?
- What minimum panel width allows the statblock and wrapped narrative content to remain comfortable before switching to the narrow stacked order?
