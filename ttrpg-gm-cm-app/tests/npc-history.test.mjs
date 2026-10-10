import assert from "node:assert/strict";
import test from "node:test";
import { mockIPC } from "@tauri-apps/api/mocks";
import {
  applyNpcHistory,
  campaignStore,
  createNpc,
  emptyCampaign,
  getCampaign,
  saveNpcChanges,
} from "../src/lib/campaign-data.ts";

test("NPC edits and saved undo/redo keep the frontend record and history state in sync", async () => {
  globalThis.window = {};
  globalThis.isTauri = true;
  const previous = getCampaign();
  campaignStore.setState({
    campaign: emptyCampaign("NPC history test"),
    path: null,
    generation: previous.generation + 1,
    revision: 0,
    savedRevision: 0,
    status: "Unsaved changes",
    error: "",
    npcEditHistory: {},
    pendingNpcOperations: {},
  });

  const npcId = createNpc("Before edit");
  const originalNpc = structuredClone(getCampaign().campaign.npcs[0]);
  const editedNpc = {
    ...originalNpc,
    name: "After edit",
    notes: [{ type: "p", children: [{ text: "Updated notes" }] }],
  };
  const commands = [];
  mockIPC((command) => {
    commands.push(command);
    if (command === "update_npc") {
      return { npc: editedNpc, canUndo: true, canRedo: false, undoLabel: "Update NPC", redoLabel: null };
    }
    if (command === "undo_npc") {
      return { npc: originalNpc, canUndo: false, canRedo: true, undoLabel: null, redoLabel: "Update NPC" };
    }
    if (command === "redo_npc") {
      return { npc: editedNpc, canUndo: true, canRedo: false, undoLabel: "Update NPC", redoLabel: null };
    }
    throw new Error(`Unexpected IPC command: ${command}`);
  });

  try {
    assert.equal(await saveNpcChanges(npcId, editedNpc), true);
    assert.equal(getCampaign().campaign.npcs[0].name, "After edit");
    assert.deepEqual(getCampaign().npcEditHistory[npcId], {
      canUndo: true, canRedo: false, undoLabel: "Update NPC", redoLabel: null,
    });

    await applyNpcHistory(npcId, "undo");
    assert.equal(getCampaign().campaign.npcs[0].name, "Before edit");
    assert.deepEqual(getCampaign().npcEditHistory[npcId], {
      canUndo: false, canRedo: true, undoLabel: null, redoLabel: "Update NPC",
    });

    await applyNpcHistory(npcId, "redo");
    assert.equal(getCampaign().campaign.npcs[0].name, "After edit");
    assert.deepEqual(getCampaign().npcEditHistory[npcId], {
      canUndo: true, canRedo: false, undoLabel: "Update NPC", redoLabel: null,
    });
    assert.deepEqual(commands, ["update_npc", "undo_npc", "redo_npc"]);
  } finally {
    campaignStore.setState({
      campaign: previous.campaign,
      path: previous.path,
      generation: previous.generation + 1,
      revision: previous.revision,
      savedRevision: previous.savedRevision,
      status: previous.status,
      error: previous.error,
      npcEditHistory: previous.npcEditHistory,
      pendingNpcOperations: previous.pendingNpcOperations,
    });
  }
});
