import assert from "node:assert/strict";
import test from "node:test";
import { campaignStore, createNpc, emptyCampaign } from "../src/lib/campaign-data.ts";
import { appCommands, registerWorkspaceCommands } from "../src/lib/app-commands.ts";
import { selectCanGoBack, useSessionStore } from "../src/stores/session-store.ts";
import "../src/lib/session-lifecycle.ts";

const replaceSnapshot = () => {
  const state = campaignStore.getState();
  campaignStore.setState({ campaign: emptyCampaign("Test session"), generation: state.generation + 1, isLeaving: false });
};

test("campaign replacement synchronously resets navigation/dialogs and refreshes NPC validity", () => {
  replaceSnapshot();
  const generation = campaignStore.getState().generation;
  const npcId = createNpc("Test NPC");
  assert.deepEqual(useSessionStore.getState().characterIds, [npcId]);
  useSessionStore.getState().setWorkspaceSnapshot([{ id: "workspace:1", title: "Workspace 1" }], "workspace:1");
  useSessionStore.getState().visitDestination({ kind: "character", workspaceId: "workspace:1", characterId: npcId, section: null });
  appCommands.openSettings();
  appCommands.openCommandPalette();
  assert.equal(selectCanGoBack(useSessionStore.getState()), true);
  replaceSnapshot();
  const session = useSessionStore.getState();
  assert.equal(session.generation, generation + 1);
  assert.equal(session.commandPaletteOpen, false);
  assert.equal(session.section, null);
  assert.equal(selectCanGoBack(session), false);
  assert.deepEqual(session.characterIds, []);
});

test("workspace commands reject stale controllers and actions during campaign transitions", () => {
  replaceSnapshot();
  const called = [];
  const handle = {
    createWorkspace: () => called.push("create"), openCharacter: (id) => called.push(id),
    openMap: () => called.push("map"), closeActiveTab: () => called.push("close"),
    goBack: () => called.push("back"), goForward: () => called.push("forward"),
  };
  const generation = campaignStore.getState().generation;
  const stopOld = registerWorkspaceCommands(generation, () => handle);
  appCommands.openMap("map-a");
  campaignStore.setState({ isLeaving: true });
  appCommands.openMap("map-a");
  appCommands.openSettings();
  appCommands.createNpc();
  assert.equal(useSessionStore.getState().section, null);
  assert.equal(useSessionStore.getState().npcDialogOpen, false);
  replaceSnapshot();
  appCommands.openCharacter("stale");
  const stopNew = registerWorkspaceCommands(campaignStore.getState().generation, () => handle);
  stopOld();
  appCommands.openCharacter("current");
  assert.deepEqual(called, ["map", "current"]);
  stopNew();
  appCommands.openMap("map-a");
  assert.deepEqual(called, ["map", "current"]);
});

test("shared commands show one dialog and closing Settings never closes a hidden document", () => {
  replaceSnapshot();
  appCommands.openCommandPalette();
  appCommands.openShortcuts();
  assert.equal(useSessionStore.getState().commandPaletteOpen, false);
  assert.equal(useSessionStore.getState().shortcutsOpen, true);
  appCommands.newCampaign();
  assert.equal(useSessionStore.getState().shortcutsOpen, false);
  assert.equal(useSessionStore.getState().campaignDialogOpen, true);
  appCommands.openSettings();
  assert.equal(useSessionStore.getState().campaignDialogOpen, false);
  appCommands.closeActiveTab();
  assert.equal(useSessionStore.getState().section, null);

  const session = useSessionStore.getState();
  session.setSection("Characters");
  appCommands.openSettings();
  let hiddenCloses = 0;
  const stop = registerWorkspaceCommands(campaignStore.getState().generation, () => ({
    closeActiveTab: () => hiddenCloses++, goBack: () => session.navigate(-1),
  }));
  appCommands.closeActiveTab();
  assert.equal(hiddenCloses, 0);
  assert.equal(useSessionStore.getState().section, "Characters");
  stop();
});


test("Add map reveals its sidebar, uses one dialog, and resets on campaign replacement", () => {
  replaceSnapshot();
  useSessionStore.getState().setSidebar({ open: false });
  appCommands.openCommandPalette();
  appCommands.createMap();
  let state = useSessionStore.getState();
  assert.equal(state.section, "Maps");
  assert.equal(state.sidebar.open, true);
  assert.equal(state.mapDialogOpen, true);
  assert.equal(state.commandPaletteOpen, false);
  appCommands.createNpc();
  assert.equal(useSessionStore.getState().mapDialogOpen, false);
  appCommands.createMap();
  appCommands.openSettings();
  assert.equal(useSessionStore.getState().mapDialogOpen, false);
  appCommands.createMap();
  replaceSnapshot();
  assert.equal(useSessionStore.getState().mapDialogOpen, false);
  campaignStore.setState({ isLeaving: true });
  appCommands.createMap();
  state = useSessionStore.getState();
  assert.equal(state.mapDialogOpen, false);
  assert.equal(state.section, null);
  campaignStore.setState({ isLeaving: false });
});
