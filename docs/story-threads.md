# Story threads

Story threads are saved campaign dossiers for ongoing situations. Open **Story Threads** in the Campaign sidebar, then choose a thread or **All threads**. Search by title or written origin; create a thread with just a title. New threads start as Idea. The directory groups Active, Ideas, On hold, and Resolved, with Resolved initially collapsed. The demo campaign includes The Missing Morrow; new campaigns start empty.

## Authoring

Each dossier opens in read mode. **Edit / Save changes / Cancel** manages one shared draft, including all connections. Drafts survive navigation and tab closure within the current campaign; reopening the thread resumes editing. Drafts reset when the campaign is replaced or the app reloads. Only Save changes updates the campaign and normal autosave; writing in a draft does not save it. A title is required. No-op saves do not dirty the campaign.

- **Player reminder:** Short prose to read or paraphrase when players forget the context. It stays private GM reference and does not publish to the player display or track party knowledge.
- **How it started:** Written origin and an optional source label (rumor, encounter, backstory, or anything useful).
- **Where things stand:** Plate notes for the current situation and unresolved loose ends.
- **GM possibilities:** Plate notes for secrets, motives, pressures, and potential developments.
- **People / Locations / Factions involved:** Links to existing records with optional wrapping notes explaining why each matters to this thread.

Connections store stable IDs; target names update when records are renamed. Each target can be linked once per group. Missing targets retain their context as unavailable and can be unlinked in Edit. A connection describes relevance; it does not change faction membership, visits, or player knowledge. There is no thread deletion UI or shared campaign undo for committed thread changes in this pass.

The layout follows the existing dossier cards and theme. At Dockview pane widths of 900 px and wider, narrative and connections occupy independent columns with one page scroll. Narrow panes show the reminder and origin, then connections, then longer notes. Tabs retain scroll position, saved layouts, and Back/Forward destinations. Global search can open a thread or the directory.

## Sessions and persistence

Session Related records now offers real thread records and opens their dossiers. Session content remains memory-only, so those session-to-thread links disappear with the session on reload. Persistent thread-to-session origin links and story-beat links are deferred until sessions themselves persist; use the written origin in the meantime. Backlinks on NPC/location/faction pages are also deferred.

SQLite version 6 adds `story_thread`, storing JSON within the existing whole-campaign transaction. Versions 1–5 load without threads and upgrade on save. Older builds reject version 6 packages. Rust validates IDs, titles, statuses, note documents, and duplicate connection targets before writing. Images within rich text use the existing hashed campaign assets pipeline, including moved campaign packages. Thread content is excluded from player-window payloads.

