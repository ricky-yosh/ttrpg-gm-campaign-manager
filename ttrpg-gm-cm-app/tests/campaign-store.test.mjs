import assert from "node:assert/strict";
import test from "node:test";
import { mockIPC } from "@tauri-apps/api/mocks";
import { campaignStore, createNpc, emptyCampaign, getCampaign, leaveCampaign, replaceCampaign, saveCampaign, saveCampaignAs, saveCharacterNotes, setUnsavedChoiceHandler } from "../src/lib/campaign-data.ts";

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

test("NPC updates preserve unrelated selector references and notify synchronously", () => {
  const first = createNpc("First selector NPC");
  const second = createNpc("Second selector NPC");
  const untouched = getCampaign().campaign.npcs.find((npc) => npc.id === second);
  let notifications = 0;
  const unsubscribe = campaignStore.subscribe((state) => {
    notifications += 1;
    assert.equal(state, getCampaign());
  });
  try {
    const notes = [{ type: "p", children: [{ text: "Selected NPC changed" }] }];
    saveCharacterNotes(first, notes);
    assert.equal(notifications, 1);
    assert.equal(getCampaign().campaign.npcs.find((npc) => npc.id === second), untouched);
    saveCharacterNotes(first, notes);
    assert.equal(notifications, 1, "identical notes must not create a revision or notification");
  } finally { unsubscribe(); }
});

test("Save As queues after a save and retains the active path on cancel or failure", async () => {
  globalThis.window = {};
  globalThis.isTauri = true;
  const stopChoices = setUnsavedChoiceHandler(async () => "discard");
  await replaceCampaign("Save As regression");
  stopChoices();
  const npc = createNpc("Saved NPC");
  const writes = [];
  const paths = ["/tmp/original.campaign", "/tmp/renamed.campaign"];
  let dialogs = 0;
  let release;
  let failWrite = false;
  mockIPC(async (command, payload) => {
    if (command === "plugin:dialog|save") {
      dialogs += 1;
      return paths.shift() ?? null;
    }
    if (command === "save_campaign") {
      if (failWrite) throw new Error("Save As write failed");
      writes.push({ path: payload.path, campaign: structuredClone(payload.campaign) });
      if (writes.length === 1) await new Promise((resolve) => { release = resolve; });
    }
  });
  const saving = saveCampaign();
  await new Promise((resolve) => setImmediate(resolve));
  const copying = saveCampaignAs();
  saveCharacterNotes(npc, [{ type: "p", children: [{ text: "Edit during original save" }] }]);
  assert.equal(dialogs, 1, "Save As must wait for the active save before choosing a path");
  release();
  assert.equal(await saving, true);
  assert.equal(await copying, true);
  assert.deepEqual(writes.map((write) => write.path), ["/tmp/original.campaign", "/tmp/original.campaign", "/tmp/renamed.campaign"]);
  assert.equal(writes[2].campaign.npcs.find((item) => item.id === npc).notes[0].children[0].text, "Edit during original save");
  assert.equal(getCampaign().path, "/tmp/renamed.campaign");
  assert.equal(getCampaign().revision, getCampaign().savedRevision);

  assert.equal(await saveCampaignAs(), false);
  assert.equal(getCampaign().path, "/tmp/renamed.campaign");
  saveCharacterNotes(npc, [{ type: "p", children: [{ text: "Retain unsaved copy" }] }]);
  paths.push("/tmp/failed-copy.campaign");
  failWrite = true;
  assert.equal(await saveCampaignAs(), false);
  assert.equal(getCampaign().path, "/tmp/renamed.campaign");
  assert.notEqual(getCampaign().revision, getCampaign().savedRevision);
});

test("campaign replacement waits for every queued Save As dialog and write", async () => {
  globalThis.window = {};
  globalThis.isTauri = true;
  const stopChoices = setUnsavedChoiceHandler(async () => "discard");
  try { await replaceCampaign("Original queued campaign"); } finally { stopChoices(); }
  const replacement = emptyCampaign("Replacement campaign");
  const originalId = getCampaign().campaign.id;
  const writes = [];
  let dialogs = 0;
  let opens = 0;
  let releaseWrite;
  let chooseCopy;
  mockIPC(async (command, payload) => {
    if (command === "plugin:dialog|save") {
      if (++dialogs === 1) return "/tmp/queued-original.campaign";
      return new Promise((resolve) => { chooseCopy = resolve; });
    }
    if (command === "save_campaign") {
      writes.push({ path: payload.path, campaignId: payload.campaign.id });
      if (writes.length === 1) await new Promise((resolve) => { releaseWrite = resolve; });
    }
    if (command === "plugin:dialog|open") {
      opens += 1;
      return "/tmp/replacement.campaign";
    }
    if (command === "open_campaign") return replacement;
  });
  const saving = saveCampaign();
  await new Promise((resolve) => setImmediate(resolve));
  const firstCopy = saveCampaignAs();
  const secondCopy = saveCampaignAs();
  const replacing = replaceCampaign();
  releaseWrite();
  await saving;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(opens, 0);
  assert.equal(getCampaign().campaign.id, originalId);
  chooseCopy("/tmp/first-copy.campaign");
  await firstCopy;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(opens, 0, "replacement must also wait for the second queued copy");
  chooseCopy("/tmp/second-copy.campaign");
  assert.equal(await secondCopy, true);
  assert.equal(await replacing, true);
  assert.deepEqual(writes, [
    { path: "/tmp/queued-original.campaign", campaignId: originalId },
    { path: "/tmp/first-copy.campaign", campaignId: originalId },
    { path: "/tmp/second-copy.campaign", campaignId: originalId },
  ]);
  assert.equal(getCampaign().campaign.id, replacement.id);
  assert.equal(getCampaign().path, "/tmp/replacement.campaign");
});

test("stale save dialogs and write completions cannot update another campaign generation", async () => {
  globalThis.window = {};
  globalThis.isTauri = true;
  let choosePath;
  let finishWrite;
  let writes = 0;
  mockIPC(async (command) => {
    if (command === "plugin:dialog|save") return new Promise((resolve) => { choosePath = resolve; });
    if (command === "save_campaign") {
      writes += 1;
      await new Promise((resolve) => { finishWrite = resolve; });
    }
  });
  const replaceSnapshot = (name) => {
    campaignStore.setState((state) => ({
      campaign: emptyCampaign(name), path: `/tmp/${name}.campaign`, generation: state.generation + 1,
      revision: 0, savedRevision: 0, status: "Saved", error: "",
    }));
    return getCampaign();
  };

  const choosing = saveCampaignAs();
  const afterDialogReplacement = replaceSnapshot("After dialog");
  choosePath("/tmp/stale-dialog.campaign");
  assert.equal(await choosing, false);
  assert.equal(writes, 0);
  assert.equal(getCampaign(), afterDialogReplacement);

  const writing = saveCampaign();
  const afterWriteReplacement = replaceSnapshot("After write");
  finishWrite();
  assert.equal(await writing, false);
  assert.equal(getCampaign(), afterWriteReplacement);
});
