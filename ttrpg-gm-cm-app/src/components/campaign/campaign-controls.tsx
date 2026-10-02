import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { createNpc, replaceCampaign, saveCampaign, useCampaign } from "@/lib/campaign-data";

export function CampaignControls({ npcOpen, onNpcOpenChange, onOpenNpc }: {
  npcOpen: boolean;
  onNpcOpenChange: (open: boolean) => void;
  onOpenNpc: (id: string) => void;
}) {
  const { status, error, path } = useCampaign();
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [name, setName] = useState("");
  const [npcName, setNpcName] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => { setName(""); setCampaignOpen(true); }}>New campaign</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => replaceCampaign())}>Open campaign</Button>
        <Button size="sm" disabled={busy || status === "Saving…"} onClick={() => void run(() => saveCampaign())}>Save</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => { setNpcName(""); onNpcOpenChange(true); }}>New NPC</Button>
        <span role="status" className="min-w-0 truncate text-xs text-muted-foreground" title={path ?? undefined}>{status}</span>
      </div>
      {error && <p role="alert" className="border-b px-3 py-2 text-sm text-destructive">{error}</p>}
      <Dialog open={campaignOpen} onOpenChange={setCampaignOpen}>
        <DialogPopup>
          <form className="flex flex-col gap-5 p-5" onSubmit={(event) => {
            event.preventDefault();
            void run(async () => { if (await replaceCampaign(name)) setCampaignOpen(false); });
          }}>
            <div className="flex flex-col gap-2">
              <DialogTitle>New campaign</DialogTitle>
              <DialogDescription>Start an unsaved campaign. Choose its folder when you first save. You can discard an accidental campaign when closing or switching.</DialogDescription>
            </div>
            <FieldGroup><Field><FieldLabel htmlFor="campaign-name">Campaign name</FieldLabel>
              <Input id="campaign-name" autoFocus required value={name} onChange={(event) => setName(event.target.value)} />
            </Field></FieldGroup>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCampaignOpen(false)}>Cancel</Button>
              <Button disabled={busy || !name.trim()} type="submit">Create campaign</Button>
            </div>
          </form>
        </DialogPopup>
      </Dialog>
      <Dialog open={npcOpen} onOpenChange={onNpcOpenChange}>
        <DialogPopup>
          <form className="flex flex-col gap-5 p-5" onSubmit={(event) => {
            event.preventDefault();
            if (!npcName.trim()) return;
            const id = createNpc(npcName);
            setNpcName("");
            onNpcOpenChange(false);
            onOpenNpc(id);
          }}>
            <div className="flex flex-col gap-2">
              <DialogTitle>New NPC</DialogTitle>
              <DialogDescription>Create a character, then write their private notes in the workspace.</DialogDescription>
            </div>
            <FieldGroup><Field><FieldLabel htmlFor="npc-name">NPC name</FieldLabel>
              <Input id="npc-name" autoFocus required value={npcName} onChange={(event) => setNpcName(event.target.value)} />
            </Field></FieldGroup>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onNpcOpenChange(false)}>Cancel</Button>
              <Button disabled={!npcName.trim()} type="submit">Create NPC</Button>
            </div>
          </form>
        </DialogPopup>
      </Dialog>
    </>
  );
}
