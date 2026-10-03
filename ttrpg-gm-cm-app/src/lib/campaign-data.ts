import { useStore } from "zustand";
import { createCampaignStore, type CampaignSnapshot } from "../stores/campaign-store.ts";
import type { StoredNavigationHistory } from "../stores/session-store.ts";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import type { SerializedDockview } from "dockview-react";
import type { Value } from "platejs";

const demoCharacters = ["Carlos Tree", "Niya Jade", "Renot Force"] as const;
export const characters = demoCharacters;

export type CharacterName = typeof demoCharacters[number];

const initialCharacterNotes: Record<CharacterName, Value> = {
  "Carlos Tree": [
    {
      type: "p",
      children: [
        { text: "A patient scout who knows the old forest roads better than anyone in the region." },
      ],
    },
    {
      type: "p",
      children: [
        { text: "Keeps a careful eye on strangers, but is " },
        { text: "quick to help", bold: true },
        { text: " people in trouble." },
      ],
    },
  ],
  "Niya Jade": [
    {
      type: "p",
      children: [
        { text: "A well-connected merchant who collects rumors as eagerly as rare curiosities." },
      ],
    },
    {
      type: "p",
      children: [
        { text: "Usually calm and polished, though she becomes " },
        { text: "sharp", italic: true },
        { text: " when a deal turns dishonest." },
      ],
    },
  ],
  "Renot Force": [
    {
      type: "p",
      children: [
        { text: "A retired arena champion now looking for a cause worth fighting for." },
      ],
    },
    {
      type: "p",
      children: [
        { text: "Loves a dramatic entrance and always keeps his promises." },
      ],
    },
  ],
};

export type Npc = { id: string; name: string; notes: Value };
export type WorkspaceState = {
  layout: SerializedDockview;
  panels: Record<string, SerializedDockview>;
  nextId: number;
  sidebarWidth: number;
  collapsed: boolean;
  history: StoredNavigationHistory;
};
export type Campaign = {
  format: "ttrpg-campaign";
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  npcs: Npc[];
  workspace: WorkspaceState | null;
  section: string | null;
  sidebar: { width: number; open: boolean };
};

export function emptyCampaign(name: string): Campaign {
  const now = new Date().toISOString();
  return { format: "ttrpg-campaign", schemaVersion: 1, id: crypto.randomUUID(), name,
    createdAt: now, updatedAt: now, npcs: [], workspace: null, section: null, sidebar: { width: 256, open: true } };
}

const demo = emptyCampaign("My campaign");
demo.npcs = demoCharacters.map((name) => ({ id: crypto.randomUUID(), name, notes: initialCharacterNotes[name] }));
export const campaignStore = createCampaignStore({ campaign: demo, path: null, revision: 0, savedRevision: 0,
  status: "Choose Save to keep this campaign", error: "", generation: 0, isLeaving: false });
export function useCampaign(): CampaignSnapshot;
export function useCampaign<T>(selector: (state: CampaignSnapshot) => T): T;
export function useCampaign(selector?: (state: CampaignSnapshot) => unknown) {
  return useStore(campaignStore, selector ?? ((state) => state));
}
export function getCampaign() { return campaignStore.getState(); }
export function updateCampaign(change: Partial<Campaign>) {
  campaignStore.setState((state) => ({ campaign: { ...state.campaign, ...change, updatedAt: new Date().toISOString() },
    revision: state.revision + 1, status: "Unsaved changes", error: "" }));
}
export function createNpc(name: string) {
  const npc: Npc = { id: crypto.randomUUID(), name: name.trim(), notes: [{ type: "p", children: [{ text: "" }] }] };
  updateCampaign({ npcs: [...getCampaign().campaign.npcs, npc] });
  return npc.id;
}
export function getCharacterNotes(id: string): Value {
  return getCampaign().campaign.npcs.find((npc) => npc.id === id)?.notes ?? [{ type: "p", children: [{ text: "" }] }];
}
export function saveCharacterNotes(id: string, notes: Value) {
  const { campaign } = getCampaign();
  const npc = campaign.npcs.find((item) => item.id === id);
  if (!npc || JSON.stringify(npc.notes) === JSON.stringify(notes)) return;
  updateCampaign({ npcs: campaign.npcs.map((item) => item.id === id ? { ...item, notes: structuredClone(notes) } : item) });
}

function campaignPackageName(name: string) {
  const safeName = name
    .replace(/[<>:"/\\|?*]/g, "-").replace(/\p{Cc}/gu, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "").trim() || "Campaign";
  return safeName.replace(/\.campaign$/i, "") || "Campaign";
}

async function chooseCampaignPackagePath(): Promise<string | null> {
  const packageName = campaignPackageName(getCampaign().campaign.name);
  const selectedPath = await save({
    title: "Save campaign package",
    defaultPath: packageName,
    filters: [{ name: "Campaign package", extensions: ["campaign"] }],
  });
  if (!selectedPath) return null;
  return `${selectedPath.replace(/\.campaign$/i, "")}.campaign`;
}

async function loadCampaignPath(path: string) {
  const campaign = await invoke<Campaign>("open_campaign", { path });
  campaignStore.setState((state) => ({ campaign, path, revision: 0, savedRevision: 0,
    status: "Saved", error: "", generation: state.generation + 1 }));
}

export async function openCampaignAt(path: string): Promise<boolean> {
  // A Finder-opened campaign replaces the untouched sample on cold start without a discard prompt.
  const state = getCampaign();
  if (state.generation === 0 && state.path === null && state.revision === 0) {
    try {
      await loadCampaignPath(path);
      return true;
    } catch (error) {
      campaignStore.setState({ error: String(error) });
      return false;
    }
  }
  return leaveCampaign("switch", async () => {
    await loadCampaignPath(path);
    return true;
  });
}

export async function listenForCampaignOpens() {
  if (!isTauri()) return () => {};
  const opening = new Set<string>();
  const handlePaths = (paths: string[]) => {
    for (const path of paths) {
      if (opening.has(path)) continue;
      opening.add(path);
      void openCampaignAt(path).finally(() => opening.delete(path));
    }
  };
  const unlisten = await listen<string[]>("campaign-open-requested", (event) => handlePaths(event.payload));
  const initialPaths = await invoke<string[]>("take_opened_campaigns");
  handlePaths(initialPaths);
  return unlisten;
}

let saving: Promise<boolean> | null = null;
const queuedSaves = new Set<Promise<boolean>>();
function runCampaignSave(chooseNewPath: boolean, explicit: boolean): Promise<boolean> {
  if (!explicit && getCampaign().isLeaving) return Promise.resolve(false);
  const generation = getCampaign().generation;
  const isCurrentCampaign = () => getCampaign().generation === generation;
  if (saving) {
    if (!chooseNewPath) return saving;
    const queued = saving.then(() => isCurrentCampaign() ? runCampaignSave(true, explicit) : false)
      .finally(() => { queuedSaves.delete(queued); });
    queuedSaves.add(queued);
    return queued;
  }
  saving = (async () => {
    try {
      if (!isTauri()) throw new Error("Use the desktop app (pnpm tauri dev) to save campaign folders.");
      const currentPath = getCampaign().path;
      const path = chooseNewPath || !currentPath ? await chooseCampaignPackagePath() : currentPath;
      if (!path || !isCurrentCampaign()) return false;
      do {
        const { campaign, revision } = getCampaign();
        campaignStore.setState({ status: "Saving…", error: "" });
        await invoke("save_campaign", { path, campaign });
        if (!isCurrentCampaign()) return false;
        campaignStore.setState({ path, savedRevision: revision, status: "Saved" });
      } while (getCampaign().revision !== getCampaign().savedRevision);
      return true;
    } catch (error) {
      if (isCurrentCampaign()) campaignStore.setState({ status: "Save failed — changes kept in memory", error: String(error) });
      return false;
    }
  })().finally(() => { saving = null; });
  return saving;
}
export function saveCampaign(explicit = true): Promise<boolean> {
  return runCampaignSave(false, explicit);
}
export function saveCampaignAs(): Promise<boolean> {
  return runCampaignSave(true, true);
}
export type UnsavedChoice = "save" | "discard" | "cancel";
export type LeaveIntent = "close" | "switch";
let chooseUnsaved: ((intent: LeaveIntent) => Promise<UnsavedChoice>) | null = null;
export function setUnsavedChoiceHandler(handler: (intent: LeaveIntent) => Promise<UnsavedChoice>) {
  chooseUnsaved = handler;
  return () => { if (chooseUnsaved === handler) chooseUnsaved = null; };
}

// Pause autosave for the whole transition, including any native file dialog.
export async function leaveCampaign(intent: LeaveIntent, action: () => Promise<boolean | void>): Promise<boolean> {
  if (getCampaign().isLeaving) return false;
  campaignStore.setState({ isLeaving: true });
  try {
    // Save As requests may be waiting behind the active save. Finish the whole queue
    // before replacing the document or deciding whether it has unsaved changes.
    while (saving || queuedSaves.size) await Promise.all([...(saving ? [saving] : []), ...queuedSaves]);
    const state = getCampaign();
    if (!state.path || state.revision !== state.savedRevision) {
      const choice = chooseUnsaved ? await chooseUnsaved(intent) : "save";
      if (choice === "cancel") return false;
      if (choice === "save" && !await saveCampaign()) return false;
    }
    return await action() !== false;
  } catch (error) {
    campaignStore.setState({ error: String(error) });
    return false;
  } finally {
    campaignStore.setState({ isLeaving: false });
  }
}

export async function replaceCampaign(name?: string) {
  return leaveCampaign("switch", async () => {
    // New campaigns are drafts. Choose a folder only on the first explicit Save.
    if (name !== undefined) {
      if (!name.trim()) return false;
      campaignStore.setState((state) => ({ campaign: emptyCampaign(name.trim()), path: null,
        revision: 1, savedRevision: 0, status: "Unsaved campaign — choose Save to keep it",
        error: "", generation: state.generation + 1 }));
      return true;
    }
    if (!isTauri()) throw new Error("Use the desktop app (pnpm tauri dev) to open campaign files.");
    const isMacOS = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
    const path = isMacOS
      ? await open({ title: "Open campaign package", multiple: false, filters: [{ name: "Campaign Package", extensions: ["campaign"] }] })
      : await open({ title: "Open campaign package", directory: true, multiple: false });
    if (!path) return false;
    await loadCampaignPath(path);
    return true;
  });
}
