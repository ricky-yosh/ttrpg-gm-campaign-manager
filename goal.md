# Goal: Assess product readiness for the GM toolkit

Investigate the documented product and current implementation, then write a
source-linked readiness report in `docs/product-readiness/`.

This is a **documentation and discovery run only**. Do not implement features,
fix application code, or continue the previous campaign-authoring goal.
Finish the reports and stop for human review.

## User outcome

The user wants a useful kit for preparing, running, and reviewing TTRPG sessions,
not just a collection of independent record editors. A GM expects to create a
session and connect relevant NPCs, factions, locations, story threads, and other
campaign material without maintaining duplicate copies.

The user does not yet have a clear picture of what is implemented. Your job is
to explain what actually works, what is only a prototype, what is missing, and
which product boundaries need a decision before another implementation goal.

Do not preselect sessions or player-safe presentation as the next implementation
task. Investigate the whole product first.

## Confirmed direction

- One UI-independent Rust application core, embedded Turso Database, and
  JSON-RPC with a machine-readable CLI.
- CLI sessions run independently; desktop attachment is not required.
- Rune is the eventual lightweight frontend, not part of this run.
- Preserve rich-note editing, dockable workspaces, portable campaign packages,
  existing records, assets, and private GM information.
- Keep the React/Tauri app as a behavior reference during migration.
- Brainstorm ideas and prototype UI are evidence to investigate, not blanket
  approval to implement every proposed feature.

## Investigation scope

Read `AGENTS.md` and applicable nested instructions. Discover and read all
top-level documents in `docs/`, including the product brainstorm, data model,
feature documents, architecture, headless plan, capability ledger, and previous
acceptance map. Then inspect the relevant implementation and tests.

Cover at least:

- Campaign lifecycle, saving, reopening, portability, and recovery limitations.
- Sessions, preparation notes, story beats, running notes, and recaps.
- NPCs, factions, locations, story threads, items, and party inventory.
- Maps, pins, record attachments, and documented encounter/exploration features.
- Rich notes, images/assets, and references within or alongside documents.
- Relationships across records and sessions, navigation to linked records,
  backlinks, renames, and unavailable/deleted targets.
- Editing/drafts, undo/redo, search, workspace/navigation, and restoration.
- Player knowledge, public/private content, presentation, and multi-window use.
- Other documented areas such as puzzles, bestiary, crafting, and media cues:
  identify their status without assuming they belong in the next release.

Distinguish a **game session** (a GM's prepared or played session) from a
**host/application session** (a running CLI/core process). Existing support for
the latter does not establish support for the former.

## Evidence rules

Keep intended behavior and implementation status separate.

For intended behavior, distinguish:

- Confirmed requirement or decision.
- Proposal or brainstorm idea.
- Explicitly deferred feature.
- Unresolved or conflicting requirement.

For current implementation, distinguish:

- Working and persistent.
- Working but transient/prototype-only.
- Partially implemented.
- Missing.
- Unverified.

Record desktop and CLI/core support separately. A desktop-only capability is
not automatically a headless capability; a CLI method does not prove the full
GM workflow is complete.

Use document sections, code paths, and named tests as evidence. Include relative
Markdown links where useful and exact file/line references for code claims.
Record the inspected Git revision and any relevant uncommitted changes; a
revision alone does not describe a dirty worktree.

Distinguish source inspection, existing test coverage, tests you actually ran,
and manual verification. Do not claim success from test names alone. Do not
claim absence solely because a method name was not found: trace the applicable
storage, action, and frontend paths.

Existing acceptance maps describe previous scopes, not approval of every future
feature. Do not silently reconcile contradictions by treating either current
code or older documentation as the complete product specification.

## Investigation loop

Repeat until the scope above has evidence or an explicitly recorded unknown:

1. Select a GM workflow or an uncovered part of it.
2. Read the relevant product requirements and identify their authority/status.
3. Trace the desktop, core/CLI, relationships, and persistence paths.
4. Inspect tests; run a focused non-destructive check when it materially
   increases confidence.
5. Record the outcome, supporting evidence, gaps, and unresolved product rules.
6. Review related workflows for contradictions and update the three reports.

Use real public CLI journeys with temporary campaigns where practical. For
persistence claims, prefer save, terminate, reopen in a fresh process, and
inspect. Do not use raw database edits as proof of application behavior.

Continue independent investigation when a product question is unresolved.
Collect questions in `decisions.md` rather than stopping after each one.
Ask during the run only if access or safety prevents useful progress.

## Required deliverables

Create exactly these three report files. If they already exist, update them
without discarding unrelated user content. Keep findings in these files rather
than scattering new status documents throughout the repository.

### `docs/product-readiness/README.md`

A short entry point, approximately one page:

- What a GM can actually accomplish today.
- The most consequential gaps in preparing, running, and reviewing a session.
- Links to the inventory and decisions.
- One recommended next bounded implementation goal, with a short rationale,
  dependencies, and non-goals. Compare a plausible alternative if useful.
- Which decisions, if any, block that recommendation.
- Inspection baseline and a concise summary of verification and limitations.

Make it readable without knowing the codebase or the agent's conversation.
Do not describe the whole toolkit as finished because one foundation run passed.

### `docs/product-readiness/workflow-inventory.md`

Organize around **preparing**, **running**, and **reviewing** a session.
Put shared campaign/reference capabilities in a supporting section; do not
duplicate the same detailed finding under every stage.

For each workflow, record:

1. A concrete GM outcome or short example journey.
2. Source requirements and their status.
3. Current desktop behavior and current CLI/core behavior.
4. What persists across navigation, campaign replacement, and process restart,
   as applicable; distinguish committed content from unsaved drafts.
5. Connections to other records and their relevant lifecycle behavior.
6. Implementation/test evidence and what you actually verified.
7. Gaps, contradictions, and unresolved questions linked to `decisions.md`.
8. A candidate public-contract acceptance journey for missing behavior,
   clearly labeled as a proposed test, not an existing command.

Include a compact coverage index so a reviewer can locate every investigated
feature. Explicitly identify future/proposed features rather than losing them
or turning them into requirements.

### `docs/product-readiness/decisions.md`

Include only unresolved **product** questions with meaningful consequences.
Group overlapping questions and prioritize those blocking the recommended goal.
Do not ask the user to choose Rust types, crate layouts, or routine API details.

For each question include:

- A stable ID and a plain-language question.
- The relevant requirement or contradiction and its source.
- A concrete GM example that makes the choice understandable.
- Plausible options and their consequences.
- Your recommended answer and rationale, explicitly marked **not approved**.
- What it blocks and what can proceed independently.

Do not pad this list with questions existing requirements already answer.
Previously settled rules should be cited in the inventory, not reopened.
If no blocking questions remain, say so.

## Safety and scope limits

- Only write the three report files for this run. Do not modify application
  code, tests, dependencies, schemas, other product docs, or this goal.
- Existing uncommitted work may be present. Do not reset, overwrite, commit,
  or otherwise clean it up.
- Do not implement fixes discovered during investigation. Record defects and
  their impact separately from missing or deferred functionality.
- Do not introduce new product behavior, choose unresolved visibility rules,
  or promote recommendations into approved requirements.
- Do not convert documents, migrate original campaigns, or test on real user
  data. Use temporary campaigns and disposable copies only.
- No Rune work, external services, cloud setup, network listeners, publishing,
  pushing, or merging.
- If tools or dependencies are unavailable, record the limitation rather than
  changing the environment to make the report look complete.

## Checks and completion

Run relevant existing tests and CLI checks proportionate to the claims.
Record exact commands, outcomes, and checks not run. Report blockers honestly;
do not fix the application to make the checks pass.

Run `pnpm lint` from `ttrpg-gm-cm-app` as required by project instructions and
`git diff --check`. Verify report links and citations against the inspected
sources, and confirm the run changed only the three permitted files.

The goal is complete when:

- Every investigation area is accounted for with evidence or a specific unknown.
- The reports separate intended product behavior, current behavior, prototype
  limitations, and future work.
- Relationships and end-to-end GM journeys are covered, not just CRUD catalogs.
- The user can understand what exists and what is missing without reading code.
- Decision questions are concrete, prioritized, and include recommendations.
- The next implementation goal is recommended, not silently authorized.

End with links to the three files, a brief summary, and the highest-priority
decisions requiring review. **Stop there. Do not enter an implementation phase,
rewrite the next goal, or start building the recommendation.**
