import assert from "node:assert/strict";
import test from "node:test";
import { mockIPC } from "@tauri-apps/api/mocks";
import { createNpc, emptyCampaign, getCampaign, leaveCampaign, replaceCampaign, saveCampaign, saveCharacterNotes, setUnsavedChoiceHandler } from "../src/lib/campaign-data.ts";

test("save queue retains edits during a write and failed opens retain the active campaign", async () => {
  globalThis.window = {};
  globalThis.isTauri = true;
  let release;
  let writes = [];
  let writePaths = [];
  let saveLocationOptions;
  let failSave = false;
  let failOpen = false;
  let cancelOpen = false;
  const second = emptyCampaign("Second campaign");
  mockIPC(async (command, payload) => {
    if (command === "plugin:dialog|save") {
      saveLocationOptions = payload.options;
      return "/tmp/campaigns/My campaign";
    }
    if (command === "plugin:dialog|open") return cancelOpen ? null : "/tmp/second.campaign";
    if (command === "save_campaign") {
      if (failSave) throw new Error("Disk full");
      writes.push(structuredClone(payload.campaign));
      writePaths.push(payload.path);
      if (writes.length === 1) await new Promise((resolve) => { release = resolve; });
    }
    if (command === "open_campaign") {
      if (failOpen) throw new Error("Invalid file");
      return second;
    }
  });
  const first = createNpc("Same name");
  const duplicate = createNpc("Same name");
  assert.notEqual(first, duplicate);
  const pending = saveCampaign();
  await new Promise((resolve) => setImmediate(resolve));
  saveCharacterNotes(first, [{ type: "p", children: [{ text: "Edit made during save" }] }]);
  assert.equal(saveCampaign(), pending);
  release();
  assert.equal(await pending, true);
  assert.equal(writes.length, 2);
  assert.equal(writePaths[0], "/tmp/campaigns/My campaign.campaign");
  assert.equal(saveLocationOptions.defaultPath, "My campaign");
  assert.deepEqual(saveLocationOptions.filters, [{ name: "Campaign package", extensions: ["campaign"] }]);
  assert.equal(writes[1].npcs.find((npc) => npc.id === first).notes[0].children[0].text, "Edit made during save");
  assert.equal(getCampaign().revision, getCampaign().savedRevision);
  failSave = true;
  saveCharacterNotes(first, [{ type: "p", children: [{ text: "Retain after failed save" }] }]);
  assert.equal(await saveCampaign(), false);
  assert.notEqual(getCampaign().revision, getCampaign().savedRevision);
  const originalId = getCampaign().campaign.id;
  assert.equal(await replaceCampaign(), false);
  assert.equal(getCampaign().campaign.id, originalId);
  failSave = false;
  await saveCampaign();
  cancelOpen = true;
  assert.equal(await replaceCampaign(), false);
  assert.equal(getCampaign().campaign.id, originalId);
  cancelOpen = false;
  failOpen = true;
  assert.equal(await replaceCampaign(), false);
  assert.equal(getCampaign().campaign.id, originalId);
  failOpen = false;
  assert.equal(await replaceCampaign(), true);
  assert.equal(getCampaign().campaign.id, second.id);
  assert.equal(getCampaign().campaign.npcs.length, 0);
});

test("unsaved drafts can be canceled or discarded without a disk write", async () => {
  globalThis.window = {};
  globalThis.isTauri = true;
  const commands = [];
  mockIPC((command) => {
    commands.push(command);
    if (command === "plugin:dialog|save") return null;
  });
  let choice = "cancel";
  const unregister = setUnsavedChoiceHandler(async () => choice);
  try {
    const original = getCampaign().campaign.id;
    createNpc("Unsaved character");
    let closed = false;
    const close = async () => { closed = true; };
    assert.equal(await leaveCampaign("close", close), false);
    assert.equal(closed, false);
    assert.equal(getCampaign().campaign.id, original);
    assert.deepEqual(commands, []);
    choice = "discard";
    assert.equal(await replaceCampaign("Accidental campaign"), true);
    assert.equal(getCampaign().campaign.name, "Accidental campaign");
    assert.equal(getCampaign().path, null);
    assert.notEqual(getCampaign().revision, getCampaign().savedRevision);
    assert.deepEqual(commands, []);
    // Canceling the first-save dialog must also cancel window closure.
    choice = "save";
    assert.equal(await leaveCampaign("close", close), false);
    assert.equal(closed, false);
    assert.deepEqual(commands, ["plugin:dialog|save"]);
    let resolveChoice;
    const stopDeferred = setUnsavedChoiceHandler(() => new Promise((resolve) => { resolveChoice = resolve; }));
    const pending = leaveCampaign("close", close);
    assert.equal(getCampaign().isLeaving, true);
    assert.equal(await saveCampaign(false), false);
    assert.equal(await leaveCampaign("close", close), false);
    resolveChoice("discard");
    assert.equal(await pending, true);
    assert.equal(closed, true);
    assert.equal(getCampaign().isLeaving, false);
    assert.deepEqual(commands, ["plugin:dialog|save"]);
    stopDeferred();
  } finally { unregister(); }
});
