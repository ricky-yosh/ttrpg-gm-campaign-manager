import { createContext } from "react";
import type { IDockviewPanelProps } from "dockview-react";

export type NpcHistoryDirection = "undo" | "redo";
export type NpcHistoryHandler = {
  apply: (direction: NpcHistoryDirection) => boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
};

// Key by panel API so the same NPC can be open in several workspaces.
export const NpcHistoryContext = createContext<Map<IDockviewPanelProps["api"], NpcHistoryHandler> | null>(null);
