import { createStore } from "zustand/vanilla";
import { getCampaign } from "./campaign-data.ts";
import { saveMap } from "./map-commands.ts";
import { sameMap, type CampaignMap } from "./map-data.ts";

type Edit = { before: CampaignMap; after: CampaignMap; label: string };
type History = { past: Edit[]; future: Edit[] };
export const mapHistoryStore = createStore<{ generation: number; records: Record<string, History> }>()(() => ({ generation: -1, records: {} }));
export function mapHistory(id: string): History {
  const state = mapHistoryStore.getState();
  if (state.generation !== getCampaign().generation) return { past: [], future: [] };
  return state.records[id] ?? { past: [], future: [] };
}
export function commitMapEdit(map: CampaignMap, label: string) {
  const { campaign, generation } = getCampaign();
  const before = campaign.maps?.find((item) => item.id === map.id);
  if (!before || sameMap(before, map) || !saveMap(map)) return false;
  const history = mapHistory(map.id);
  const last = history.past[history.past.length - 1];
  const past = last && !sameMap(last.after, before) ? [] : history.past;
  mapHistoryStore.setState((state) => ({ generation, records: { ...(state.generation === generation ? state.records : {}),
    [map.id]: { past: [...past, { before: structuredClone(before), after: structuredClone(map), label }].slice(-50), future: [] } } }));
  return true;
}
export function applyMapHistory(id: string, direction: "undo" | "redo") {
  const history = mapHistory(id);
  const undo = direction === "undo";
  const edit = (undo ? history.past : history.future)[(undo ? history.past : history.future).length - 1];
  const current = getCampaign().campaign.maps?.find((map) => map.id === id);
  if (!edit || !sameMap(current, undo ? edit.after : edit.before)) return false;
  if (!saveMap(undo ? edit.before : edit.after)) return false;
  mapHistoryStore.setState((state) => ({ records: { ...state.records, [id]: undo
    ? { past: history.past.slice(0, -1), future: [...history.future, edit] }
    : { past: [...history.past, edit], future: history.future.slice(0, -1) } } }));
  return true;
}
