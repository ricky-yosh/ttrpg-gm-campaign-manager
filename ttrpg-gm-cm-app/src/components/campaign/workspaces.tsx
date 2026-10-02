import { createContext, useContext, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { DockviewReact, themeDark, themeLight, type DockviewApi, type IDockviewPanelProps } from "dockview-react";
import { PanelLeftCloseIcon, PanelLeftOpenIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { CharacterPanel } from "@/components/campaign/character-panel";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarResizeHandle } from "@/components/ui/sidebar-resize-handle";
import { cn } from "@/lib/utils";

export type WorkspaceHandle = {
  createWorkspace: () => void;
  openCharacter: (name: string) => void;
  closeActiveTab: () => void;
};

const WorkspaceContext = createContext<{
  isDark: boolean;
  panels: Map<string, DockviewApi>;
  onSearch: () => void;
} | null>(null);

function useWorkspaceContext() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Workspaces must provide their context");
  return context;
}

const characterComponents = { character: CharacterPanel };

function WorkspacePanel({ api }: IDockviewPanelProps) {
  const { isDark, panels, onSearch } = useWorkspaceContext();
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
          subscription.current = panelApi.onDidLayoutChange(() => setHasPanels(panelApi.panels.length > 0));
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

export function Workspaces({ ref, isDark, onSearch }: {
  ref: Ref<WorkspaceHandle>;
  isDark: boolean;
  onSearch: () => void;
}) {
  const api = useRef<DockviewApi | null>(null);
  const panels = useRef(new Map<string, DockviewApi>());
  const nextId = useRef(1);
  const subscriptions = useRef<{ dispose: () => void }[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(192);
  const [workspaceTabs, setWorkspaceTabs] = useState<{ id: string; title: string }[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
  const draggedWorkspace = useRef<string | null>(null);

  const syncWorkspaceTabs = () => {
    const container = api.current;
    if (!container) return;
    setWorkspaceTabs(container.groups.flatMap((group) => group.panels.map((panel) => ({ id: panel.id, title: panel.title ?? "Workspace" }))));
    setActiveWorkspace(container.activePanel?.id ?? null);
  };

  const moveWorkspace = (id: string, index: number) => {
    const panel = api.current?.getPanel(id);
    if (!panel) return;
    panel.api.moveTo({ group: panel.api.group, index });
    syncWorkspaceTabs();
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
    openCharacter: (name) => {
      const active = api.current?.activePanel;
      const workspace = active && panels.current.get(active.id);
      if (!workspace) return;
      const id = `character:${name}`;
      const existing = workspace.getPanel(id);
      if (existing) existing.api.setActive();
      else workspace.addPanel({ id, title: name, component: "character", params: { name } });
    },
    closeActiveTab: () => {
      const active = api.current?.activePanel;
      const workspace = active && panels.current.get(active.id);
      if (workspace?.activePanel) workspace.activePanel.api.close();
      else active?.api.close();
    },
  }));

  useEffect(() => () => {
    subscriptions.current.forEach((subscription) => subscription.dispose());
    api.current = null;
  }, []);

  return (
    <WorkspaceContext.Provider value={{ isDark, panels: panels.current, onSearch }}>
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
          <div className="flex h-8 shrink-0 items-center justify-between gap-2">
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
                  {isCollapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
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
                            api.current?.getPanel(id)?.api.close();
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
                      onClick={() => api.current?.getPanel(id)?.api.close()}
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
              <Button variant="ghost" size={isCollapsed ? "icon" : "default"} aria-label="New workspace" className={cn(!isCollapsed && "justify-start")} onClick={createWorkspace}>
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
              nextId.current = 1;
              subscriptions.current.forEach((subscription) => subscription.dispose());
              subscriptions.current = [container.onDidActivePanelChange(syncWorkspaceTabs), container.onDidRemovePanel(() => {
                // Keep one workspace available after closing the last tab.
                queueMicrotask(() => {
                  if (api.current !== container) return;
                  if (!container.panels.length) createWorkspace();
                  else syncWorkspaceTabs();
                });
              })];
              createWorkspace();
            }}
          />
        </TabsContent>
      </Tabs>
    </WorkspaceContext.Provider>
  );
}
