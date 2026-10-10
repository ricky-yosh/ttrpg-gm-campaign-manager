import assert from "node:assert/strict";
import test from "node:test";
import { emptyInventory, inventoryError } from "../src/lib/inventory-data.ts";
import { buildPlayerContent, resolvePresentationContent } from "../src/lib/presentation-content.ts";
import { campaignStore, emptyCampaign, getCampaign, saveInventory } from "../src/lib/campaign-data.ts";
import { hydrateSession, normalizeNavigationHistory, useSessionStore } from "../src/stores/session-store.ts";

const inventory = () => ({ gold: 250, entries: [{ id: "rope", name: "Rope", kind: "item", quantity: 2, note: "50 feet" }, { id: "ore", name: "Iron ore", kind: "material", quantity: 8, note: "" }] });

test("invalid inventory is rejected without changing saved state", () => {
  campaignStore.setState({ campaign: emptyCampaign("Inventory"), isLeaving: false });
  assert.equal(saveInventory(inventory()), null);
  const before = getCampaign();
  for (const gold of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.ok(saveInventory({ ...inventory(), gold }));
    assert.equal(getCampaign(), before);
  }
  for (const patch of [{ quantity: 0 }, { quantity: -1 }, { quantity: 0.5 }, { name: "  " }, { kind: "unknown" }]) {
    const value = inventory(); value.entries[0] = { ...value.entries[0], ...patch };
    assert.ok(saveInventory(value)); assert.equal(getCampaign(), before);
  }
  const duplicate = inventory(); duplicate.entries.push({ ...duplicate.entries[0] });
  assert.ok(inventoryError(duplicate));
  assert.equal(inventoryError(emptyInventory()), null);
});

test("public inventory snapshots exclude private fields and remain frozen while paused", () => {
  const campaign = { ...emptyCampaign("Public"), inventory: inventory() };
  campaign.inventory.entries[0].gmNotes = "Secret";
  const live = buildPlayerContent(campaign, "inventory", null);
  campaign.inventory.gold = 100;
  campaign.inventory.entries[0].quantity = 1;
  const next = buildPlayerContent(campaign, "inventory", null);
  assert.equal(live.inventory.gold, 250);
  assert.equal(live.inventory.entries[0].quantity, 2);
  assert.equal("gmNotes" in live.inventory.entries[0], false);
  assert.equal(resolvePresentationContent("paused", next, live), live);
  assert.equal(resolvePresentationContent("live", next, live), next);
  assert.equal(resolvePresentationContent("stopped", next, live), null);
  assert.deepEqual(buildPlayerContent(emptyCampaign("Legacy"), "inventory", null).inventory, emptyInventory());
});

test("old sidebar sections migrate by destination and inventory history replays", () => {
  const entries = [{ kind: "map", workspaceId: "workspace:1", section: "Locations & Maps" }, { kind: "location", workspaceId: "workspace:1", locationId: "inn", section: "Locations & Maps" }];
  assert.deepEqual(normalizeNavigationHistory({ entries, index: 0 }).entries.map((entry) => entry.section), ["Maps", "Locations"]);
  hydrateSession({ ...emptyCampaign("History"), section: "Locations & Maps", workspace: { history: { entries, index: 0 } } }, 99);
  assert.equal(useSessionStore.getState().section, "Maps");
  const session = useSessionStore.getState();
  session.setWorkspaceSnapshot([{ id: "workspace:1", title: "Workspace 1" }], "workspace:1");
  const destination = { kind: "inventory", workspaceId: "workspace:1", section: "Inventory" };
  session.visitDestination(destination);
  session.openSettings();
  assert.deepEqual(session.navigate(-1, () => true), destination);
  assert.equal(useSessionStore.getState().section, "Inventory");
});
