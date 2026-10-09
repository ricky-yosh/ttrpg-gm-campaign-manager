import { useEffect, useMemo, useRef, useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import type { Value } from "platejs";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCampaign, saveNpcChanges, type NpcPresentation, type NpcReference } from "@/lib/campaign-data";
import { NpcImageField } from "@/components/campaign/npc-image-field";
import { Dnd55eStatblock } from "@/components/campaign/npc-statblock";
import { NpcRecordLinks } from "@/components/campaign/npc-record-links";
import { NpcGmReference } from "@/components/campaign/npc-gm-reference";
import { NpcPlayerDescription } from "@/components/campaign/npc-player-description";
import { NpcNotesEditor, useNpcNotesEditor } from "@/components/campaign/npc-notes-editor";

export function CharacterPanel({ params, api }: IDockviewPanelProps) {
  const id = typeof params.name === "string" ? params.name : "";
  const factions = useCampaign((state) => state.campaign.factions);
  const locations = useCampaign((state) => state.campaign.locations);
  const npcs = useCampaign((state) => state.campaign.npcs);
  const npc = useCampaign((state) => state.campaign.npcs.find((item) => item.id === id));
  const scrollRef = useRef<HTMLElement>(null);
  const initialScrollTop = useRef(typeof params.scrollTop === "number" ? params.scrollTop : 0);
  const editor = useNpcNotesEditor(id, npc?.notes);
  const [isEditing, setIsEditing] = useState(false);
  const [isWide, setIsWide] = useState(false);
  const [draftName, setDraftName] = useState(npc?.name ?? "");
  const [draftPresentation, setDraftPresentation] = useState<NpcPresentation | null>(
    npc?.presentation ? structuredClone(npc.presentation) : null,
  );
  const [draftNotes, setDraftNotes] = useState<Value>(structuredClone(npc?.notes ?? [{ type: "p", children: [{ text: "" }] }]));

  useEffect(() => {
    const frame = requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = initialScrollTop.current; });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const updateWidth = () => setIsWide(element.clientWidth >= 900);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!npc) return;
    const notes = structuredClone(npc.notes);
    setDraftName(npc.name);
    setDraftPresentation(structuredClone(npc.presentation));
    setDraftNotes(notes);
    setIsEditing(false);
    editor.tf.setValue(notes);
  }, [editor, id, npc]);

  const hasChanges = useMemo(() => {
    if (!npc || !draftPresentation) return false;
    return draftName !== npc.name
      || JSON.stringify(draftPresentation) !== JSON.stringify(npc.presentation)
      || JSON.stringify(draftNotes) !== JSON.stringify(npc.notes);
  }, [draftName, draftNotes, draftPresentation, npc]);

  const updatePresentation = (change: Partial<NpcPresentation>) => {
    setDraftPresentation((current) => current ? { ...current, ...change } : current);
  };

  const handleCancel = () => {
    if (!npc) return;
    const notes = structuredClone(npc.notes);
    setDraftName(npc.name);
    setDraftPresentation(structuredClone(npc.presentation));
    setDraftNotes(notes);
    editor.tf.setValue(notes);
    setIsEditing(false);
  };

  const handleSave = () => {
    if (!npc || !draftPresentation) return;
    saveNpcChanges(id, { name: draftName.trim() || npc.name, notes: draftNotes, presentation: draftPresentation });
    setIsEditing(false);
  };

  if (!npc || !draftPresentation) {
    return <article className="h-full overflow-auto p-8"><p className="text-sm text-muted-foreground">This NPC is no longer available.</p></article>;
  }

  const presentation = draftPresentation;
  const reference = presentation.gmReference;
  const setReference = (key: keyof NpcReference, value: string) => {
    updatePresentation({ gmReference: { ...reference, [key]: value } });
  };
  const imageUrl = (image: NpcPresentation["banner"]) => image?.url ?? null;
  const toImage = (url: string | null): NpcPresentation["banner"] => url ? { type: "img", url } : null;

  const renderPortrait = () => (
    <div className="min-w-0">
      <NpcImageField
        editable={isEditing}
        label=""
        value={imageUrl(presentation.portrait)}
        onChange={(url) => updatePresentation({ portrait: toImage(url) })}
        aspectRatio="4 / 5"
        fit="contain"
      />
    </div>
  );

  const renderStatblock = () => presentation.statblock.fieldSetId === "dnd-5.5e" ? (
    <div className="min-w-0">
      <Dnd55eStatblock
        value={presentation.statblock.data}
        editable={isEditing}
        onChange={(data) => updatePresentation({ statblock: { ...presentation.statblock, data } })}
        fallbackName={npc.name}
        tokenImage={presentation.statblock.tokenImage?.url ?? null}
        onTokenImageChange={(url) => updatePresentation({ statblock: {
          ...presentation.statblock,
          tokenImage: url ? { type: "img", url } : null,
        } })}
      />
    </div>
  ) : (
    <section className="min-w-0 rounded-xl border bg-card p-4">
      <h2 className="font-semibold">Statblock</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This statblock uses the unsupported ruleset <span className="font-medium">{presentation.statblock.fieldSetId}</span> (version {presentation.statblock.fieldSetVersion}). Its data is preserved, but this view cannot edit or display it yet.
      </p>
    </section>
  );

  const playerDescription = (
    <NpcPlayerDescription
      description={presentation.playerDescription}
      portraitUrl={imageUrl(presentation.portrait)}
      editable={isEditing}
      withPortrait={isWide}
      onDescriptionChange={(playerDescription) => updatePresentation({ playerDescription })}
      onPortraitChange={(url) => updatePresentation({ portrait: toImage(url) })}
    />
  );
  const relationships = (
    <NpcRecordLinks
      key={`${id}-${isEditing}`}
      sourceNpcId={id}
      records={npcs}
      value={presentation.relationships ?? []}
      editable={isEditing}
      onChange={(relationships) => updatePresentation({ relationships })}
    />
  );
  const locationLinks = (
    <NpcRecordLinks key={`locations-${id}-${isEditing}`} kind="location" sourceNpcId={id} records={locations ?? []}
      value={presentation.locations ?? []} editable={isEditing}
      onChange={(locations) => updatePresentation({ locations })} />
  );
  const factionLinks = (
    <NpcRecordLinks key={`factions-${id}-${isEditing}`} kind="faction" sourceNpcId={id} records={factions ?? []}
      value={presentation.factions ?? []} editable={isEditing}
      onChange={(factions) => updatePresentation({ factions })} />
  );
  const gmReference = <NpcGmReference value={reference} editable={isEditing} onChange={setReference} />;
  const notes = <NpcNotesEditor editor={editor} npcName={npc.name} editable={isEditing} onChange={setDraftNotes} />;

  return (
    <article ref={scrollRef} className="h-full overflow-auto p-8" onScroll={(event) => {
      api.updateParameters({ scrollTop: event.currentTarget.scrollTop });
      window.dispatchEvent(new Event("campaign-workspace-change"));
    }}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">NPC</p>
          {isEditing ? (
            <Input aria-label="NPC name" value={draftName} onChange={(event) => setDraftName(event.currentTarget.value)} className="max-w-3xl" />
          ) : <h1 className="font-serif text-2xl font-semibold">{npc.name}</h1>}
        </div>
        <div className="flex shrink-0 gap-2">
          {isEditing ? (
            <>
              {hasChanges && <span className="self-center text-sm text-muted-foreground">Unsaved changes</span>}
              <Button type="button" variant="outline" onClick={handleCancel}>Cancel</Button>
              <Button type="button" onClick={handleSave} disabled={!hasChanges}>Save changes</Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => setIsEditing(true)}>
              <PencilIcon aria-hidden="true" /> Edit
            </Button>
          )}
        </div>
      </header>

      {(isEditing || presentation.banner) && (
        <NpcImageField
          editable={isEditing}
          label=""
          value={imageUrl(presentation.banner)}
          onChange={(url) => updatePresentation({ banner: toImage(url) })}
          aspectRatio="7 / 1"
          fit="cover"
          className="mb-5"
        />
      )}

      {isWide ? (
        <div className="grid grid-cols-2 items-start gap-5">
          <div className="flex min-w-0 flex-col gap-5">
            {playerDescription}
            {gmReference}
            {notes}
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            {renderStatblock()}
            {relationships}
            {locationLinks}
            {factionLinks}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {renderPortrait()}
          {renderStatblock()}
          {relationships}
          {locationLinks}
          {factionLinks}
          {playerDescription}
          {gmReference}
          {notes}
        </div>
      )}
    </article>
  );
}
