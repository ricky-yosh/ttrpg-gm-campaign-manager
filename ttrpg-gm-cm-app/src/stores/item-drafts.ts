import { create } from "zustand";
import type { ItemDraft } from "../lib/item-data.ts";

export const useItemDrafts = create<{
  drafts: Record<string, ItemDraft>;
  setDraft: (draft: ItemDraft) => void;
  discard: (id: string) => void;
}>()((set) => ({
  drafts: {},
  setDraft: (draft) => set((state) => ({ drafts: { ...state.drafts, [draft.item.id]: structuredClone(draft) } })),
  discard: (id) => set((state) => ({ drafts: Object.fromEntries(Object.entries(state.drafts).filter(([key]) => key !== id)) })),
}));
