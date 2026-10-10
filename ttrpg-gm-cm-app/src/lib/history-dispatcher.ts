import { registerHistoryMenuActionHandler, updateHistoryMenu } from "@/lib/history-menu";
import type { NpcHistoryDirection } from "@/components/campaign/npc-history-context";
import { isTauri } from "@tauri-apps/api/core";

export type HistoryTarget = {
  undoLabel: string | null;
  redoLabel: string | null;
  apply: (direction: NpcHistoryDirection) => boolean | void;
};

const editors = new Map<HTMLElement, () => HistoryTarget>();
let savedHistory: (() => HistoryTarget | null) | undefined;

export function registerSavedHistory(resolve: () => HistoryTarget | null) {
  savedHistory = resolve;
  refreshHistory();
  return () => {
    if (savedHistory === resolve) savedHistory = undefined;
    refreshHistory();
  };
}

export function registerEditorHistory(element: HTMLElement, resolve: () => HistoryTarget) {
  editors.set(element, resolve);
  refreshHistory();
  return () => { editors.delete(element); refreshHistory(); };
}

function activeTarget(): HistoryTarget | null {
  const focused = document.activeElement;
  for (const [element, resolve] of editors) {
    if (focused && element.contains(focused)) return resolve();
  }
  if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) {
    if (focused.readOnly || focused.disabled) return null;
    if (focused instanceof HTMLInputElement && !["text", "search", "email", "url", "tel", "password", "number"].includes(focused.type)) {
      return null;
    }
    // Browser commands preserve the input's native text history and selection.
    return {
      undoLabel: document.queryCommandEnabled("undo") ? "Typing" : null,
      redoLabel: document.queryCommandEnabled("redo") ? "Typing" : null,
      apply: (direction) => { focused.focus(); document.execCommand(direction); },
    };
  }
  // An unregistered editor must never fall through to saved NPC history.
  if (focused instanceof HTMLElement && focused.isContentEditable) return null;
  return savedHistory?.() ?? null;
}

export function dispatchHistory(direction: NpcHistoryDirection) {
  const target = activeTarget();
  const label = direction === "undo" ? target?.undoLabel : target?.redoLabel;
  if (label && target) target.apply(direction);
  refreshHistory();
}

export function refreshHistory() {
  const target = activeTarget();
  updateHistoryMenu({ undoLabel: target?.undoLabel ?? null, redoLabel: target?.redoLabel ?? null });
}

export function startHistoryDispatcher() {
  let disposed = false;
  const unregisterMenuAction = registerHistoryMenuActionHandler(dispatchHistory);
  const useNativeMenu = isTauri();
  const isMacOS = /Mac|iPhone|iPad/.test(navigator.platform);
  const sync = () => queueMicrotask(() => { if (!disposed) refreshHistory(); });
  const keydown = (event: KeyboardEvent) => {
    const primary = isMacOS ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    if (event.defaultPrevented || event.isComposing || event.altKey || !primary || event.key.toLowerCase() !== "z") return;
    event.preventDefault();
    event.stopPropagation();
    // If a shortcut reaches the DOM, the native menu did not consume it.
    if (!event.repeat) dispatchHistory(event.shiftKey ? "redo" : "undo");
  };
  if (!useNativeMenu) window.addEventListener("keydown", keydown, true);
  window.addEventListener("focusin", sync);
  window.addEventListener("focusout", sync);
  window.addEventListener("input", sync);
  refreshHistory();
  return () => {
    disposed = true;
    unregisterMenuAction();
    if (!useNativeMenu) window.removeEventListener("keydown", keydown, true);
    window.removeEventListener("focusin", sync);
    window.removeEventListener("focusout", sync);
    window.removeEventListener("input", sync);
    updateHistoryMenu({ undoLabel: null, redoLabel: null });
  };
}
