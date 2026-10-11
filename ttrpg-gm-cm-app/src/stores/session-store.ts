import { normalizeSection } from "../lib/navigation-sections.ts";
import { create } from "zustand";

export type NavigationDestination =
  | { kind: "faction"; workspaceId: string; factionId: string; section: string | null }
  | { kind: "location"; workspaceId: string; locationId: string; section: string | null }
  | { kind: "character"; workspaceId: string; characterId: string; section: string | null }
  | { kind: "sample"; workspaceId: string; sampleSection: string; section: string | null }
  | { kind: "map" | "inventory" | "workspace"; workspaceId: string; section: string | null }
  | { kind: "settings" }
  | { kind: "section"; section: string | null };
export type NavigationHistory = { entries: NavigationDestination[]; index: number };
export type LegacyNavigationHistory = { entries: { workspaceId: string; name: string }[]; index: number };
export type StoredNavigationHistory = NavigationHistory | LegacyNavigationHistory;
type WorkspaceTab = { id: string; title: string };
type SidebarState = { width: number; open: boolean };
type PresenterSidebarState = { width: number; open: boolean };
type CampaignSession = {
  section: string | null;
  sidebar: SidebarState;
  npcs: { id: string }[];
  locations?: { id: string }[];
  factions?: { id: string }[];
  workspace: { history: StoredNavigationHistory; sidebarWidth: number; collapsed: boolean } | null;
};

type LocationDirectoryState = { query: string; collapsedIds: string[] };

export type SessionState = {
  locationDirectory: LocationDirectoryState;
  setLocationDirectory: (change: Partial<LocationDirectoryState>) => void;
  generation: number;
  section: string | null;
  sidebar: SidebarState;
  presenterSidebar: PresenterSidebarState;
  commandPaletteOpen: boolean;
  npcDialogOpen: boolean;
  campaignDialogOpen: boolean;
  shortcutsOpen: boolean;
  presentationStartedAt: number | null;
  presentationElapsedMs: number;
  presentationPaused: boolean;
  workspaceTabs: WorkspaceTab[];
  activeWorkspaceId: string | null;
  workspaceSidebarWidth: number;
  workspaceCollapsed: boolean;
  navigation: NavigationHistory;
  workspaceDestination: Extract<NavigationDestination, { workspaceId: string }> | null;
  validWorkspaceIds: string[];
  characterIds: string[];
  locationIds: string[];
  factionIds: string[];
  setSection: (section: string | null) => void;
  openSettings: () => void;
  leaveSettings: () => void;
  setSidebar: (sidebar: Partial<SidebarState>) => void;
  setPresenterSidebar: (sidebar: Partial<PresenterSidebarState>) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setNpcDialogOpen: (open: boolean) => void;
  setCampaignDialogOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  startPresentation: () => void;
  pausePresentation: () => void;
  resumePresentation: () => void;
  stopPresentation: () => void;
  setWorkspaceSnapshot: (tabs: WorkspaceTab[], activeId: string | null) => void;
  setWorkspaceSidebar: (change: { width?: number; collapsed?: boolean }) => void;
  setCharacterIds: (ids: string[]) => void;
  setLocationIds: (ids: string[]) => void;
  setFactionIds: (ids: string[]) => void;
  setWorkspaceDestination: (destination: Extract<NavigationDestination, { workspaceId: string }> | null) => void;
  reconcileWorkspaceDestination: (destination: Extract<NavigationDestination, { workspaceId: string }>) => void;
  visitDestination: (destination: NavigationDestination) => void;
  navigate: (direction: -1 | 1, apply?: (destination: NavigationDestination) => boolean) => NavigationDestination | null;
};

function destinationSection(destination: NavigationDestination) {
  return destination.kind === "settings" ? "Settings" : destination.section;
}

function isValidDestination(state: SessionState, destination: NavigationDestination) {
  if (destination.kind === "settings" || destination.kind === "section") return true;
  return state.validWorkspaceIds.includes(destination.workspaceId)
    && (destination.kind !== "character" || state.characterIds.includes(destination.characterId))
    && (destination.kind !== "location" || state.locationIds.includes(destination.locationId))
    && (destination.kind !== "faction" || state.factionIds.includes(destination.factionId));
}

function findDestinationIndex(state: SessionState, direction: -1 | 1) {
  const { entries, index } = state.navigation;
  for (let next = index + direction; next >= 0 && next < entries.length; next += direction) {
    // A sidebar-only entry for the already visible section would leave the
    // current document and sidebar unchanged.
    if (entries[next].kind === "section" && destinationSection(entries[next]) === state.section) continue;
    if (isValidDestination(state, entries[next])) return next;
  }
  return -1;
}

export const selectCanGoBack = (state: SessionState) => findDestinationIndex(state, -1) !== -1;
export const selectCanGoForward = (state: SessionState) => findDestinationIndex(state, 1) !== -1;

export function normalizeNavigationHistory(history?: StoredNavigationHistory): NavigationHistory {
  if (!history) return { entries: [], index: -1 };
  const entries: NavigationDestination[] = [];
  let index = -1;
  history.entries.forEach((destination, position) => {
    if ("kind" in destination) {
      if (destination.kind === "sample" && destination.sampleSection === "Overview") return;
      if (destination.kind === "section" && destination.section === "Overview") return;
      entries.push(destination.kind === "settings" ? destination
        : { ...destination, section: normalizeSection(destination.section, destination.kind) });
    } else {
      entries.push({ kind: "character", workspaceId: destination.workspaceId, characterId: destination.name, section: null });
    }
    if (position <= history.index) index = entries.length - 1;
  });
  const trimmed = entries.slice(-100);
  return { entries: trimmed, index: Math.max(-1, Math.min(trimmed.length - 1, index - (entries.length - trimmed.length))) };
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  locationDirectory: { query: "", collapsedIds: [] },
  setLocationDirectory: (change) => set((state) => ({ locationDirectory: { ...state.locationDirectory, ...change } })),
  generation: 0,
  section: null,
  sidebar: { width: 256, open: true },
  presenterSidebar: { width: 256, open: true },
  commandPaletteOpen: false,
  npcDialogOpen: false,
  campaignDialogOpen: false,
  shortcutsOpen: false,
  presentationStartedAt: null,
  presentationElapsedMs: 0,
  presentationPaused: false,
  workspaceTabs: [],
  activeWorkspaceId: null,
  workspaceSidebarWidth: 192,
  workspaceCollapsed: false,
  navigation: { entries: [], index: -1 },
  workspaceDestination: null,
  validWorkspaceIds: [],
  characterIds: [],
  locationIds: [],
  factionIds: [],
  setSection: (section) => {
    const workspace = get().workspaceDestination;
    get().visitDestination(section === "Settings" ? { kind: "settings" }
      : workspace ? { ...workspace, section } : { kind: "section", section });
  },
  openSettings: () => get().setSection("Settings"),
  leaveSettings: () => { if (get().section === "Settings") set({ section: null }); },
  setSidebar: (sidebar) => set((state) => ({ sidebar: { ...state.sidebar, ...sidebar } })),
  setPresenterSidebar: (sidebar) => set((state) => ({ presenterSidebar: { ...state.presenterSidebar, ...sidebar } })),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setNpcDialogOpen: (npcDialogOpen) => set({ npcDialogOpen }),
  setCampaignDialogOpen: (campaignDialogOpen) => set({ campaignDialogOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  startPresentation: () => set((state) => state.presentationStartedAt === null && !state.presentationPaused
    ? { presentationStartedAt: Date.now(), presentationElapsedMs: 0 }
    : state),
  pausePresentation: () => set((state) => state.presentationStartedAt === null
    ? state
    : {
      presentationStartedAt: null,
      presentationElapsedMs: state.presentationElapsedMs + Date.now() - state.presentationStartedAt,
      presentationPaused: true,
    }),
  resumePresentation: () => set((state) => !state.presentationPaused
    ? state
    : { presentationStartedAt: Date.now(), presentationPaused: false }),
  stopPresentation: () => set((state) => state.presentationStartedAt === null && !state.presentationPaused
    ? state
    : { presentationStartedAt: null, presentationElapsedMs: 0, presentationPaused: false }),
  setWorkspaceSnapshot: (workspaceTabs, activeWorkspaceId) => {
    const state = get();
    if (state.activeWorkspaceId === activeWorkspaceId && JSON.stringify(state.workspaceTabs) === JSON.stringify(workspaceTabs)) return;
    set({ workspaceTabs, activeWorkspaceId, validWorkspaceIds: workspaceTabs.map((tab) => tab.id),
      workspaceDestination: state.workspaceDestination?.workspaceId === activeWorkspaceId ? state.workspaceDestination : null });
  },
  setWorkspaceSidebar: (change) => set((state) => ({
    workspaceSidebarWidth: change.width ?? state.workspaceSidebarWidth,
    workspaceCollapsed: change.collapsed ?? state.workspaceCollapsed,
  })),
  setFactionIds: (factionIds) => { if (JSON.stringify(get().factionIds) !== JSON.stringify(factionIds)) set({ factionIds }); },
  setLocationIds: (locationIds) => { if (JSON.stringify(get().locationIds) !== JSON.stringify(locationIds)) set({ locationIds }); },
  setCharacterIds: (characterIds) => { if (JSON.stringify(get().characterIds) !== JSON.stringify(characterIds)) set({ characterIds }); },
  setWorkspaceDestination: (workspaceDestination) => set({ workspaceDestination }),
  reconcileWorkspaceDestination: (workspaceDestination) => set((state) => {
    if (state.section === "Settings") return { workspaceDestination };
    const { entries, index } = state.navigation;
    const matches = (destination: NavigationDestination) => "workspaceId" in destination
      && destination.workspaceId === workspaceDestination.workspaceId && destination.kind === workspaceDestination.kind
      && (destination.kind !== "sample" || (workspaceDestination.kind === "sample" && destination.sampleSection === workspaceDestination.sampleSection))
      && (destination.kind !== "character" || (workspaceDestination.kind === "character" && destination.characterId === workspaceDestination.characterId))
      && (destination.kind !== "location" || (workspaceDestination.kind === "location" && destination.locationId === workspaceDestination.locationId))
      && (destination.kind !== "faction" || (workspaceDestination.kind === "faction" && destination.factionId === workspaceDestination.factionId));
    // Dockview selected a fallback after a close/move. Align the cursor with
    // that existing visit rather than recording a new user navigation.
    let match = -1;
    for (let next = index; next >= 0; next--) {
      if (matches(entries[next])) { match = next; break; }
    }
    if (match === -1) match = entries.findIndex(matches);
    if (match === -1) return { workspaceDestination };
    const section = destinationSection(entries[match]);
    const next = section === state.section ? entries : entries.map((entry, position) => position === match ? workspaceDestination : entry);
    return { workspaceDestination, navigation: match === index && next === entries ? state.navigation : { entries: next, index: match } };
  }),
  visitDestination: (destination) => set((state) => {
    const { entries, index } = state.navigation;
    const workspaceDestination = "workspaceId" in destination ? destination : state.workspaceDestination;
    if (JSON.stringify(entries[index]) === JSON.stringify(destination)) return { section: destinationSection(destination), workspaceDestination };
    const next = [...entries.slice(0, index + 1), destination].slice(-100);
    return { section: destinationSection(destination), workspaceDestination, navigation: { entries: next, index: next.length - 1 } };
  }),
  navigate: (direction, apply) => {
    const state = get();
    const index = findDestinationIndex(state, direction);
    if (index === -1) return null;
    const destination = state.navigation.entries[index];
    if (destination.kind !== "settings" && destination.kind !== "section" && !apply?.(destination)) return null;
    if (get().generation !== state.generation) return null;
    set({ section: destinationSection(destination), workspaceDestination: "workspaceId" in destination ? destination : state.workspaceDestination, navigation: { ...state.navigation, index } });
    return destination;
  },
}));

/** Reset all window session state together before mounting the next campaign's Dockview. */
export function hydrateSession(campaign: CampaignSession, generation: number) {
  const navigation = normalizeNavigationHistory(campaign.workspace?.history);
  useSessionStore.setState({
    generation,
    locationDirectory: { query: "", collapsedIds: [] },
    section: normalizeSection(campaign.section, navigation.entries[navigation.index]?.kind),
    sidebar: { ...campaign.sidebar },
    presenterSidebar: { width: 256, open: true },
    commandPaletteOpen: false,
    npcDialogOpen: false,
    campaignDialogOpen: false,
    shortcutsOpen: false,
    presentationStartedAt: null,
    presentationElapsedMs: 0,
    presentationPaused: false,
    workspaceTabs: [],
    activeWorkspaceId: null,
    workspaceSidebarWidth: campaign.workspace?.sidebarWidth ?? 192,
    workspaceCollapsed: campaign.workspace?.collapsed ?? false,
    navigation,
    workspaceDestination: null,
    validWorkspaceIds: [],
    characterIds: campaign.npcs.map((npc) => npc.id),
    locationIds: (campaign.locations ?? []).map((location) => location.id),
    factionIds: (campaign.factions ?? []).map((faction) => faction.id),
  });
}
