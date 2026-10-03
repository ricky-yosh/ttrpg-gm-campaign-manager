import { getCampaign, replaceCampaign, saveCampaign, saveCampaignAs } from "./campaign-data.ts";
import { selectCanGoBack, useSessionStore } from "../stores/session-store.ts";
import type { WorkspaceHandle } from "@/components/campaign/workspaces";

let workspaceController: { generation: number; getHandle: () => WorkspaceHandle | null } | null = null;

export function registerWorkspaceCommands(generation: number, getHandle: () => WorkspaceHandle | null) {
  const controller = { generation, getHandle };
  workspaceController = controller;
  return () => { if (workspaceController === controller) workspaceController = null; };
}

function workspace(): WorkspaceHandle | null {
  const { generation, isLeaving } = getCampaign();
  return !isLeaving && workspaceController?.generation === generation ? workspaceController.getHandle() : null;
}

function openDialog(kind: "palette" | "npc" | "shortcuts" | "campaign") {
  if (getCampaign().isLeaving) return;
  useSessionStore.setState({
    commandPaletteOpen: kind === "palette",
    npcDialogOpen: kind === "npc",
    shortcutsOpen: kind === "shortcuts",
    campaignDialogOpen: kind === "campaign",
  });
}

export const appCommands = {
  openCommandPalette: () => openDialog("palette"),
  createNpc: () => openDialog("npc"),
  openShortcuts: () => openDialog("shortcuts"),
  newCampaign: () => openDialog("campaign"),
  openSettings: () => {
    if (getCampaign().isLeaving) return;
    useSessionStore.setState({ commandPaletteOpen: false, npcDialogOpen: false, shortcutsOpen: false, campaignDialogOpen: false });
    useSessionStore.getState().setSection("Settings");
  },
  selectSection: (section: string | null) => { if (!getCampaign().isLeaving) useSessionStore.getState().setSection(section); },
  openCharacter: (id: string) => workspace()?.openCharacter(id),
  openMap: () => workspace()?.openMap(),
  createWorkspace: () => workspace()?.createWorkspace(),
  closeActiveTab: () => {
    if (getCampaign().isLeaving) return;
    const state = useSessionStore.getState();
    if (state.section === "Settings") {
      if (selectCanGoBack(state)) workspace()?.goBack();
      else state.setSection(null);
    } else workspace()?.closeActiveTab();
  },
  goBack: () => workspace()?.goBack(),
  goForward: () => workspace()?.goForward(),
  openCampaign: () => getCampaign().isLeaving ? Promise.resolve(false) : replaceCampaign(),
  saveCampaign: () => getCampaign().isLeaving ? Promise.resolve(false) : saveCampaign(),
  saveCampaignAs: () => getCampaign().isLeaving ? Promise.resolve(false) : saveCampaignAs(),
};
