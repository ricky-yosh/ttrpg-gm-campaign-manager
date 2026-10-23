import assert from "node:assert/strict";
import test from "node:test";
import { resetSessionNotes, sessionText, useSessionNotesStore } from "../src/stores/session-notes-store.ts";

test("quick capture survives canceling or saving an existing edit draft", () => {
  for (const finish of ["discardDraft", "saveDraft"]) {
    resetSessionNotes();
    const id = useSessionNotesStore.getState().createSession();
    const draft = useSessionNotesStore.getState().drafts[id];
    useSessionNotesStore.getState().setDraft(id, { ...draft, title: "Changed title", prep: sessionText("Private prep") });
    useSessionNotesStore.getState().setCapture(id, "The party followed the smuggler.");
    useSessionNotesStore.getState().appendCapture(id);
    useSessionNotesStore.getState()[finish](id);
    const state = useSessionNotesStore.getState();
    assert.equal(state.sessions[0].happened.at(-1).children[0].text, "The party followed the smuggler.");
    assert.equal(state.sessions[0].title, finish === "saveDraft" ? "Changed title" : "Untitled session");
    assert.equal(state.captures[id], "");
    assert.equal(state.drafts[id], undefined);
  }
});

test("campaign reset clears notes, edit drafts, and unsubmitted quick captures", () => {
  resetSessionNotes(true);
  const id = useSessionNotesStore.getState().createSession();
  useSessionNotesStore.getState().setCapture(id, "Unsubmitted note");
  resetSessionNotes();
  const state = useSessionNotesStore.getState();
  assert.deepEqual(state.sessions, []);
  assert.deepEqual(state.referenceOptions, { puzzle: [] });
  assert.deepEqual(state.drafts, {});
  assert.deepEqual(state.captures, {});
});


test("sample references are isolated to the demo campaign and reset between campaigns", () => {
  resetSessionNotes(true);
  assert.ok(useSessionNotesStore.getState().referenceOptions.puzzle.length > 0);
  useSessionNotesStore.getState().referenceOptions.puzzle[0].name = "Edited sample";
  resetSessionNotes(true);
  assert.notEqual(useSessionNotesStore.getState().referenceOptions.puzzle[0].name, "Edited sample");
  resetSessionNotes(false);
  assert.deepEqual(useSessionNotesStore.getState().referenceOptions, { puzzle: [] });
});
