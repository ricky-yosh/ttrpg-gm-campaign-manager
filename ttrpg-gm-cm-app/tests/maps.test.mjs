import assert from "node:assert/strict";
import test from "node:test";
import { campaignStore, createLocation, emptyCampaign, getCampaign, updateCampaign } from "../src/lib/campaign-data.ts";
import { deleteMap, saveMap } from "../src/lib/map-commands.ts";
import { applyMapHistory, commitMapEdit } from "../src/lib/map-history.ts";
import { locationPlacements, mapTransform, mapsOfLocation, readMapCamera } from "../src/lib/map-data.ts";
import { selectCanGoBack, useSessionStore } from "../src/stores/session-store.ts";
import "../src/lib/session-lifecycle.ts";

const newMap = (id, locationId) => ({ id, name: id, kind: "City", image: { type: "img", url: "data:image/png;base64,bWFw" }, width: 1400, height: 900, locationIds: [locationId], pins: [], party: null });
function setup() {
  const state = getCampaign();
  campaignStore.setState({ campaign: emptyCampaign("Maps"), generation: state.generation + 1, isLeaving: false });
  const place = createLocation("City");
  const child = createLocation("Inn", place);
  return { place, child };
}

test("map relationships preserve one location across multiple placements and clear incoming links on deletion", () => {
  const { place, child } = setup();
  const city = newMap("city-map", place);
  const interior = newMap("inn-map", child);
  assert.equal(saveMap(interior), true);
  city.pins = [{ id: "inn-pin", x: 0.3, y: 0.7, locationId: child, label: "", destinationMapId: interior.id }];
  assert.equal(saveMap(city), true);
  assert.deepEqual(mapsOfLocation(getCampaign().campaign.maps, child).map((map) => map.id), [interior.id]);
  assert.equal(locationPlacements(getCampaign().campaign.maps, child)[0].pin.id, "inn-pin");
  deleteMap(interior.id);
  assert.equal(getCampaign().campaign.maps[0].pins[0].destinationMapId, null);
  assert.equal(getCampaign().campaign.locations.length, 2);
  assert.equal(getCampaign().campaign.locations.find((location) => location.id === child).parentId, place);
});

test("invalid pins, missing attachments, and invalid destinations leave campaign data intact", () => {
  const { place } = setup();
  const map = newMap("map", place);
  saveMap(map);
  const before = getCampaign().campaign;
  for (const patch of [
    { width: 0 }, { locationIds: ["missing"] }, { locationIds: [place, place] }, { party: { x: NaN, y: 0.5 } },
    { pins: [{ id: "pin", x: 2, y: 0.5, locationId: place, label: "", destinationMapId: null }] },
    { pins: [{ id: "pin", x: 0.5, y: 0.5, locationId: place, label: "", destinationMapId: "missing" }] },
  ]) {
    assert.equal(saveMap({ ...map, ...patch }), false);
    assert.equal(getCampaign().campaign, before);
  }
});

test("map drags undo in one step and stale history cannot overwrite later metadata or another campaign", () => {
  const { place } = setup();
  const map = newMap("map", place);
  saveMap(map);
  commitMapEdit({ ...map, party: { x: 0.2, y: 0.6 } }, "Move party marker");
  assert.equal(applyMapHistory(map.id, "undo"), true);
  assert.equal(getCampaign().campaign.maps[0].party, null);
  assert.equal(applyMapHistory(map.id, "redo"), true);
  const current = getCampaign().campaign.maps[0];
  saveMap({ ...current, name: "Renamed" });
  assert.equal(applyMapHistory(map.id, "undo"), false);
  assert.equal(getCampaign().campaign.maps[0].name, "Renamed");
  setup();
  assert.equal(applyMapHistory(map.id, "undo"), false);
});

test("map coordinates and camera remain centered across viewport and inspector resizing", () => {
  const camera = { x: 0.3, y: 0.7, zoom: 2 };
  for (const viewport of [{ x: 1200, y: 800 }, { x: 400, y: 700 }]) {
    const transform = mapTransform(1400, 900, viewport, camera);
    assert.equal(camera.x * 1400 * transform.scale + transform.x, viewport.x / 2);
    assert.equal(camera.y * 900 * transform.scale + transform.y, viewport.y / 2);
  }
  assert.deepEqual(readMapCamera({ x: 0, y: 0, zoom: 0 }), { x: 0.5, y: 0.5, zoom: 1 });
});

test("map history distinguishes maps and skips deleted destinations", () => {
  const { place } = setup();
  saveMap(newMap("a", place)); saveMap(newMap("b", place));
  const session = useSessionStore.getState();
  session.setWorkspaceSnapshot([{ id: "workspace:1", title: "Workspace" }], "workspace:1");
  session.visitDestination({ kind: "map", mapId: "a", workspaceId: "workspace:1", section: "Maps" });
  session.visitDestination({ kind: "map", mapId: "b", workspaceId: "workspace:1", section: "Maps" });
  assert.equal(selectCanGoBack(useSessionStore.getState()), true);
  deleteMap("a");
  assert.equal(selectCanGoBack(useSessionStore.getState()), false);
  updateCampaign({ maps: [] });
  assert.deepEqual(useSessionStore.getState().mapIds, []);
});
