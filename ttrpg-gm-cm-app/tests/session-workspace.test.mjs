import assert from "node:assert/strict";
import test from "node:test";
import { withoutPrototypePanels } from "../src/lib/session-workspace.ts";

const panel = (id, contentComponent, params = {}) => ({ id, contentComponent, title: id, params });
const leaf = (id, views, activeView = views[0], extra = {}) => ({ type: "leaf", size: 300, data: { id, views, activeView, ...extra } });
const layout = (root, panels, activeGroup) => ({ grid: { root, width: 900, height: 600, orientation: "HORIZONTAL" }, panels, activeGroup });

test("removes session tabs and nested empty groups while preserving record layout and state", () => {
  const source = layout({ type: "branch", data: [
    leaf("mixed", ["session:one", "npc:one"], "session:one", { tabGroups: [{ id: "named", panelIds: ["session:one", "npc:one"], collapsed: false }] }),
    { type: "branch", size: 400, data: [leaf("session-only", ["sessions:directory"])] },
  ] }, {
    "session:one": panel("session:one", "sessions", { sessionId: "one", privateText: "Do not persist" }),
    "sessions:directory": panel("sessions:directory", "sessions"),
    "npc:one": panel("npc:one", "character", { characterId: "one", scrollTop: 42 }),
  }, "session-only");
  const before = structuredClone(source);
  const saved = withoutPrototypePanels(source);
  assert.deepEqual(source, before, "must not mutate live Dockview state");
  assert.deepEqual(saved.panels, { "npc:one": source.panels["npc:one"] });
  assert.equal(saved.activeGroup, "mixed");
  assert.equal(saved.grid.root.data.length, 1);
  assert.deepEqual(saved.grid.root.data[0].data.views, ["npc:one"]);
  assert.equal(saved.grid.root.data[0].data.activeView, "npc:one");
  assert.deepEqual(saved.grid.root.data[0].data.tabGroups[0].panelIds, ["npc:one"]);
  assert.ok(!JSON.stringify(saved).includes("Do not persist"));
});

test("session-only workspace becomes a valid empty grid", () => {
  const saved = withoutPrototypePanels(layout(leaf("only", ["sessions:directory"]), { "sessions:directory": panel("sessions:directory", "sessions") }, "only"));
  assert.deepEqual(saved.panels, {});
  assert.deepEqual(saved.grid.root, { type: "branch", data: [] });
  assert.ok(!("activeGroup" in saved));
});

test("cleans floating, nested popout, and edge references with usable active fallbacks", () => {
  const source = layout({ type: "branch", data: [] }, {
    "session:one": panel("session:one", "sessions"), "map:one": panel("map:one", "map", { mapId: "one" }),
  }, "float-private");
  source.floatingGroups = [{ data: leaf("float-private", ["session:one"]).data, position: { left: 0, top: 0, width: 200, height: 200 } }];
  source.popoutGroups = [{ grid: { ...source.grid, root: leaf("popout", ["session:one", "map:one"], "session:one"), maximizedNode: { location: [0] } }, position: null, gridReferenceGroup: "float-private" }];
  source.edgeGroups = { left: { size: 200, visible: true, group: leaf("edge", ["session:one"]).data } };
  const saved = withoutPrototypePanels(source);
  assert.deepEqual(saved.floatingGroups, []);
  assert.deepEqual(saved.popoutGroups[0].grid.root.data.views, ["map:one"]);
  assert.equal(saved.popoutGroups[0].grid.root.data.activeView, "map:one");
  assert.ok(!("maximizedNode" in saved.popoutGroups[0].grid));
  assert.equal(saved.edgeGroups.left.visible, false);
  assert.ok(!("group" in saved.edgeGroups.left));
  assert.ok(!("gridReferenceGroup" in saved.popoutGroups[0]));
  assert.equal(saved.activeGroup, "popout");
});

test("removes legacy Sessions sample routes and preserves unrelated panel objects", () => {
  const source = layout(leaf("mixed", ["old-session", "npc"]), {
    "old-session": panel("old-session", "sample", { sampleSection: "Sessions:transient-id" }),
    npc: panel("npc", "character", { characterId: "npc" }),
  }, "mixed");
  assert.deepEqual(Object.keys(withoutPrototypePanels(source).panels), ["npc"]);
  const stable = layout(leaf("stable", ["npc"]), { npc: source.panels.npc }, "stable");
  assert.equal(withoutPrototypePanels(stable), stable);
});


test("removes other prototype tabs without retaining their group or panel data", () => {
  const source = layout({ type: "branch", data: [leaf("samples", ["threads", "puzzles"]), leaf("records", ["location"]) ] }, {
    threads: panel("threads", "sample", { sampleSection: "Story Threads" }),
    puzzles: panel("puzzles", "sample", { sampleSection: "Puzzles" }),
    location: panel("location", "location", { locationId: "harbor" }),
  }, "samples");
  const saved = withoutPrototypePanels(source);
  assert.deepEqual(Object.keys(saved.panels), ["location"]);
  assert.equal(saved.grid.root.data.length, 1);
  assert.equal(saved.activeGroup, "records");
  assert.deepEqual(saved.grid.root.data[0].data.views, ["location"]);
});
