import { sampleSessions, sampleSessionReferences, type SessionSampleRecords } from "../lib/sample-sessions.ts";
import { create } from "zustand";
import type { Value } from "platejs";

export type SessionRecordLink = {
  kind: "npc" | "location" | "faction" | "thread" | "puzzle";
  targetId: string;
  label: string;
};
export type SessionBeat = { id: string; title: string; notes: Value; status: "planned" | "happened" | "skipped" };
export type SessionNote = {
  id: string;
  title: string;
  number: number;
  date: string;
  previous: boolean;
  whereLeftOff: Value;
  prep: Value;
  happened: Value;
  summary: Value;
  beats: SessionBeat[];
  links: SessionRecordLink[];
};

export const sessionText = (text = ""): Value => [{ type: "p", children: [{ text }] }];

type SessionNotesState = {
  sessions: SessionNote[];
  referenceOptions: typeof sampleSessionReferences;
  drafts: Record<string, SessionNote>;
  captures: Record<string, string>;
  createSession: () => string;
  setDraft: (id: string, draft: SessionNote) => void;
  discardDraft: (id: string) => void;
  saveDraft: (id: string) => void;
  setCapture: (id: string, text: string) => void;
  appendCapture: (id: string) => void;
};

function blankSession(number: number): SessionNote {
  return { id: crypto.randomUUID(), title: "Untitled session", number, date: "", previous: false,
    whereLeftOff: sessionText(), prep: sessionText(), happened: sessionText(), summary: sessionText(), beats: [], links: [] };
}

export const useSessionNotesStore = create<SessionNotesState>()((set, get) => ({
  sessions: [], referenceOptions: { puzzle: [] }, drafts: {}, captures: {},
  createSession: () => {
    const session = blankSession(Math.max(0, ...get().sessions.map((item) => item.number)) + 1);
    set((state) => ({ sessions: [...state.sessions, session], drafts: { ...state.drafts, [session.id]: structuredClone(session) } }));
    return session.id;
  },
  setDraft: (id, draft) => set((state) => state.sessions.some((item) => item.id === id)
    ? { drafts: { ...state.drafts, [id]: structuredClone(draft) } } : state),
  discardDraft: (id) => set((state) => ({ drafts: Object.fromEntries(Object.entries(state.drafts).filter(([key]) => key !== id)) })),
  saveDraft: (id) => {
    const draft = get().drafts[id];
    if (!draft || !draft.title.trim()) return;
    set((state) => ({ sessions: state.sessions.map((item) => item.id === id ? { ...structuredClone(draft), title: draft.title.trim() } : item),
      drafts: Object.fromEntries(Object.entries(state.drafts).filter(([key]) => key !== id)) }));
  },
  setCapture: (id, text) => set((state) => ({ captures: { ...state.captures, [id]: text } })),
  appendCapture: (id) => {
    const text = get().captures[id]?.trim();
    if (!text || !get().sessions.some((item) => item.id === id)) return;
    const append = (session: SessionNote) => ({ ...session, happened: [...session.happened, ...sessionText(text)] });
    // Capture commits independently; mirror it into an open edit draft so saving cannot erase it.
    set((state) => ({ sessions: state.sessions.map((item) => item.id === id ? append(item) : item),
      drafts: state.drafts[id] ? { ...state.drafts, [id]: append(state.drafts[id]) } : state.drafts,
      captures: { ...state.captures, [id]: "" } }));
  },
}));

export function resetSessionNotes(sample = false, records: SessionSampleRecords = { npcs: [], locations: [], factions: [] }) {
  useSessionNotesStore.setState({ sessions: sample ? sampleSessions(records) : [], referenceOptions: sample ? structuredClone(sampleSessionReferences) : { puzzle: [] }, drafts: {}, captures: {} });
}
