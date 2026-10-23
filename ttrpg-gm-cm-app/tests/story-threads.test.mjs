import assert from "node:assert/strict";
import test from "node:test";
import { campaignStore, createThread, emptyCampaign, saveThread, updateCampaign } from "../src/lib/campaign-data.ts";
import { useThreadDrafts } from "../src/stores/story-thread-drafts.ts";
import { useSessionStore, selectCanGoBack } from "../src/stores/session-store.ts";
import { matchingThreads } from "../src/lib/story-thread-data.ts";
import "../src/lib/session-lifecycle.ts";

function reset() {
  campaignStore.setState({ campaign: emptyCampaign("Threads"), generation: campaignStore.getState().generation + 1, isLeaving: false });
}

test("thread drafts stay separate from campaign saves and Cancel restores all fields and links", () => {
  reset();
  const id = createThread("  A missing shipment  ");
  const saved = campaignStore.getState().campaign.threads[0];
  assert.equal(saved.title, "A missing shipment");
  assert.deepEqual(useSessionStore.getState().threadIds, [id]);
  useThreadDrafts.getState().setDraft({ ...saved, title: "Draft", origin: "A rumor", people: [{ targetId: "missing", label: "A witness" }] });
  useSessionStore.getState().setSection("Locations");
  assert.equal(useThreadDrafts.getState().drafts[id].origin, "A rumor");
  assert.deepEqual(campaignStore.getState().campaign.threads[0], saved);
  useThreadDrafts.getState().discard(id);
  assert.deepEqual(campaignStore.getState().campaign.threads[0], saved);
  assert.equal(useThreadDrafts.getState().drafts[id], undefined);
});

test("thread saves retain context, reject invalid changes and do not dirty no-op saves", () => {
  reset();
  const id = createThread("A favor");
  const thread = campaignStore.getState().campaign.threads[0];
  const revision = campaignStore.getState().revision;
  assert.equal(saveThread(thread), null);
  assert.equal(campaignStore.getState().revision, revision);
  assert.ok(saveThread({ ...thread, title: " " }));
  assert.ok(saveThread({ ...thread, status: "invalid" }));
  assert.ok(saveThread({ ...thread, people: [{ targetId: "npc", label: "a" }, { targetId: "npc", label: "b" }] }));
  assert.equal(campaignStore.getState().revision, revision);
  const changed = { ...thread, status: "active", origin: "The innkeeper asked", people: [{ targetId: "missing", label: "Still retain this involvement" }] };
  assert.equal(saveThread(changed), null);
  assert.deepEqual(campaignStore.getState().campaign.threads[0], changed);
  assert.equal(matchingThreads([changed], "INNKEEPER")[0].id, id);
  useThreadDrafts.getState().setDraft({ ...changed, title: "Unsaved" });
  reset();
  assert.deepEqual(useThreadDrafts.getState().drafts, {});
  assert.deepEqual(useSessionStore.getState().threadIds, []);
});

test("thread history reopens valid records and skips missing thread destinations", () => {
  reset();
  const first = createThread("First");
  const second = createThread("Second");
  const state = useSessionStore.getState();
  state.setWorkspaceSnapshot([{ id: "workspace:1", title: "Workspace" }], "workspace:1");
  const destination = (threadId) => ({ kind: "thread", threadId, workspaceId: "workspace:1", section: "Story Threads" });
  state.visitDestination({ kind: "threads", workspaceId: "workspace:1", section: "Story Threads" });
  state.visitDestination(destination(first));
  state.visitDestination(destination(second));
  assert.deepEqual(state.navigate(-1, () => true), destination(first));
  assert.equal(useSessionStore.getState().navigation.entries.length, 3);
  state.navigate(1, () => true);
  updateCampaign({ threads: campaignStore.getState().campaign.threads.filter((thread) => thread.id !== first) });
  assert.equal(selectCanGoBack(useSessionStore.getState()), true);
  assert.equal(state.navigate(-1, () => true).kind, "threads");
});
