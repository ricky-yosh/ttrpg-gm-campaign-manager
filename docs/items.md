# Items

Items opens a saved campaign catalog, replacing the former sample screen. Search by name, sort by name or a property, and choose property columns through **View options**. Name remains pinned when extra columns scroll horizontally. Search, columns, sort, selection, and vertical scroll are saved with the catalog tab's workspace parameters.

Selecting an item opens or focuses its own Dockview tab. When the catalog is open, the first detail opens beside it; subsequent items use the existing detail group. Users can move or stack tabs normally. Item tabs support workspace restoration and Back/Forward history. Global search can open the catalog or an item. Old sample Items navigation opens the real catalog. New campaigns begin empty; the sample campaign includes three editable items and an optional Category field.

## Authoring

**New item** requires only a name, creates the record, and opens its draft editor. Canceling subsequent edits retains that initial name-only item. Images, description, GM notes, and properties are optional. Read mode hides empty optional sections. **Edit / Save changes / Cancel** manages a shared draft; drafts survive tab closure within the current campaign and reset on campaign replacement or reload. Only saving changes commits the draft. No-op saves do not dirty the campaign. Artwork uses the existing imported-image conversion and hashed campaign asset pipeline.

Delete requires a confirmation naming the item. Deletion removes its catalog record and closes its tabs, while retaining shared field definitions and the separate party inventory. Committed item changes do not yet have shared campaign undo.

## Custom fields

**Add field** reuses a campaign definition or creates one. Supported types are text, number, checkbox, and single choice. Choice labels are entered one per line in sorting order; definitions and individual options have stable IDs. There is no built-in tier, rarity, currency, category, or crafting rule. Adding a field never requires that field on other items and does not enable any automation.

New definitions are staged with the item draft and committed together on Save changes. Cancel discards them. Definitions are separate from item values so other items can reuse them. Removing a property removes only that item's value; its shared definition remains available. Editing/deleting definitions, changing types, and templates are deferred. Empty values sort last in either direction; numbers sort numerically, checkboxes by No/Yes, and choices follow their configured order. Zero and false remain distinct from an unset value.

All catalog data stays in the GM workspace in this pass. It is excluded from player-window payloads. Inventory remains name-based and separate; catalog import does not award items. Player presentation, inventory links, imports/exports, templates, crafting, advanced filters, and spreadsheet-style editing are deferred.

## Persistence

SQLite version 7 adds `item_catalog`, storing item records and field definitions in the existing whole-campaign transaction. Versions 1–6 load with an empty catalog and upgrade on save. Older builds reject version 7. Rust validates unique IDs, nonempty names and field labels, field types, choice options, references, and matching value types before writing. Item images remain portable when the campaign package moves. Malformed item saves preserve the existing database.
