import { getCampaign, updateCampaign } from "./campaign-data.ts";
import { mapKinds, validMapPoint, type CampaignMap } from "./map-data.ts";

export function saveMap(map: CampaignMap): boolean {
  const { campaign, isLeaving } = getCampaign();
  const maps = campaign.maps ?? [];
  const locations = new Set(campaign.locations.map((location) => location.id));
  const pinIds = new Set(map.pins.map((pin) => pin.id));
  if (isLeaving || !map.id || !map.name.trim() || !mapKinds.includes(map.kind)
    || map.image.type !== "img" || !map.image.url || (!map.image.url.startsWith("data:image/") && !map.image.url.startsWith("assets/"))
    || !Number.isSafeInteger(map.width) || !Number.isSafeInteger(map.height) || map.width <= 0 || map.height <= 0 || map.width > 4_294_967_295 || map.height > 4_294_967_295
    || map.locationIds.some((id) => !locations.has(id)) || new Set(map.locationIds).size !== map.locationIds.length
    || pinIds.size !== map.pins.length || map.pins.some((pin) => !pin.id || !locations.has(pin.locationId) || !validMapPoint(pin)
      || (pin.destinationMapId !== null && (pin.destinationMapId === map.id || !maps.some((item) => item.id === pin.destinationMapId))))
    || (map.party !== null && !validMapPoint(map.party))) return false;
  const saved = structuredClone({ ...map, name: map.name.trim() });
  updateCampaign({ maps: maps.some((item) => item.id === map.id) ? maps.map((item) => item.id === map.id ? saved : item) : [...maps, saved] });
  return true;
}
export function deleteMap(id: string) {
  const { campaign, isLeaving } = getCampaign();
  if (isLeaving) return;
  updateCampaign({ maps: (campaign.maps ?? []).filter((map) => map.id !== id).map((map) => ({
    ...map, pins: map.pins.map((pin) => pin.destinationMapId === id ? { ...pin, destinationMapId: null } : pin),
  })) });
}
