import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { ChevronDownIcon, FileIcon, FilePlus2Icon, FolderOpenIcon, SaveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { createNpc, replaceCampaign, saveCampaign, saveCampaignAs, useCampaign } from "@/lib/campaign-data";

type FileCommand = "new" | "open" | "save" | "save-as";
let nativeMenuPromise: Promise<void> | null = null;

function installNativeFileMenu(isMacOS: boolean) {
  if (!nativeMenuPromise) {
    nativeMenuPromise = (async () => {
      const menu = await Menu.default();
      const items = [
        await MenuItem.new({ id: "campaign-new", text: "New Campaign", accelerator: "CmdOrCtrl+N", action: () => window.dispatchEvent(new CustomEvent<FileCommand>("campaign-file-command", { detail: "new" })) }),
        await MenuItem.new({ id: "campaign-open", text: "Open Campaign…", accelerator: "CmdOrCtrl+O", action: () => window.dispatchEvent(new CustomEvent<FileCommand>("campaign-file-command", { detail: "open" })) }),
        await PredefinedMenuItem.new({ item: "Separator" }),
        await MenuItem.new({ id: "campaign-save", text: "Save Campaign", accelerator: "CmdOrCtrl+S", action: () => window.dispatchEvent(new CustomEvent<FileCommand>("campaign-file-command", { detail: "save" })) }),
        await MenuItem.new({ id: "campaign-save-as", text: "Save As…", accelerator: "CmdOrCtrl+Shift+S", action: () => window.dispatchEvent(new CustomEvent<FileCommand>("campaign-file-command", { detail: "save-as" })) }),
      ];

      const existingItems = await menu.items();
      let fileMenu: Submenu | undefined;
      let appMenu: Submenu | undefined;
      for (const item of existingItems) {
        if (item instanceof Submenu) {
          const text = await item.text();
          if (text === "File") fileMenu = item;
          else if (!appMenu) appMenu = item;
        }
      }

      if (isMacOS && appMenu) {
        await appMenu.insert(await MenuItem.new({
          id: "app-settings",
          text: "Settings…",
          accelerator: "CmdOrCtrl+,",
          action: () => window.dispatchEvent(new CustomEvent("app-open-settings")),
        }), 1);
      }

      if (fileMenu) await fileMenu.prepend(items);
      else if (isMacOS) await menu.insert(await Submenu.new({ text: "File", items }), 1);
      else await menu.prepend(await Submenu.new({ text: "File", items }));

      if (isMacOS) await menu.setAsAppMenu();
      else await menu.setAsWindowMenu(getCurrentWindow());
    })().catch((error: unknown) => {
      nativeMenuPromise = null;
      throw error;
    });
  }
  return nativeMenuPromise;
}

export function CampaignControls({ npcOpen, onNpcOpenChange, onOpenNpc }: {
  npcOpen: boolean;
  onNpcOpenChange: (open: boolean) => void;
  onOpenNpc: (id: string) => void;
}) {
  const { campaign, status, error, path } = useCampaign();
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [name, setName] = useState("");
  const [npcName, setNpcName] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  };
  useEffect(() => {
    const handleFileCommand = (event: Event) => {
      const command = (event as CustomEvent<FileCommand>).detail;
      if (command === "new") {
        setName("");
        setCampaignOpen(true);
      } else if (command === "open") void run(() => replaceCampaign());
      else if (command === "save") void run(() => saveCampaign());
      else if (command === "save-as") void run(() => saveCampaignAs());
    };
    window.addEventListener("campaign-file-command", handleFileCommand);
    if (isTauri()) {
      void installNativeFileMenu(typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform))
        .catch((error: unknown) => console.error("Could not install native File menu", error));
    }
    return () => window.removeEventListener("campaign-file-command", handleFileCommand);
  }, []);
  return (
    <>
      {!isTauri() && <DropdownMenu>
        <DropdownMenuTrigger render={
          <Button data-tauri-drag-region="false" variant="ghost" size="sm" aria-label="File commands">
            <FileIcon data-icon="inline-start" />File<ChevronDownIcon data-icon="inline-end" />
          </Button>
        } />
        <DropdownMenuContent>
          <div className="flex min-w-0 flex-col gap-0.5 px-2 py-1.5">
            <span className="truncate text-sm font-medium" title={path ?? campaign.name}>{campaign.name}</span>
            <span role="status" className="truncate text-xs text-muted-foreground">{status}</span>
            {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={busy} onClick={() => { setName(""); setCampaignOpen(true); }}>
            <FilePlus2Icon />New campaign
          </DropdownMenuItem>
          <DropdownMenuItem disabled={busy} onClick={() => void run(() => replaceCampaign())}>
            <FolderOpenIcon />Open campaign
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={busy || status === "Saving…"} onClick={() => void run(() => saveCampaign())}>
            <SaveIcon />Save campaign
          </DropdownMenuItem>
          <DropdownMenuItem disabled={busy || status === "Saving…"} onClick={() => void run(() => saveCampaignAs())}>
            <SaveIcon />Save as…
          </DropdownMenuItem>
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
