import { createContext, useContext, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { DockviewReact, themeDark, themeLight, type DockviewApi, type IDockviewPanelProps } from "dockview-react";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { CharacterPanel } from "@/components/campaign/character-panel";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarResizeHandle } from "@/components/ui/sidebar-resize-handle";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { getCampaign, updateCampaign } from "@/lib/campaign-data";
import { cn } from "@/lib/utils";
import { MapPrototypePanel } from "@/components/campaign/map-prototype-panel";

export type WorkspaceHandle = {
  createWorkspace: () => void;
  openCharacter: (name: string) => void;
  openMap: () => void;
  closeActiveTab: () => void;
  goBack: () => void;
  goForward: () => void;
};

export type NavigationState = { canGoBack: boolean; canGoForward: boolean };
type Destination = { workspaceId: string; name: string };

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

const characterComponents = { character: CharacterPanel, map: MapPrototypePanel };

function WorkspacePanel({ api }: IDockviewPanelProps) {
  const { isDark, panels, onSearch, onPanelReady } = useWorkspaceContext();
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
        <Empty aria-label="Workspace empty state" className="absolute inset-0 h-full">
          <EmptyHeader>
            <EmptyMedia variant="icon"><SearchIcon aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>Nothing open</EmptyTitle>
            <EmptyDescription>Choose a section from the sidebar or search your campaign to open something in this workspace.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={onSearch}>
              <SearchIcon data-icon="inline-start" />Search campaign
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </div>
  );
}

const workspaceComponents = { workspace: WorkspacePanel };

export function Workspaces({ ref, isDark, onSearch, onNavigationChange }: {
  ref: Ref<WorkspaceHandle>;
  isDark: boolean;
  onSearch: () => void;
  onNavigationChange: (state: NavigationState) => void;
}) {
  const generation = useRef(getCampaign().generation).current;
  const initialState = useRef(getCampaign().campaign.workspace).current;
  const initialized = useRef(false);
  const api = useRef<DockviewApi | null>(null);
  const panels = useRef(new Map<string, DockviewApi>());
  const nextId = useRef(initialState?.nextId ?? 1);
  const subscriptions = useRef<{ dispose: () => void }[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(initialState?.collapsed ?? false);
  const [sidebarWidth, setSidebarWidth] = useState(initialState?.sidebarWidth ?? 192);
  const [workspaceTabs, setWorkspaceTabs] = useState<{ id: string; title: string }[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<{ id: string; title: string } | null>(null);
  const draggedWorkspace = useRef<string | null>(null);
  const history = useRef<{ entries: Destination[]; index: number }>(initialState ? structuredClone(initialState.history) : { entries: [], index: -1 });
  const isNavigating = useRef(false);

  const captureWorkspace = () => {
    const container = api.current;
    if (getCampaign().generation !== generation || !initialized.current || !container || container.panels.some((panel) => !panels.current.has(panel.id))) return;
    const workspace = {
      layout: container.toJSON(),
      panels: Object.fromEntries(container.panels.map((panel) => [panel.id, panels.current.get(panel.id)!.toJSON()])),
      nextId: nextId.current, sidebarWidth, collapsed: isCollapsed,
      history: structuredClone(history.current),
    };
    if (JSON.stringify(getCampaign().campaign.workspace) !== JSON.stringify(workspace)) updateCampaign({ workspace });
  };
  const captureRef = useRef(captureWorkspace);
  captureRef.current = captureWorkspace;
  const scheduleCapture = () => queueMicrotask(() => captureRef.current());
  useEffect(scheduleCapture, [isCollapsed, sidebarWidth]);
  useEffect(() => {
    window.addEventListener("campaign-workspace-change", scheduleCapture);
    return () => window.removeEventListener("campaign-workspace-change", scheduleCapture);
  }, []);

  const findDestination = (direction: -1 | 1) => {
    const { entries, index } = history.current;
    for (let next = index + direction; next >= 0 && next < entries.length; next += direction) {
      if (api.current?.getPanel(entries[next].workspaceId)) return next;
    }
    return -1;
  };

  const syncNavigation = () => onNavigationChange({
    canGoBack: findDestination(-1) !== -1,
    canGoForward: findDestination(1) !== -1,
  });

  const recordVisit = () => {
    if (isNavigating.current) return;
    const workspaceId = api.current?.activePanel?.id;
    const panel = workspaceId && panels.current.get(workspaceId)?.activePanel;
    if (!workspaceId || !panel) return;
    const name = panel.params?.name;
    if (typeof name !== "string") return;
    const current = history.current;
    const previous = current.entries[current.index];
    if (previous?.workspaceId === workspaceId && previous.name === name) return;
    current.entries = [...current.entries.slice(0, current.index + 1), { workspaceId, name }].slice(-100);
    current.index = current.entries.length - 1;
    syncNavigation();
    scheduleCapture();
  };

  const openCharacterInWorkspace = (workspace: DockviewApi, name: string) => {
    const npc = getCampaign().campaign.npcs.find((item) => item.id === name);
    if (!npc) return;
    const id = `character:${name}`;
    const existing = workspace.getPanel(id);
    if (existing) existing.api.setActive();
    else workspace.addPanel({ id, title: npc.name, component: "character", params: { name } });
  };

  const openMapInWorkspace = (workspace: DockviewApi) => {
    const id = "map:prototype";
    const existing = workspace.getPanel(id);
    if (existing) existing.api.setActive();
    else workspace.addPanel({ id, title: "Map prototype", component: "map" });
  };

  const navigate = (direction: -1 | 1) => {
    const index = findDestination(direction);
    if (index === -1) return;
    const destination = history.current.entries[index];
    const workspace = panels.current.get(destination.workspaceId);
    if (!workspace) return;
    isNavigating.current = true;
    try {
      history.current.index = index;
      api.current?.getPanel(destination.workspaceId)?.api.setActive();
      openCharacterInWorkspace(workspace, destination.name);
    } finally {
      isNavigating.current = false;
      syncNavigation();
      scheduleCapture();
    }
  };

  const onPanelReady = (workspaceId: string, workspace: DockviewApi) => {
    const saved = initialState?.panels[workspaceId];
    if (saved) workspace.fromJSON(saved);
    // Closing or moving a tab can activate another tab without a new visit.
    let isChangingLayout = false;
    const listeners = [
      workspace.onDidLayoutChange(scheduleCapture),
      workspace.onWillMutateLayout(({ kind }) => { isChangingLayout = kind !== "add"; }),
      workspace.onDidMutateLayout(() => { isChangingLayout = false; }),
      workspace.onDidActivePanelChange(() => {
        if (!isChangingLayout && api.current?.activePanel?.id === workspaceId) recordVisit();
      }),
    ];
    scheduleCapture();
    return { dispose: () => listeners.forEach((listener) => listener.dispose()) };
  };

  const syncWorkspaceTabs = () => {
    const container = api.current;
    if (!container) return;
    setWorkspaceTabs(container.groups.flatMap((group) => group.panels.map((panel) => ({ id: panel.id, title: panel.title ?? "Workspace" }))));
    setActiveWorkspace(container.activePanel?.id ?? null);
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
      syncNavigation();
    }
    setWorkspaceToDelete(null);
  };

  const createWorkspace = () => {
    const container = api.current;
    if (!container) return;
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
      openCharacterInWorkspace(workspace, name);
      recordVisit();
    },
    openMap: () => {
      const active = api.current?.activePanel;
      const workspace = active && panels.current.get(active.id);
      if (workspace) openMapInWorkspace(workspace);
    },
    closeActiveTab: () => {
      const active = api.current?.activePanel;
      const workspace = active && panels.current.get(active.id);
      if (workspace?.activePanel) workspace.activePanel.api.close();
      else if (active) requestCloseWorkspace(active.id);
    },
  }));

  useEffect(() => () => {
    subscriptions.current.forEach((subscription) => subscription.dispose());
    api.current = null;
  }, []);

  return (
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
                  variant="ghost"
                  size="icon"
                  aria-label={isCollapsed ? "Expand workspaces" : "Collapse workspaces"}
                  aria-expanded={!isCollapsed}
                  aria-controls="workspace-navigation-tabs"
                  onClick={() => setIsCollapsed((collapsed) => !collapsed)}
                >
                  {isCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
                </Button>
              } />
              <TooltipContent side="right">{isCollapsed ? "Expand workspaces" : "Collapse workspaces"}</TooltipContent>
            </Tooltip>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TabsList variant="workspace" id="workspace-navigation-tabs" aria-label="Workspaces" className="w-full items-stretch justify-start">
              {workspaceTabs.map(({ id, title }, index) => (
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
                  <Tooltip>
                    <TooltipTrigger render={
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
                    } />
                    <TooltipContent side="right">{title}</TooltipContent>
                  </Tooltip>
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
              ))}
            </TabsList>
          </div>
          <Tooltip>
            <TooltipTrigger render={
              <Button variant="ghost" size={isCollapsed ? "icon" : "default"} aria-label="New workspace" className={cn(isCollapsed ? "self-center" : "justify-start")} onClick={createWorkspace}>
                <PlusIcon data-icon="inline-start" />
                {!isCollapsed && "New workspace"}
              </Button>
            } />
            <TooltipContent side="right">New workspace</TooltipContent>
          </Tooltip>
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
                syncNavigation();
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
                syncNavigation();
              }
              if (!container.panels.length) createWorkspace();
              initialized.current = true;
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
  );
}
