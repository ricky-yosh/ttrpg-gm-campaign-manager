import assert from "node:assert/strict";
import test from "node:test";
import { canParentLocation, locationAncestors, locationSearchResults, withLocationDefaults } from "../src/lib/location-data.ts";

const place = (id, name, parentId = null) => ({ id, name, parentId, image: null, publicDescription: "Public", gmNotes: "Private" });
const locations = [place("region", "Northern Reach"), place("city", "Greyhaven", "region"), place("inn", "The Lantern Inn", "city"), place("room", "Cellar", "inn"), place("other", "Cellar")];

test("parent choices prevent cycles and allow moving a subtree to the root", () => {
  assert.equal(canParentLocation(locations, "city", "room"), false);
  assert.equal(canParentLocation(locations, "city", "city"), false);
  assert.equal(canParentLocation(locations, "city", "missing"), false);
  assert.equal(canParentLocation(locations, "inn", "region"), true);
  assert.equal(canParentLocation(locations, "city", null), true);
  assert.deepEqual(locationAncestors(locations, "room").map((item) => item.id), ["region", "city", "inn"]);
});

test("duplicate-name search results retain their geographic paths", () => {
  const results = locationSearchResults(locations, "  CELLAR  ");
  assert.equal(results.length, 2);
  assert.equal(results[0].path, "Northern Reach / Greyhaven / The Lantern Inn");
  assert.equal(results[1].path, "");
});

test("older location content is preserved and cyclic ancestry cannot loop forever", () => {
  const legacy = { id: "legacy", name: "Old place", image: { type: "img", url: "data:image/webp;base64,YQ==" }, publicDescription: "Existing prose", gmNotes: "Existing prep" };
  const normalized = withLocationDefaults(legacy);
  assert.equal(normalized.image, legacy.image);
  assert.equal(normalized.publicDescription, "Existing prose");
  assert.equal(normalized.gmNotes, "Existing prep");
  assert.equal(normalized.partyKnowledge, "unknown");
  assert.deepEqual(normalized.tags, []);
  assert.deepEqual(normalized.gmReference, { atmosphere: "", background: "", currentSituation: "", secrets: "" });
  assert.equal(legacy.parentId, undefined);
  assert.deepEqual(locationAncestors([place("a", "A", "b"), place("b", "B", "a")], "a").map((item) => item.id), ["b"]);
});

test("location commands reject cyclic moves without changing the campaign", async () => {
  const { campaignStore, createLocation, emptyCampaign, getCampaign, saveLocation } = await import("../src/lib/campaign-data.ts");
  campaignStore.setState({ campaign: emptyCampaign("Location commands"), path: null });
  const root = createLocation("Root");
  const child = createLocation("Child", root);
  const childRecord = getCampaign().campaign.locations.find((location) => location.id === child);
  const rootRecord = getCampaign().campaign.locations.find((location) => location.id === root);
  const before = getCampaign();
  assert.equal(saveLocation(root, { ...rootRecord, parentId: child }), false);
  assert.equal(getCampaign(), before);
  assert.equal(createLocation("Invalid parent", "missing"), undefined);
  assert.equal(getCampaign(), before);
  assert.equal(saveLocation(child, { ...childRecord, parentId: null, locationType: "Tavern", tags: ["Social"] }), true);
  const moved = getCampaign().campaign.locations.find((location) => location.id === child);
  assert.equal(moved.parentId, null);
  assert.equal(moved.locationType, "Tavern");
  assert.deepEqual(moved.tags, ["Social"]);
  assert.equal(moved.publicDescription, childRecord.publicDescription);
});
