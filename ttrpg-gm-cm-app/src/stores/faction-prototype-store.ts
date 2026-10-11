import { create } from "zustand";
import { campaignStore } from "../lib/campaign-data";
import type { FactionPrototype } from "../lib/faction-prototype";

// Deliberately separate from campaign data: these experiments never enter a save file.
export const useFactionPrototypeStore = create<{
  records: Record<string, FactionPrototype>;
  save: (id: string, value: FactionPrototype) => void;
}>((set) => ({
  records: {},
  save: (id, value) => set((state) => ({ records: { ...state.records, [id]: structuredClone(value) } })),
}));

const unsubscribe = campaignStore.subscribe((state, previous) => {
  if (state.generation !== previous.generation) useFactionPrototypeStore.setState({ records: {} });
});
if (import.meta.hot) import.meta.hot.dispose(unsubscribe);
