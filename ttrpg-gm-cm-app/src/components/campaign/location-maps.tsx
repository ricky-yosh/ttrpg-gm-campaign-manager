import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Field, FieldLabel } from "@/components/ui/field";
import { getCampaign, useCampaign } from "@/lib/campaign-data";
import { appCommands } from "@/lib/app-commands";
import { locationPlacements, mapsOfLocation, type CampaignMap } from "@/lib/map-data";
import { saveMap } from "@/lib/map-commands";

export function MapLinkRow({ map, pinId }: { map: CampaignMap; pinId?: string }) {
  return <div className="flex min-w-0 items-center gap-3">
    <img src={map.image.url} alt="" className="h-14 w-20 shrink-0 rounded-md border bg-muted object-contain" />
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={map.name}>{map.name}</p><p className="text-xs text-muted-foreground">{map.kind} map</p></div>
    <Button size="sm" variant="outline" onClick={() => appCommands.openMap(map.id, pinId)}>{pinId ? "Locate" : "Open"}</Button>
  </div>;
}

export function LocationMaps({ locationId, currentMapId, editable = false }: { locationId: string; currentMapId?: string; editable?: boolean }) {
  const maps = useCampaign((state) => state.campaign.maps) ?? [];
  const [chosenMap, setChosenMap] = useState("");
  const [placingMap, setPlacingMap] = useState("");
  const selectId = useId();
  const placeId = useId();
  const own = mapsOfLocation(maps, locationId);
  const placements = locationPlacements(maps, locationId).filter(({ map }) => map.id !== currentMapId);
  return <div className="flex min-w-0 flex-col gap-3">
    <h3 className="text-sm font-medium">Maps of this place</h3>
    {own.length ? own.map((map) => <MapLinkRow key={map.id} map={map} />) : <Empty size="inline"><EmptyHeader><EmptyTitle>No maps attached</EmptyTitle><EmptyDescription>Attach a map to make it easy to open from this location.</EmptyDescription></EmptyHeader></Empty>}
    {placements.length > 0 && <><h3 className="mt-2 text-sm font-medium">Appears on</h3>{placements.map(({ map, pin }) => <MapLinkRow key={pin.id} map={map} pinId={pin.id} />)}</>}
    {editable && <>
      <Field><FieldLabel htmlFor={selectId}>Attach existing map</FieldLabel><NativeSelect id={selectId} value={chosenMap} onChange={(event) => setChosenMap(event.currentTarget.value)}><NativeSelectOption value="">Choose a map…</NativeSelectOption>{maps.filter((map) => !map.locationIds.includes(locationId)).map((map) => <NativeSelectOption key={map.id} value={map.id}>{map.name}</NativeSelectOption>)}</NativeSelect>
        <Button size="sm" variant="outline" disabled={!chosenMap} onClick={() => {
          const map = getCampaign().campaign.maps?.find((item) => item.id === chosenMap);
          if (map) saveMap({ ...map, locationIds: [...map.locationIds, locationId] });
          setChosenMap("");
        }}>Attach map</Button>
      </Field>
      <Field><FieldLabel htmlFor={placeId}>Place this location on a map</FieldLabel><NativeSelect id={placeId} value={placingMap} onChange={(event) => setPlacingMap(event.currentTarget.value)}><NativeSelectOption value="">Choose a map…</NativeSelectOption>{maps.map((map) => <NativeSelectOption key={map.id} value={map.id}>{map.name}</NativeSelectOption>)}</NativeSelect><Button size="sm" variant="outline" disabled={!placingMap} onClick={() => appCommands.openMap(placingMap, undefined, locationId)}>Choose pin position</Button></Field>
    </>}
  </div>;
}
