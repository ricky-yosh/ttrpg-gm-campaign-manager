import { create } from "zustand";
import type { StoryThread } from "../lib/story-thread-data.ts";

type ThreadDrafts = {
  drafts: Record<string, StoryThread>;
  setDraft: (thread: StoryThread) => void;
  discard: (id: string) => void;
};

export const useThreadDrafts = create<ThreadDrafts>()((set) => ({
  drafts: {},
  setDraft: (thread) => set((state) => ({ drafts: { ...state.drafts, [thread.id]: structuredClone(thread) } })),
  discard: (id) => set((state) => ({ drafts: Object.fromEntries(Object.entries(state.drafts).filter(([key]) => key !== id)) })),
}));
