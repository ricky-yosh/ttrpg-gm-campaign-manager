import assert from "node:assert/strict";
import test from "node:test";
import { campaignStore, createItem, emptyCampaign, removeItem, saveItem } from "../src/lib/campaign-data.ts";
import { compareItems, formatItemValue, itemFieldsError, matchingItems, newItem } from "../src/lib/item-data.ts";
import { useItemDrafts } from "../src/stores/item-drafts.ts";
import { normalizeNavigationHistory, useSessionStore } from "../src/stores/session-store.ts";
import "../src/lib/session-lifecycle.ts";

const tier = { id: "tier", label: "Tier", kind: "choice", options: [{ id: "e", label: "E" }, { id: "s", label: "S" }] };
const weight = { id: "weight", label: "Weight", kind: "number", options: [] };
function reset() {
  campaignStore.setState({ campaign: emptyCampaign("Items"), generation: campaignStore.getState().generation + 1, isLeaving: false });
}

test("name-only items and optional fields save atomically, while cancelled drafts change neither", () => {
  reset();
  assert.equal(createItem(" "), null);
  const id = createItem("  Key  ");
  const saved = campaignStore.getState().campaign.items[0];
  assert.equal(saved.name, "Key");
  assert.deepEqual(saved.values, {});
  assert.deepEqual(campaignStore.getState().campaign.itemFields, []);
  assert.deepEqual(useSessionStore.getState().itemIds, [id]);
  const revision = campaignStore.getState().revision;
  assert.equal(saveItem(saved, []), null);
  assert.equal(campaignStore.getState().revision, revision);
  const draft = { item: { ...saved, values: { tier: "e" } }, fields: [tier] };
  useItemDrafts.getState().setDraft(draft);
  assert.equal(campaignStore.getState().revision, revision);
  useItemDrafts.getState().discard(id);
  assert.deepEqual(campaignStore.getState().campaign.itemFields, []);
  assert.equal(saveItem(draft.item, draft.fields), null);
  const otherId = createItem("Lantern");
  const other = campaignStore.getState().campaign.items.find((item) => item.id === otherId);
  assert.equal(saveItem({ ...other, values: { tier: "s" } }, []), null);
  assert.equal(campaignStore.getState().campaign.itemFields.length, 1);
  assert.equal(saveItem({ ...draft.item, values: {} }, []), null);
  assert.equal(campaignStore.getState().campaign.itemFields.length, 1);
});

test("invalid fields and values never partially update the catalog", () => {
  reset();
  createItem("Compass");
  const item = campaignStore.getState().campaign.items[0];
  const revision = campaignStore.getState().revision;
  for (const [values, fields] of [
    [{ tier: "unknown" }, [tier]], [{ tier: "e" }, []], [{ weight: Infinity }, [weight]],
    [{ weight: "2" }, [weight]], [{ tier: "e" }, [tier, tier]],
  ]) {
    assert.ok(saveItem({ ...item, values }, fields));
    assert.equal(campaignStore.getState().revision, revision);
    assert.deepEqual(campaignStore.getState().campaign.itemFields, []);
  }
  assert.ok(itemFieldsError([{ ...tier, options: [{ id: "a", label: "E" }, { id: "b", label: " e " }] }]));
  assert.ok(saveItem({ ...item, name: " " }, []));
});

test("choice and numeric sorting use their types, preserve zero/false, and put missing values last", () => {
  const make = (name, values) => ({ ...newItem(name), values });
  const items = [make("Missing", {}), make("High", { tier: "s", weight: 10 }), make("Low", { tier: "e", weight: 2 }), make("Zero", { weight: 0 })];
  assert.deepEqual([...items].sort((a, b) => compareItems(a, b, tier, false)).map((item) => item.name), ["Low", "High", "Missing", "Zero"]);
  assert.deepEqual([...items].sort((a, b) => compareItems(a, b, weight, true)).map((item) => item.name), ["High", "Low", "Zero", "Missing"]);
  assert.equal(formatItemValue(weight, 0), "0");
  assert.equal(formatItemValue({ kind: "checkbox" }, false), "No");
  assert.equal(formatItemValue(tier, "e"), "E");
  assert.equal(matchingItems(items, "  HIGH ").length, 1);
});

test("item history skips deleted records, old sample history migrates, and replacement clears drafts", () => {
  reset();
  const first = createItem("First");
  const second = createItem("Second");
  const state = useSessionStore.getState();
  state.setWorkspaceSnapshot([{ id: "workspace:1", title: "Workspace" }], "workspace:1");
  state.visitDestination({ kind: "items", workspaceId: "workspace:1", section: "Items" });
  state.visitDestination({ kind: "item", itemId: first, workspaceId: "workspace:1", section: "Items" });
  state.visitDestination({ kind: "item", itemId: second, workspaceId: "workspace:1", section: "Items" });
  assert.equal(removeItem(first), true);
  assert.equal(state.navigate(-1, () => true).kind, "items");
  assert.equal(normalizeNavigationHistory({ entries: [{ kind: "sample", sampleSection: "Items", workspaceId: "workspace:1", section: "Items" }], index: 0 }).entries[0].kind, "items");
  useItemDrafts.getState().setDraft({ item: campaignStore.getState().campaign.items[0], fields: [] });
  reset();
  assert.deepEqual(useItemDrafts.getState().drafts, {});
  assert.deepEqual(useSessionStore.getState().itemIds, []);
});
