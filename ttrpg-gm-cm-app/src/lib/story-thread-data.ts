import type { Value } from "platejs";

export const threadStatuses = { idea: "Idea", active: "Active", onHold: "On hold", resolved: "Resolved" } as const;
export type ThreadLink = { targetId: string; label: string };
export type StoryThread = {
  id: string;
  title: string;
  status: keyof typeof threadStatuses;
  playerReminder: string;
  origin: string;
  sourceLabel: string;
  currentSituation: Value;
  gmPossibilities: Value;
  people: ThreadLink[];
  locations: ThreadLink[];
  factions: ThreadLink[];
};

export const threadNotes = (text = ""): Value => [{ type: "p", children: [{ text }] }];
export function newStoryThread(title: string): StoryThread {
  return { id: crypto.randomUUID(), title: title.trim(), status: "idea", playerReminder: "", origin: "", sourceLabel: "",
    currentSituation: threadNotes(), gmPossibilities: threadNotes(), people: [], locations: [], factions: [] };
}

export function threadError(thread: StoryThread): string | null {
  if (!thread.title.trim()) return "Give this thread a title.";
  if (!Object.prototype.hasOwnProperty.call(threadStatuses, thread.status)) return "Choose a valid thread status.";
  for (const links of [thread.people, thread.locations, thread.factions]) {
    if (links.some((link) => !link.targetId.trim()) || new Set(links.map((link) => link.targetId)).size !== links.length) return "Each record can be linked once per group.";
  }
  return null;
}

export function matchingThreads(threads: StoryThread[], query: string): StoryThread[] {
  const search = query.trim().toLocaleLowerCase();
  return threads.filter((thread) => `${thread.title} ${thread.origin}`.toLocaleLowerCase().includes(search));
}
