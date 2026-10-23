import type { SerializedDockview } from "dockview-react";

type GridNode = SerializedDockview["grid"]["root"];
type GroupState = Exclude<GridNode["data"], GridNode[]>;

/** Prototype tabs are transient; remove their layout references before campaign persistence. */
export function withoutPrototypePanels(layout: SerializedDockview): SerializedDockview {
  const removed = new Set(Object.entries(layout.panels).filter(([, panel]) => panel.contentComponent === "sessions" || panel.contentComponent === "sample")
    .map(([id]) => id));
  if (!removed.size) return layout;

  const saved = structuredClone(layout);
  for (const id of removed) delete saved.panels[id];
  const groups: string[] = [];
  const cleanGroup = (group: GroupState): GroupState | null => {
    const views = group.views.filter((id) => !removed.has(id));
    if (!views.length) return null;
    groups.push(group.id);
    const next = { ...group, views };
    if (!next.activeView || !views.includes(next.activeView)) next.activeView = views[0];
    if (next.tabGroups) next.tabGroups = next.tabGroups.map((tabGroup) => ({ ...tabGroup,
      panelIds: tabGroup.panelIds.filter((id) => !removed.has(id)),
    })).filter((tabGroup) => tabGroup.panelIds.length > 0);
    return next;
  };
  const cleanNode = (node: GridNode): GridNode | null => {
    if (Array.isArray(node.data)) {
      const data = node.data.map(cleanNode).filter((child): child is GridNode => child !== null);
      return data.length ? { ...node, data } : null;
    }
    const data = cleanGroup(node.data);
    return data ? { ...node, data } : null;
  };
  saved.grid.root = cleanNode(saved.grid.root) ?? { type: "branch", data: [] };
  Reflect.deleteProperty(saved.grid, "maximizedNode");
  const cleanDetached = <T extends NonNullable<SerializedDockview["floatingGroups"]>[number] | NonNullable<SerializedDockview["popoutGroups"]>[number]>(items: T[]): T[] => items.flatMap((item) => {
    if (item.data) {
      const data = cleanGroup(item.data);
      return data ? [{ ...item, data }] : [];
    }
    if (item.grid) {
      const root = cleanNode(item.grid.root);
      if (!root) return [];
      const grid = { ...item.grid, root };
      delete grid.maximizedNode;
      return [{ ...item, grid }];
    }
    return [item];
  });
  if (saved.floatingGroups) saved.floatingGroups = cleanDetached(saved.floatingGroups);
  if (saved.popoutGroups) saved.popoutGroups = cleanDetached(saved.popoutGroups);
  if (saved.edgeGroups) {
    for (const edge of Object.values(saved.edgeGroups)) {
      const group = edge?.group;
      if (!group || typeof group !== "object" || !("views" in group) || !Array.isArray(group.views)) continue;
      const cleaned = cleanGroup(group as GroupState);
      if (cleaned) edge.group = cleaned;
      else { delete edge.group; edge.visible = false; }
    }
  }
  for (const popout of saved.popoutGroups ?? []) {
    if (popout.gridReferenceGroup && !groups.includes(popout.gridReferenceGroup)) delete popout.gridReferenceGroup;
  }
  if (!saved.activeGroup || !groups.includes(saved.activeGroup)) {
    if (groups.length) saved.activeGroup = groups[0];
    else delete saved.activeGroup;
  }
  return saved;
}
