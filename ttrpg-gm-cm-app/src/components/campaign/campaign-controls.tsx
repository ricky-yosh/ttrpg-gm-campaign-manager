import { useShallow } from "zustand/react/shallow";
import { isTauri } from "@tauri-apps/api/core";
import { appCommands } from "@/lib/app-commands";
import { useSessionStore } from "@/stores/session-store";
import { useEffect, useState } from "react";
import { ChevronDownIcon, FileIcon, FilePlus2Icon, FolderOpenIcon, SaveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { createNpc, replaceCampaign, useCampaign } from "@/lib/campaign-data";

export function CampaignControls() {
  const { campaignName, status, error, path, isLeaving } = useCampaign(useShallow((state) => ({
    campaignName: state.campaign.name, status: state.status, error: state.error, path: state.path, isLeaving: state.isLeaving,
  })));
  const campaignOpen = useSessionStore((state) => state.campaignDialogOpen);
  const setCampaignOpen = useSessionStore((state) => state.setCampaignDialogOpen);
  const npcOpen = useSessionStore((state) => state.npcDialogOpen);
  const onNpcOpenChange = useSessionStore((state) => state.setNpcDialogOpen);
  const [name, setName] = useState("");
  const [npcName, setNpcName] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  };
  useEffect(() => { if (campaignOpen) setName(""); }, [campaignOpen]);
  useEffect(() => { if (npcOpen) setNpcName(""); }, [npcOpen]);
  return (
    <>
      {!isTauri() && <DropdownMenu>
        <DropdownMenuTrigger render={
          <Button data-tauri-drag-region="false" variant="ghost" size="sm" aria-label="File commands" title="File commands">
            <FileIcon data-icon="inline-start" /><span className="hidden sm:inline">File</span><ChevronDownIcon className="hidden sm:inline" data-icon="inline-end" />
          </Button>
        } />
        <DropdownMenuContent>
          <div className="flex min-w-0 flex-col gap-0.5 px-2 py-1.5">
            <span className="truncate text-sm font-medium" title={path ?? campaignName}>{campaignName}</span>
            <span role="status" className="truncate text-xs text-muted-foreground">{status}</span>
            {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={busy || isLeaving} onClick={appCommands.newCampaign}>
              <FilePlus2Icon />New campaign
            </DropdownMenuItem>
            <DropdownMenuItem disabled={busy || isLeaving} onClick={() => void run(appCommands.openCampaign)}>
              <FolderOpenIcon />Open campaign
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={busy || isLeaving || status === "Saving…"} onClick={() => void run(appCommands.saveCampaign)}>
              <SaveIcon />Save campaign
            </DropdownMenuItem>
            <DropdownMenuItem disabled={busy || isLeaving || status === "Saving…"} onClick={() => void run(appCommands.saveCampaignAs)}>
              <SaveIcon />Save as…
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>}
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
      <Dialog open={npcOpen} onOpenChange={(open) => { if (open) setNpcName(""); onNpcOpenChange(open); }}>
        <DialogPopup>
          <form className="flex flex-col gap-5 p-5" onSubmit={(event) => {
            event.preventDefault();
            if (!npcName.trim()) return;
            const id = createNpc(npcName);
            setNpcName("");
            onNpcOpenChange(false);
            appCommands.openCharacter(id);
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
