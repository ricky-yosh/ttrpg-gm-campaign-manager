import assert from "node:assert/strict";
import test from "node:test";
import { hydrateSession, normalizeNavigationHistory, selectCanGoBack, selectCanGoForward, useSessionStore } from "../src/stores/session-store.ts";

const campaign = (workspace = null) => ({ section: null, sidebar: { width: 256, open: true }, npcs: [{ id: "npc-a" }, { id: "npc-b" }], maps: [{ id: "map-a" }], workspace });
const character = (id, workspaceId = "workspace:1", section = "Characters") => ({ kind: "character", workspaceId, characterId: id, section });
const map = { kind: "map", mapId: "map-a", workspaceId: "workspace:1", section: "Locations & Maps" };
const ready = () => {
  hydrateSession(campaign(), 1);
  useSessionStore.getState().setMapIds(["map-a"]);
  useSessionStore.getState().setWorkspaceSnapshot([{ id: "workspace:1", title: "Workspace 1" }, { id: "workspace:2", title: "Workspace 2" }], "workspace:1");
  return useSessionStore.getState();
};

test("NPC, map, and Settings visits replay the visible section without appending history", () => {
  const session = ready();
  session.visitDestination(character("npc-a"));
  session.visitDestination(map);
  session.openSettings();
  assert.equal(useSessionStore.getState().section, "Settings");
  assert.equal(selectCanGoBack(useSessionStore.getState()), true);
  const applied = [];
  assert.deepEqual(session.navigate(-1, (destination) => { applied.push(destination); return true; }), map);
  assert.equal(useSessionStore.getState().section, "Locations & Maps");
  assert.deepEqual(session.navigate(-1, () => true), character("npc-a"));
  assert.equal(useSessionStore.getState().section, "Characters");
  assert.equal(useSessionStore.getState().navigation.entries.length, 3);
  session.navigate(1, () => true);
  assert.deepEqual(session.navigate(1), { kind: "settings" });
  assert.equal(useSessionStore.getState().section, "Settings");
  assert.deepEqual(applied, [map]);
});

test("new destinations replace the forward branch and adjacent repeated visits are ignored", () => {
  const session = ready();
  session.visitDestination(character("npc-a"));
  session.visitDestination(map);
  session.openSettings();
  session.navigate(-1, () => true);
  session.visitDestination(map);
  assert.equal(selectCanGoForward(useSessionStore.getState()), true, "reselecting current destination retains forward history");
  session.visitDestination(character("npc-b"));
  assert.equal(selectCanGoForward(useSessionStore.getState()), false);
  assert.deepEqual(useSessionStore.getState().navigation.entries, [character("npc-a"), map, character("npc-b")]);
});

test("deleted workspaces and NPCs are skipped and failed Dockview activation keeps the cursor", () => {
  const session = ready();
  session.visitDestination(character("npc-a"));
  session.visitDestination(character("npc-b", "workspace:2"));
  session.visitDestination(map);
  session.setWorkspaceSnapshot([{ id: "workspace:1", title: "Workspace 1" }], "workspace:1");
  assert.equal(session.navigate(-1, () => false), null);
  assert.equal(useSessionStore.getState().navigation.index, 2);
  assert.deepEqual(session.navigate(-1, () => true), character("npc-a"));
  session.navigate(1, () => true);
  session.setCharacterIds([]);
  assert.equal(selectCanGoBack(useSessionStore.getState()), false);
  assert.equal(session.navigate(-1, () => true), null);
});

test("opening a document from Settings exits the overlay and sidebar navigation captures that document", () => {
  const session = ready();
  session.visitDestination(character("npc-a"));
  session.openSettings();
  session.leaveSettings();
  session.visitDestination(map);
  assert.equal(useSessionStore.getState().section, "Locations & Maps");
  session.setSection("Characters");
  assert.deepEqual(useSessionStore.getState().navigation.entries.at(-1), { ...map, section: "Characters" });
  session.navigate(-1, () => true);
  assert.equal(useSessionStore.getState().section, "Locations & Maps");
});

test("campaign hydration migrates old history and atomically resets dialogs and arrow availability", () => {
  const session = ready();
  session.visitDestination(character("npc-a"));
  session.openSettings();
  session.setCommandPaletteOpen(true);
  session.setNpcDialogOpen(true);
  session.setCampaignDialogOpen(true);
  session.setShortcutsOpen(true);
  hydrateSession(campaign({ history: { entries: [{ workspaceId: "workspace:1", name: "npc-a" }], index: 0 }, sidebarWidth: 208, collapsed: true }), 2);
  const state = useSessionStore.getState();
  assert.deepEqual(state.navigation, { entries: [character("npc-a", "workspace:1", null)], index: 0 });
  assert.equal(state.generation, 2);
  assert.equal(state.workspaceSidebarWidth, 208);
  assert.equal(state.workspaceCollapsed, true);
  assert.equal(state.commandPaletteOpen || state.npcDialogOpen || state.campaignDialogOpen || state.shortcutsOpen, false);
  assert.equal(state.activeWorkspaceId, null);
  assert.equal(selectCanGoBack(state), false);
  assert.equal(selectCanGoForward(state), false);
  hydrateSession(campaign(), 3);
  assert.deepEqual(useSessionStore.getState().navigation, { entries: [], index: -1 });
});

test("navigation remains bounded and cross-campaign activation cannot commit an old cursor", () => {
  const session = ready();
  for (let index = 0; index < 105; index++) session.setSection(`Section ${index}`);
  assert.equal(useSessionStore.getState().navigation.entries.length, 100);
  assert.equal(useSessionStore.getState().navigation.index, 99);
  assert.deepEqual(useSessionStore.getState().navigation.entries[0], { kind: "section", section: "Section 5" });
  assert.equal(normalizeNavigationHistory({ entries: [], index: 20 }).index, -1);
  session.visitDestination(character("npc-a"));
  session.visitDestination(map);
  assert.equal(session.navigate(-1, () => { hydrateSession(campaign(), 4); return true; }), null);
  assert.equal(useSessionStore.getState().generation, 4);
  assert.deepEqual(useSessionStore.getState().navigation, { entries: [], index: -1 });
});

test("closing the active tab reconciles an existing fallback visit instead of leaving an ineffective Back", () => {
  const session = ready();
  session.visitDestination(character("npc-a"));
  session.visitDestination(character("npc-b"));
  session.reconcileWorkspaceDestination(character("npc-a"));
  assert.equal(useSessionStore.getState().navigation.index, 0);
  assert.equal(useSessionStore.getState().navigation.entries.length, 2);
  assert.equal(selectCanGoBack(useSessionStore.getState()), false);
  assert.equal(selectCanGoForward(useSessionStore.getState()), true);
  assert.deepEqual(session.navigate(1, () => true), character("npc-b"));
  // A map can fall back to an NPC opened from a different sidebar section.
  session.visitDestination(map);
  session.reconcileWorkspaceDestination(character("npc-b", "workspace:1", "Locations & Maps"));
  assert.equal(useSessionStore.getState().navigation.index, 1);
  assert.equal(useSessionStore.getState().section, "Locations & Maps");
  assert.equal(useSessionStore.getState().navigation.entries[1].section, "Locations & Maps");
  assert.equal(useSessionStore.getState().navigation.entries.length, 3);
});

test("workspace deletion reconciles the surviving active view without adding history and empty views preserve recoverable visits", () => {
  const session = ready();
  session.visitDestination(character("npc-a"));
  session.visitDestination(character("npc-b", "workspace:2"));
  session.setWorkspaceSnapshot([{ id: "workspace:1", title: "Workspace 1" }], "workspace:1");
  session.reconcileWorkspaceDestination(character("npc-a"));
  assert.equal(useSessionStore.getState().navigation.index, 0);
  assert.equal(selectCanGoBack(useSessionStore.getState()), false);
  assert.equal(selectCanGoForward(useSessionStore.getState()), false);
  assert.equal(useSessionStore.getState().navigation.entries.length, 2);
  // Closing the final document updates metadata without removing recoverable history.
  session.setWorkspaceDestination(null);
  assert.equal(useSessionStore.getState().workspaceDestination, null);
  assert.equal(useSessionStore.getState().navigation.entries.length, 2);
});

test("same-section plain routes are skipped after a document opens, while sidebar changes still replay", () => {
  const session = ready();
  session.setSection("Characters");
  session.visitDestination(character("npc-a"));
  assert.equal(selectCanGoBack(useSessionStore.getState()), false);
  session.openSettings();
  session.navigate(-1, () => true);
  assert.equal(useSessionStore.getState().section, "Characters");
  assert.equal(selectCanGoBack(useSessionStore.getState()), false);
  // A genuinely different section remains useful even without a document target.
  session.setWorkspaceDestination(null);
  session.setSection("Items");
  assert.equal(selectCanGoBack(useSessionStore.getState()), true);
  session.navigate(-1, () => true);
  assert.equal(useSessionStore.getState().section, "Characters");
});

test("location navigation restores the correct record and skips removed locations", () => {
  const session = ready();
  const location = (id) => ({ kind: "location", workspaceId: "workspace:1", locationId: id, section: "Locations & Maps" });
  session.setLocationIds(["loc-a", "loc-b"]);
  session.visitDestination(location("loc-a"));
  session.visitDestination(location("loc-b"));
  session.visitDestination(character("npc-a"));
  assert.deepEqual(session.navigate(-1, () => true), location("loc-b"));
  session.reconcileWorkspaceDestination(location("loc-a"));
  assert.equal(useSessionStore.getState().navigation.index, 0);
  session.navigate(1, () => true);
  session.navigate(1, () => true);
  session.setLocationIds(["loc-a"]);
  assert.deepEqual(session.navigate(-1, () => true), location("loc-a"));
  hydrateSession(campaign(), 2);
  assert.deepEqual(useSessionStore.getState().locationIds, []);
});

test("faction navigation restores the correct record and skips removed factions", () => {
  const session = ready();
  const faction = (id) => ({ kind: "faction", workspaceId: "workspace:1", factionId: id, section: "Factions & Maps" });
  session.setFactionIds(["faction-a", "faction-b"]);
  session.visitDestination(faction("faction-a"));
  session.visitDestination(faction("faction-b"));
  session.visitDestination(character("npc-a"));
  assert.deepEqual(session.navigate(-1, () => true), faction("faction-b"));
  session.reconcileWorkspaceDestination(faction("faction-a"));
  assert.equal(useSessionStore.getState().navigation.index, 0);
  session.navigate(1, () => true);
  session.navigate(1, () => true);
  session.setFactionIds(["faction-a"]);
  assert.deepEqual(session.navigate(-1, () => true), faction("faction-a"));
  hydrateSession(campaign(), 2);
  assert.deepEqual(useSessionStore.getState().factionIds, []);
});


test("saved Overview visits are removed while surviving history keeps its cursor and records", () => {
  const overview = { kind: "sample", workspaceId: "workspace:1", sampleSection: "Overview", section: "Overview" };
  const entries = [character("npc-a", "workspace:1", "Overview"), overview, { kind: "section", section: "Overview" }, map];
  const surviving = [character("npc-a", "workspace:1", null), { ...map, section: "Maps" }];
  for (const [index, expectedIndex] of [[0, 0], [1, 0], [2, 0], [3, 1]]) {
    assert.deepEqual(normalizeNavigationHistory({ entries, index }), { entries: surviving, index: expectedIndex });
  }
  assert.deepEqual(normalizeNavigationHistory({ entries: [overview], index: 0 }), { entries: [], index: -1 });
  assert.deepEqual(normalizeNavigationHistory({ entries: [overview, map], index: 0 }), { entries: [surviving[1]], index: -1 });
});

test("campaigns saved on Overview return to all sections and history cannot reopen Overview", () => {
  const overview = { kind: "sample", workspaceId: "workspace:1", sampleSection: "Overview", section: "Overview" };
  hydrateSession({ ...campaign({ history: { entries: [character("npc-a"), overview, map], index: 1 }, sidebarWidth: 192, collapsed: false }), section: "Overview" }, 2);
  const session = useSessionStore.getState();
  assert.equal(session.section, null);
  assert.equal(session.navigation.index, 0);
  session.setWorkspaceSnapshot([{ id: "workspace:1", title: "Workspace 1" }], "workspace:1");
  assert.equal(selectCanGoBack(useSessionStore.getState()), false);
  assert.deepEqual(session.navigate(1, () => true), { ...map, section: "Maps" });
  assert.deepEqual(session.navigate(-1, () => true), character("npc-a"));
});


test("old map library visits become sidebar routes without losing the history cursor", () => {
  const library = { kind: "map", workspaceId: "workspace:1", section: "Locations & Maps" };
  const entries = [character("npc-a"), library, map];
  for (const index of [0, 1, 2]) {
    assert.deepEqual(normalizeNavigationHistory({ entries, index }), {
      entries: [character("npc-a"), { kind: "section", section: "Maps" }, { ...map, section: "Maps" }], index,
    });
  }
});
