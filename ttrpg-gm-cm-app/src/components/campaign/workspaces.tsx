import { InventoryPanel } from "@/components/campaign/inventory-panel";
import { NpcHistoryContext, type NpcHistoryHandler } from "@/components/campaign/npc-history-context";
import { FactionPanel } from "@/components/campaign/faction-panel";
import { LocationPanel } from "@/components/campaign/location-panel";
import { createContext, useContext, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { DockviewReact, themeDark, themeLight, type DockviewApi, type IDockviewPanelProps } from "dockview-react";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, XIcon } from "lucide-react";
import { CharacterPanel } from "@/components/campaign/character-panel";
import { Button } from "@/components/ui/button";
import { WorkspaceEmptyState } from "@/components/campaign/workspace-empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarResizeHandle } from "@/components/ui/sidebar-resize-handle";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { campaignStore, getCampaign, updateCampaign } from "@/lib/campaign-data";
import { cn } from "@/lib/utils";
import { registerSavedHistory, refreshHistory } from "@/lib/history-dispatcher";
import { MapPanel } from "@/components/campaign/map-panel";
import { SampleSectionPage } from "@/components/campaign/sample-section-page";
import { useSessionStore, type NavigationDestination } from "@/stores/session-store";

export type WorkspaceHandle = {
  createWorkspace: () => void;
  openCharacter: (name: string) => void;
  openLocation: (id: string) => void;
  openFaction: (id: string) => void;
  openMap: (id: string, pinId?: string, placeLocationId?: string) => void;
  openLocationBesideMap: (id: string) => void;
  openInventory: () => void;
  openSampleSection: (section: string) => void;
  closeActiveTab: () => void;
  goBack: () => void;
  goForward: () => void;
};


const WorkspaceContext = createContext<{
  isDark: boolean;
  panels: Map<string, DockviewApi>;
  onSearch: () => void;
  onPanelReady: (workspaceId: string, api: DockviewApi) => { dispose: () => void };
} | null>(null);

function useWorkspaceContext() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Workspaces must provide their context");
  return context;
}

function SampleSectionPanel({ params }: IDockviewPanelProps) {
  return <SampleSectionPage section={typeof params.sampleSection === "string" ? params.sampleSection : ""} />;
}

// Old saved layouts briefly mount this placeholder before obsolete library tabs are removed.
function LegacyMapLibrary() { return null; }

const characterComponents = { character: CharacterPanel, map: MapPanel, mapLibrary: LegacyMapLibrary, location: LocationPanel, faction: FactionPanel, inventory: InventoryPanel, sample: SampleSectionPanel };

function WorkspacePanel({ api }: IDockviewPanelProps) {
  const { isDark, panels, onPanelReady } = useWorkspaceContext();
  const [hasPanels, setHasPanels] = useState(false);
  const [isVisible, setIsVisible] = useState(api.isVisible);
  const subscription = useRef<{ dispose: () => void } | null>(null);

  useEffect(() => {
    setIsVisible(api.isVisible);
    const visibility = api.onDidVisibilityChange((event) => setIsVisible(event.isVisible));
    return () => visibility.dispose();
  }, [api]);

  useEffect(() => () => {
    subscription.current?.dispose();
    panels.delete(api.id);
  }, [api.id, panels]);

  return (
    <div className="relative size-full" hidden={!isVisible}>
      <DockviewReact
        className="campaign-dockview"
        theme={isDark ? themeDark : themeLight}
        components={characterComponents}
        dndStrategy="pointer"
        onWillDrop={(event) => {
          const source = event.getData();
          if (source && source.viewId !== event.api.id) event.preventDefault();
        }}
        onReady={({ api: panelApi }) => {
          panels.set(api.id, panelApi);
          setHasPanels(panelApi.panels.length > 0);
          subscription.current?.dispose();
          const layout = panelApi.onDidLayoutChange(() => setHasPanels(panelApi.panels.length > 0));
          const navigation = onPanelReady(api.id, panelApi);
          subscription.current = { dispose: () => { layout.dispose(); navigation.dispose(); } };
        }}
      />
      {!hasPanels && (
        <WorkspaceEmptyState
          className="absolute inset-0 h-full"
          description="Choose a section from the sidebar or search your campaign to open something in this workspace."
        />
      )}
    </div>
  );
}

const workspaceComponents = { workspace: WorkspacePanel };

export function Workspaces({ ref, isDark, onSearch, historyEnabled }: {
  ref: Ref<WorkspaceHandle>;
  isDark: boolean;
  onSearch: () => void;
  historyEnabled: boolean;
}) {
  const generation = useRef(getCampaign().generation).current;
  const initialState = useRef(getCampaign().campaign.workspace).current;
  const initialized = useRef(false);
  const api = useRef<DockviewApi | null>(null);
  const panels = useRef(new Map<string, DockviewApi>());
  const historyHandlers = useRef(new Map<IDockviewPanelProps["api"], NpcHistoryHandler>());
  const nextId = useRef(initialState?.nextId ?? 1);
  const subscriptions = useRef<{ dispose: () => void }[]>([]);
  const isCollapsed = useSessionStore((state) => state.workspaceCollapsed);
  const sidebarWidth = useSessionStore((state) => state.workspaceSidebarWidth);
  const workspaceTabs = useSessionStore((state) => state.workspaceTabs);
  const activeWorkspace = useSessionStore((state) => state.activeWorkspaceId);
  const setIsCollapsed = (collapsed: boolean) => useSessionStore.getState().setWorkspaceSidebar({ collapsed });
  const setSidebarWidth = (width: number) => useSessionStore.getState().setWorkspaceSidebar({ width });
  const [workspaceToDelete, setWorkspaceToDelete] = useState<{ id: string; title: string } | null>(null);
  const draggedWorkspace = useRef<string | null>(null);
  const isNavigating = useRef(false);

  useEffect(() => {
    const isMacOS = /Mac|iPhone|iPad/.test(navigator.platform);
    const handleWorkspaceSidebarShortcut = (event: KeyboardEvent) => {
      const hasPrimaryModifier = isMacOS ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        event.repeat || event.altKey || event.shiftKey || !hasPrimaryModifier ||
        (event.code !== "Backslash" && event.key !== "\\") ||
        target?.closest('[role="dialog"], [contenteditable="true"]')
      ) return;

      event.preventDefault();
      const state = useSessionStore.getState();
      state.setWorkspaceSidebar({ collapsed: !state.workspaceCollapsed });
    };

    window.addEventListener("keydown", handleWorkspaceSidebarShortcut);
    return () => window.removeEventListener("keydown", handleWorkspaceSidebarShortcut);
  }, []);

  useEffect(() => {
    const unregister = registerSavedHistory(() => {
      const campaign = getCampaign();
      const session = useSessionStore.getState();
      if (!historyEnabled || document.querySelector('[role="dialog"], [role="alertdialog"]')
        || campaign.isLeaving || campaign.generation !== generation || session.generation !== generation
        || session.section === "Settings" || session.commandPaletteOpen || session.npcDialogOpen || session.mapDialogOpen
        || session.campaignDialogOpen || session.shortcutsOpen) return null;
      const workspaceId = api.current?.activePanel?.id;
      const panel = workspaceId ? panels.current.get(workspaceId)?.activePanel : null;
      if (!panel || campaign.pendingNpcOperations[panel.params?.name]) return null;
      const handler = historyHandlers.current.get(panel.api);
      if (!handler) return null;
      return { undoLabel: handler.canUndo ? handler.undoLabel : null,
        redoLabel: handler.canRedo ? handler.redoLabel : null, apply: handler.apply };
    });
    const unsubscribeCampaign = campaignStore.subscribe(refreshHistory);
    const unsubscribeSession = useSessionStore.subscribe(refreshHistory);
    window.addEventListener("npc-history-change", refreshHistory);
    return () => {
      unregister();
      unsubscribeCampaign();
      unsubscribeSession();
      window.removeEventListener("npc-history-change", refreshHistory);
    };
  }, [generation, historyEnabled]);

  useEffect(() => {
    const syncMaps = () => {
      const maps = getCampaign().campaign.maps ?? [];
      for (const workspace of panels.current.values()) for (const panel of workspace.panels) {
        if (typeof panel.params?.mapId !== "string") continue;
        const map = maps.find((item) => item.id === panel.params?.mapId);
        if (!map) workspace.removePanel(panel);
        else if (panel.title !== map.name) panel.api.setTitle(map.name);
      }
    };
    return campaignStore.subscribe((state, previous) => { if (state.campaign.maps !== previous.campaign.maps) syncMaps(); });
  }, []);

  const captureWorkspace = () => {
    const container = api.current;
    if (getCampaign().generation !== generation || !initialized.current || !container || container.panels.some((panel) => !panels.current.has(panel.id))) return;
    const session = useSessionStore.getState();
    if (session.generation !== generation) return;
    const workspace = {
      layout: container.toJSON(),
      panels: Object.fromEntries(container.panels.map((panel) => [panel.id, panels.current.get(panel.id)!.toJSON()])),
      nextId: nextId.current, sidebarWidth: session.workspaceSidebarWidth, collapsed: session.workspaceCollapsed,
      history: structuredClone(session.navigation),
    };
    const campaign = getCampaign().campaign;
    if (JSON.stringify(campaign.workspace) !== JSON.stringify(workspace) || campaign.section !== session.section || JSON.stringify(campaign.sidebar) !== JSON.stringify(session.sidebar)) {
      updateCampaign({ workspace, section: session.section, sidebar: session.sidebar });
    }
  };
  const captureRef = useRef(captureWorkspace);
  captureRef.current = captureWorkspace;
  const scheduleCapture = () => queueMicrotask(() => captureRef.current());
  useEffect(() => useSessionStore.subscribe((state, previous) => {
    if (state.generation !== generation) return;
    if (state.section !== previous.section || state.sidebar !== previous.sidebar || state.navigation !== previous.navigation
      || state.workspaceSidebarWidth !== previous.workspaceSidebarWidth || state.workspaceCollapsed !== previous.workspaceCollapsed) scheduleCapture();
  }), [generation]);
  useEffect(() => {
    window.addEventListener("campaign-workspace-change", scheduleCapture);
    return () => window.removeEventListener("campaign-workspace-change", scheduleCapture);
  }, []);

  const recordVisit = (record = true, reconcile = false) => {
    if (isNavigating.current || !initialized.current || useSessionStore.getState().generation !== generation) return;
    const workspaceId = api.current?.activePanel?.id;
    if (!workspaceId) return;
    const workspace = panels.current.get(workspaceId);
    if (!workspace) return;
    const panel = workspace.activePanel;
    if (!panel) {
      useSessionStore.getState().setWorkspaceDestination(null);
      return;
    }
    const section = useSessionStore.getState().section;
    // Settings overlays Dockview; activation in a hidden view must not replace it.
    if (section === "Settings" && record) return;
    const visibleSection = section === "Settings" ? null : section;
    let destination: NavigationDestination;
    if (panel.id === "inventory:party") destination = { kind: "inventory", workspaceId, section: visibleSection };
    else if (typeof panel.params?.mapId === "string") destination = { kind: "map", mapId: panel.params.mapId, workspaceId, section: visibleSection };
    else if (typeof panel.params?.sampleSection === "string") destination = { kind: "sample", workspaceId, sampleSection: panel.params.sampleSection, section: visibleSection };
    else if (typeof panel.params?.factionId === "string") destination = { kind: "faction", workspaceId, factionId: panel.params.factionId, section: visibleSection };
    else if (typeof panel.params?.locationId === "string") destination = { kind: "location", workspaceId, locationId: panel.params.locationId, section: visibleSection };
    else if (typeof panel.params?.name === "string") destination = { kind: "character", workspaceId, characterId: panel.params.name, section: visibleSection };
    else return;
    if (record) useSessionStore.getState().visitDestination(destination);
    else if (reconcile) useSessionStore.getState().reconcileWorkspaceDestination(destination);
    else useSessionStore.getState().setWorkspaceDestination(destination);
  };

  const openCharacterInWorkspace = (workspace: DockviewApi, name: string) => {
    const npc = getCampaign().campaign.npcs.find((item) => item.id === name);
    if (!npc) return false;
    const id = `character:${name}`;
    const existing = workspace.getPanel(id);
    if (existing) existing.api.setActive();
    else workspace.addPanel({ id, title: npc.name, component: "character", params: { name } });
    return true;
  };

  const openLocationInWorkspace = (workspace: DockviewApi, locationId: string) => {
    const location = getCampaign().campaign.locations?.find((item) => item.id === locationId);
    if (!location) return false;
    const id = `location:${locationId}`;
    const existing = workspace.getPanel(id);
    if (existing) existing.api.setActive();
    else workspace.addPanel({ id, title: location.name, component: "location", params: { locationId } });
    return true;
  };

  const openFactionInWorkspace = (workspace: DockviewApi, factionId: string) => {
    const faction = getCampaign().campaign.factions?.find((item) => item.id === factionId);
    if (!faction) return false;
    const id = `faction:${factionId}`;
    const existing = workspace.getPanel(id);
    if (existing) existing.api.setActive();
    else workspace.addPanel({ id, title: faction.name, component: "faction", params: { factionId } });
    return true;
  };

  const openMapInWorkspace = (workspace: DockviewApi, mapId: string, pinId?: string, placeLocationId?: string) => {
    const map = getCampaign().campaign.maps?.find((item) => item.id === mapId);
    if (!map) return false;
    const id = `map:${map.id}`;
    const existing = workspace.getPanel(id);
    const pin = map?.pins.find((item) => item.id === pinId);
    const locate = pin ? { selectedPinId: pin.id, previewLocationId: pin.locationId,
      camera: { x: pin.x, y: pin.y, zoom: 2 }, collapsed: false } : {};
    if (existing) {
      if (pin || placeLocationId) existing.api.updateParameters({ ...locate, ...(placeLocationId ? { placeLocationId, placeRequest: Date.now() } : {}) });
      existing.api.setActive();
    } else workspace.addPanel({ id, title: map.name, component: "map",
      params: { mapId: map.id, ...locate, ...(placeLocationId ? { placeLocationId, placeRequest: Date.now() } : {}) } });
    return true;
  };

  const openInventoryInWorkspace = (workspace: DockviewApi) => {
    const existing = workspace.getPanel("inventory:party");
    if (existing) existing.api.setActive();
    else workspace.addPanel({ id: "inventory:party", title: "Party Inventory", component: "inventory" });
  };

  const openSampleSectionInWorkspace = (workspace: DockviewApi, section: string) => {
    if (section === "Overview") return;
    const id = `sample:${section.toLowerCase().replace(/ /g, "-")}`;
    const existing = workspace.getPanel(id);
    if (existing) existing.api.setActive();
    else workspace.addPanel({ id, title: `${section} · Sample`, component: "sample", params: { section, sampleSection: section } });
  };

  const navigate = (direction: -1 | 1) => {
    isNavigating.current = true;
    try {
      useSessionStore.getState().navigate(direction, (destination) => {
        if (destination.kind === "settings" || destination.kind === "section") return true;
        const panel = api.current?.getPanel(destination.workspaceId);
        const workspace = panels.current.get(destination.workspaceId);
        if (!panel || !workspace) return false;
        if (destination.kind === "character" && !getCampaign().campaign.npcs.some((npc) => npc.id === destination.characterId)) return false;
        if (destination.kind === "faction" && !getCampaign().campaign.factions?.some((faction) => faction.id === destination.factionId)) return false;
        if (destination.kind === "location" && !getCampaign().campaign.locations?.some((location) => location.id === destination.locationId)) return false;
        panel.api.setActive();
        if (destination.kind === "faction") return openFactionInWorkspace(workspace, destination.factionId);
        if (destination.kind === "location") return openLocationInWorkspace(workspace, destination.locationId);
        if (destination.kind === "character") return openCharacterInWorkspace(workspace, destination.characterId);
        if (destination.kind === "map") return !!destination.mapId && openMapInWorkspace(workspace, destination.mapId);
        if (destination.kind === "inventory") openInventoryInWorkspace(workspace);
        if (destination.kind === "sample") openSampleSectionInWorkspace(workspace, destination.sampleSection);
        return true;
      });
    } finally {
      isNavigating.current = false;
      scheduleCapture();
    }
  };

  const onPanelReady = (workspaceId: string, workspace: DockviewApi) => {
    const saved = initialState?.panels[workspaceId];
    if (saved) {
      workspace.fromJSON(saved);
      for (const panel of workspace.panels) {
        if (panel.id === "sample:overview" || panel.params?.sampleSection === "Overview" || panel.id === "map:prototype" || panel.id === "map:library" || panel.view.contentComponent === "mapLibrary") workspace.removePanel(panel);
        else if (typeof panel.params?.mapId === "string" && !getCampaign().campaign.maps?.some((map) => map.id === panel.params?.mapId)) workspace.removePanel(panel);
      }
    }
    // Closing or moving a tab can activate another tab without a new visit.
    let isChangingLayout = false;
    const listeners = [
      workspace.onDidLayoutChange(scheduleCapture),
      workspace.onWillMutateLayout(({ kind }) => { isChangingLayout = kind !== "add"; }),
      workspace.onDidMutateLayout(() => {
        const wasChangingLayout = isChangingLayout;
        isChangingLayout = false;
        if (wasChangingLayout && api.current?.activePanel?.id === workspaceId) recordVisit(false, true);
      }),
      workspace.onDidActivePanelChange(() => {
        if (api.current?.activePanel?.id === workspaceId) recordVisit(!isChangingLayout);
      }),
    ];
    if (api.current?.activePanel?.id === workspaceId) {
      recordVisit(false);
      if (!useSessionStore.getState().navigation.entries.length) recordVisit();
    }
    scheduleCapture();
    return { dispose: () => listeners.forEach((listener) => listener.dispose()) };
  };

  const syncWorkspaceTabs = () => {
    const container = api.current;
    if (!container) return;
    if (useSessionStore.getState().generation !== generation) return;
    useSessionStore.getState().setWorkspaceSnapshot(
      container.groups.flatMap((group) => group.panels.map((panel) => ({ id: panel.id, title: panel.title ?? "Workspace" }))),
      container.activePanel?.id ?? null,
    );
    scheduleCapture();
  };

  const moveWorkspace = (id: string, index: number) => {
    const panel = api.current?.getPanel(id);
    if (!panel) return;
    panel.api.moveTo({ group: panel.api.group, index });
    syncWorkspaceTabs();
  };

  const requestCloseWorkspace = (id: string) => {
    const workspace = workspaceTabs.find((tab) => tab.id === id);
    if (workspace) setWorkspaceToDelete(workspace);
  };

  const confirmCloseWorkspace = () => {
    if (!workspaceToDelete) return;
    isNavigating.current = true;
    try {
      api.current?.getPanel(workspaceToDelete.id)?.api.close();
    } finally {
      isNavigating.current = false;
      recordVisit(false, true);
    }
    setWorkspaceToDelete(null);
  };

  const createWorkspace = () => {
    const container = api.current;
    if (!container) return;
    if (initialized.current) useSessionStore.getState().leaveSettings();
    const number = nextId.current++;
    const workspace = container.addPanel({
      id: `workspace:${number}`,
      title: `Workspace ${number}`,
      component: "workspace",
      renderer: "always",
      ...(container.activePanel ? { position: { referencePanel: container.activePanel.id, direction: "within" as const } } : {}),
    });
    workspace.api.group.header.hidden = true;
    syncWorkspaceTabs();
  };

  useImperativeHandle(ref, () => ({
    createWorkspace,
    goBack: () => navigate(-1),
    goForward: () => navigate(1),
    openCharacter: (name) => {
      const active = api.current?.activePanel;
      const workspace = active && panels.current.get(active.id);
      if (!workspace) return;
      if (!getCampaign().campaign.npcs.some((npc) => npc.id === name)) return;
      useSessionStore.getState().leaveSettings();
      openCharacterInWorkspace(workspace, name);
      recordVisit();
    },
    openLocation: (id) => {
      const active = api.current?.activePanel;
      const workspace = active && panels.current.get(active.id);
      if (!workspace || !getCampaign().campaign.locations?.some((location) => location.id === id)) return;
      useSessionStore.getState().leaveSettings();
      openLocationInWorkspace(workspace, id);
      recordVisit();
    },
    openLocationBesideMap: (id) => {
      const active = api.current?.activePanel;
      const workspace = active && panels.current.get(active.id);
      const location = getCampaign().campaign.locations.find((item) => item.id === id);
      if (!workspace || !location) return;
      const existing = workspace.getPanel(`location:${id}`);
      if (existing) existing.api.setActive();
      else workspace.addPanel({ id: `location:${id}`, title: location.name, component: "location", params: { locationId: id },
        ...(workspace.activePanel ? { position: { referencePanel: workspace.activePanel.id, direction: "right" as const } } : {}) });
      recordVisit();
    },
    openFaction: (id) => {
      const active = api.current?.activePanel;
      const workspace = active && panels.current.get(active.id);
      if (!workspace || !getCampaign().campaign.factions?.some((faction) => faction.id === id)) return;
      useSessionStore.getState().leaveSettings();
      openFactionInWorkspace(workspace, id);
      recordVisit();
    },
    openInventory: () => {
      const active = api.current?.activePanel;
      const workspace = active && panels.current.get(active.id);
      if (!workspace) return;
      useSessionStore.getState().leaveSettings();
      openInventoryInWorkspace(workspace);
      recordVisit();
    },
    openSampleSection: (section) => {
      const active = api.current?.activePanel;
      const workspace = active && panels.current.get(active.id);
      if (!workspace) return;
      useSessionStore.getState().leaveSettings();
      openSampleSectionInWorkspace(workspace, section);
      recordVisit();
    },
    openMap: (id, pinId, placeLocationId) => {
      const active = api.current?.activePanel;
      const workspace = active && panels.current.get(active.id);
      if (workspace) {
        useSessionStore.getState().leaveSettings();
        openMapInWorkspace(workspace, id, pinId, placeLocationId);
        recordVisit();
      }
    },
    closeActiveTab: () => {
      const active = api.current?.activePanel;
      const workspace = active && panels.current.get(active.id);
      if (workspace?.activePanel) workspace.activePanel.api.close();
    },
  }));

  useEffect(() => () => {
    subscriptions.current.forEach((subscription) => subscription.dispose());
    api.current = null;
  }, []);

  const newWorkspaceButton = (
    <Button variant="sidebar" size={isCollapsed ? "icon" : "default"} aria-label="New workspace" className={cn(isCollapsed ? "self-center" : "justify-start")} onClick={createWorkspace}>
      <PlusIcon data-icon="inline-start" />
      {!isCollapsed && "New workspace"}
    </Button>
  );

  return (
    <NpcHistoryContext.Provider value={historyHandlers.current}>
    <WorkspaceContext.Provider value={{ isDark, panels: panels.current, onSearch, onPanelReady }}>
      <Tabs
        orientation="vertical"
        variant="workspace"
        value={activeWorkspace}
        onValueChange={(value) => {
          if (typeof value === "string") api.current?.getPanel(value)?.api.setActive();
        }}
        className="min-h-0 flex-1"
      >
        <aside
          aria-label="Workspace navigation"
          className="relative flex shrink-0 flex-col gap-2 border-r bg-sidebar p-2"
          style={{ width: isCollapsed ? 56 : sidebarWidth }}
        >
          <div className={cn("flex h-8 shrink-0 items-center gap-2", isCollapsed ? "justify-center" : "justify-between")}>
            {!isCollapsed && <span className="pl-1 text-xs font-medium text-muted-foreground">Workspaces</span>}
            <Tooltip>
              <TooltipTrigger render={
                <Button
                  variant="sidebar"
                  size="icon"
                  aria-label={isCollapsed ? "Expand workspaces" : "Collapse workspaces"}
                  aria-expanded={!isCollapsed}
                  aria-controls="workspace-navigation-tabs"
                  onClick={() => setIsCollapsed(!isCollapsed)}
                >
                  {isCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
                </Button>
              } />
              <TooltipContent side="right">{isCollapsed ? "Expand workspaces" : "Collapse workspaces"}</TooltipContent>
            </Tooltip>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TabsList variant="workspace" id="workspace-navigation-tabs" aria-label="Workspaces" className="w-full items-stretch justify-start">
              {workspaceTabs.map(({ id, title }, index) => {
                const tab = (
                  <TabsTrigger
                    value={id}
                    aria-label={title}
                    aria-keyshortcuts="Delete Alt+ArrowUp Alt+ArrowDown"
                    variant={isCollapsed ? "workspace-icon" : "workspace"}
                    onKeyDown={(event) => {
                      if (event.key === "Delete") {
                        event.preventDefault();
                        requestCloseWorkspace(id);
                      } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
                        event.preventDefault();
                        event.stopPropagation();
                        moveWorkspace(id, Math.max(0, Math.min(workspaceTabs.length - 1, index + (event.key === "ArrowUp" ? -1 : 1))));
                      }
                    }}
                  >
                    <span className="truncate">{isCollapsed ? id.split(":")[1] : title}</span>
                  </TabsTrigger>
                );

                return (
                  <div
                    key={id}
                    className="relative flex items-center"
                    draggable
                    onDragStart={(event) => {
                      draggedWorkspace.current = id;
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", id);
                    }}
                    onDragEnd={() => { draggedWorkspace.current = null; }}
                    onDragOver={(event) => {
                      if (draggedWorkspace.current) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (draggedWorkspace.current) moveWorkspace(draggedWorkspace.current, index);
                      draggedWorkspace.current = null;
                    }}
                  >
                    {isCollapsed ? (
                      <Tooltip>
                        <TooltipTrigger render={tab} />
                        <TooltipContent side="right">{title}</TooltipContent>
                      </Tooltip>
                    ) : tab}
                    {!isCollapsed && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="absolute right-1"
                        aria-label={`Close ${title}`}
                        onClick={() => requestCloseWorkspace(id)}
                      >
                        <XIcon />
                      </Button>
                    )}
                  </div>
                );
              })}
            </TabsList>
          </div>
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger render={newWorkspaceButton} />
              <TooltipContent side="right">New workspace</TooltipContent>
            </Tooltip>
          ) : newWorkspaceButton}
          <SidebarResizeHandle
            label="Resize workspace sidebar"
            width={sidebarWidth}
            collapsed={isCollapsed}
            collapsedWidth={56}
            minWidth={160}
            maxWidth={320}
            collapseThreshold={128}
            onWidthChange={setSidebarWidth}
            onCollapsedChange={setIsCollapsed}
          />
        </aside>
        <TabsContent value={activeWorkspace} className="min-h-0 min-w-0">
          <DockviewReact
            className="campaign-dockview"
            theme={isDark ? themeDark : themeLight}
            components={workspaceComponents}
            disableDnd
            disableFloatingGroups
            onReady={({ api: container }) => {
              api.current = container;
              initialized.current = false;
              nextId.current = initialState?.nextId ?? 1;
              subscriptions.current.forEach((subscription) => subscription.dispose());
              subscriptions.current = [container.onDidLayoutChange(scheduleCapture), container.onDidActivePanelChange(() => {
                syncWorkspaceTabs();
                recordVisit();
              }), container.onDidRemovePanel(() => {
                syncWorkspaceTabs();
                // Keep one workspace available after closing the last tab.
                queueMicrotask(() => {
                  if (api.current !== container) return;
                  if (!container.panels.length) createWorkspace();
                  else syncWorkspaceTabs();
                });
              })];
              if (initialState) {
                container.fromJSON(initialState.layout);
                container.groups.forEach((group) => { group.header.hidden = true; });
                syncWorkspaceTabs();
              }
              if (!container.panels.length) createWorkspace();
              initialized.current = true;
              if (!useSessionStore.getState().navigation.entries.length) recordVisit();
              scheduleCapture();
            }}
          />
        </TabsContent>
      </Tabs>
      <Dialog open={workspaceToDelete !== null} onOpenChange={(open) => { if (!open) setWorkspaceToDelete(null); }}>
        <DialogPopup>
          <div className="flex flex-col gap-4 p-5">
            <div className="space-y-2">
              <DialogTitle>Are you sure you want to delete {workspaceToDelete?.title}?</DialogTitle>
              <DialogDescription>This will close the workspace and all tabs open in it.</DialogDescription>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setWorkspaceToDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmCloseWorkspace}>Delete workspace</Button>
            </div>
          </div>
        </DialogPopup>
      </Dialog>
    </WorkspaceContext.Provider>
    </NpcHistoryContext.Provider>
  );
}
