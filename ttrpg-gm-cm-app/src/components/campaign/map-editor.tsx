import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useCampaign, getCampaign } from "@/lib/campaign-data";
import { blobToDataUrl, convertImageToWebp, IMAGE_ACCEPT } from "@/lib/image-utils";
import { locationAncestors } from "@/lib/location-data";
import { mapKinds, type CampaignMap } from "@/lib/map-data";
import { deleteMap, saveMap } from "@/lib/map-commands";

export function MapEditor({ map, locationId, onClose, onSaved }: {
  map?: CampaignMap; locationId?: string; onClose: () => void; onSaved: (id: string) => void;
}) {
  const locations = useCampaign((state) => state.campaign.locations);
  const [draft, setDraft] = useState<CampaignMap>(map ? structuredClone(map) : {
    id: crypto.randomUUID(), name: "", kind: "Region", image: { type: "img", url: "" }, width: 0, height: 0,
    locationIds: locationId ? [locationId] : [], pins: [], party: null,
  });
  const [attachment, setAttachment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [clearPlacements, setClearPlacements] = useState(false);
  const generation = useRef(getCampaign().generation).current;
  const uploadVersion = useRef(0);
  useEffect(() => () => { uploadVersion.current++; }, []);
  const nameId = useId();
  const kindId = useId();
  const fileId = useId();
  const attachmentId = useId();
  const replacementId = useId();
  const close = () => { uploadVersion.current++; onClose(); };
  const importImage = async (file?: File) => {
    if (!file) return;
    const version = ++uploadVersion.current;
    setPending(true); setError("");
    try {
      const webp = await convertImageToWebp(file);
      const url = await blobToDataUrl(webp);
      const image = new Image();
      image.src = url;
      await image.decode();
      if (version !== uploadVersion.current || generation !== getCampaign().generation) return;
      setDraft((current) => ({ ...current, name: current.name || file.name.replace(/\.[^.]+$/, ""),
        image: { type: "img", url }, width: image.naturalWidth, height: image.naturalHeight }));
    } catch (reason) {
      if (version === uploadVersion.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally { if (version === uploadVersion.current) setPending(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
    <DialogPopup>
      <div className="flex flex-col gap-4 overflow-y-auto p-5">
        <DialogTitle>{deleting ? `Delete ${draft.name}?` : map ? "Edit map" : "Import map"}</DialogTitle>
        <DialogDescription>{deleting ? "This removes the map and its pins. Locations remain. Links from other maps to this map will be cleared." : "Import artwork and choose which places this map depicts. Location pins are added on the canvas."}</DialogDescription>
        {deleting ? <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleting(false)}>Keep map</Button><Button variant="destructive" onClick={() => { deleteMap(draft.id); close(); }}>Delete map</Button></div> : <form onSubmit={(event) => {
          event.preventDefault();
          if (pending || generation !== getCampaign().generation) return;
          const latest = getCampaign().campaign.maps?.find((item) => item.id === draft.id);
          if (map && !latest) { setError("This map was removed while you were editing it."); return; }
          const saved = { ...draft, pins: clearPlacements ? [] : latest?.pins ?? draft.pins,
            party: clearPlacements ? null : latest ? latest.party : draft.party };
          if (!saveMap(saved)) { setError("Enter a name, import an image, and choose available locations and destinations."); return; }
          onSaved(draft.id); close();
        }}>
          <FieldGroup>
            <Field><FieldLabel htmlFor={nameId}>Map name</FieldLabel><Input id={nameId} value={draft.name} required onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })} /></Field>
            <Field><FieldLabel htmlFor={kindId}>Map kind</FieldLabel><NativeSelect id={kindId} value={draft.kind} onChange={(event) => {
              const kind = mapKinds.find((value) => value === event.currentTarget.value);
              if (kind) setDraft({ ...draft, kind });
            }}>{mapKinds.map((kind) => <NativeSelectOption key={kind}>{kind}</NativeSelectOption>)}</NativeSelect></Field>
            {draft.image.url && <img src={draft.image.url} alt="Map artwork preview" className="max-h-48 w-full rounded-lg border bg-muted object-contain" />}
            <Field><FieldLabel htmlFor={fileId}>{map ? "Replace artwork (optional)" : "Map artwork"}</FieldLabel><Input id={fileId} type="file" accept={IMAGE_ACCEPT} disabled={pending} onChange={(event) => { void importImage(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></Field>
            {map && draft.image.url !== map.image.url && (map.pins.length > 0 || map.party) && <Field><FieldLabel htmlFor={replacementId}>Existing placements on replacement artwork</FieldLabel><NativeSelect id={replacementId} value={clearPlacements ? "clear" : "keep"} onChange={(event) => setClearPlacements(event.currentTarget.value === "clear")}><NativeSelectOption value="keep">Keep relative positions — review alignment</NativeSelectOption><NativeSelectOption value="clear">Clear pins and party marker</NativeSelectOption></NativeSelect></Field>}
            <Field><FieldLabel htmlFor={attachmentId}>Maps of these places</FieldLabel>
              {draft.locationIds.map((id) => <div key={id} className="flex items-center justify-between gap-2"><span className="text-sm">{locations.find((location) => location.id === id)?.name ?? "Unavailable location"}</span><Button type="button" variant="ghost" size="sm" onClick={() => setDraft({ ...draft, locationIds: draft.locationIds.filter((value) => value !== id) })}>Detach</Button></div>)}
              <NativeSelect id={attachmentId} value={attachment} onChange={(event) => setAttachment(event.currentTarget.value)}><NativeSelectOption value="">Choose a place (optional)</NativeSelectOption>{locations.filter((location) => !draft.locationIds.includes(location.id)).map((location) => <NativeSelectOption key={location.id} value={location.id}>{[...locationAncestors(locations, location.id).map((ancestor) => ancestor.name), location.name].join(" / ")}</NativeSelectOption>)}</NativeSelect>
              <Button type="button" variant="outline" size="sm" disabled={!attachment} onClick={() => { setDraft({ ...draft, locationIds: [...draft.locationIds, attachment] }); setAttachment(""); }}>Attach place</Button>
            </Field>
            {pending && <p role="status" className="text-sm text-muted-foreground">Importing image…</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              {map && <Button type="button" variant="destructive" size="sm" onClick={() => setDeleting(true)}>Delete map…</Button>}
              <Button type="button" variant="outline" onClick={close}>Cancel</Button>
              <Button type="submit" disabled={pending || !draft.name.trim() || !draft.image.url}>{map ? "Save changes" : "Create map"}</Button>
            </div>
          </FieldGroup>
        </form>}
      </div>
    </DialogPopup>
  </Dialog>;
}
