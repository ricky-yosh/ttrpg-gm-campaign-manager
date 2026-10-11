export const mapKinds = ["World", "Region", "City", "Building", "Dungeon", "Battle"] as const;
export type MapKind = typeof mapKinds[number];
export type MapPoint = { x: number; y: number };
export type MapPin = MapPoint & { id: string; locationId: string; label: string; destinationMapId: string | null };
export type CampaignMap = {
  id: string;
  name: string;
  kind: MapKind;
  image: { type: "img"; url: string };
  width: number;
  height: number;
  locationIds: string[];
  pins: MapPin[];
  party: MapPoint | null;
};
export type MapCamera = { x: number; y: number; zoom: number };
export const defaultMapCamera: MapCamera = { x: 0.5, y: 0.5, zoom: 1 };
export function readMapCamera(value: unknown): MapCamera {
  const camera = value as Partial<MapCamera> | null;
  return camera && typeof camera.x === "number" && Number.isFinite(camera.x) && typeof camera.y === "number" && Number.isFinite(camera.y)
    && typeof camera.zoom === "number" && camera.zoom >= 0.2 && camera.zoom <= 12 ? camera as MapCamera : defaultMapCamera;
}
export function validMapPoint(point: MapPoint) {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}
export function mapsOfLocation(maps: CampaignMap[], locationId: string) {
  return maps.filter((map) => map.locationIds.includes(locationId));
}
export function locationPlacements(maps: CampaignMap[], locationId: string) {
  return maps.flatMap((map) => map.pins.filter((pin) => pin.locationId === locationId).map((pin) => ({ map, pin })));
}
/** Map coordinates stay independent of the viewport and inspector size. */
export function mapTransform(width: number, height: number, viewport: MapPoint, camera: MapCamera) {
  const scale = Math.min(viewport.x / width, viewport.y / height) * camera.zoom;
  return { scale, x: viewport.x / 2 - camera.x * width * scale, y: viewport.y / 2 - camera.y * height * scale };
}

/** Compare edits without serializing a potentially large image on every canvas frame. */
export function sameMap(left: CampaignMap | undefined, right: CampaignMap | undefined) {
  if (left === right) return true;
  if (!left || !right || left.image.url !== right.image.url) return false;
  const details = (map: CampaignMap) => [map.id, map.name, map.kind, map.image.type, map.width, map.height, map.locationIds, map.pins, map.party];
  return JSON.stringify(details(left)) === JSON.stringify(details(right));
}
