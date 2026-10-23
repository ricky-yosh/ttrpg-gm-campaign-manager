import { useEffect, useId, useRef, useState } from "react";
import type { Value } from "platejs";
import { NpcNotesEditor, useNpcNotesEditor } from "@/components/campaign/npc-notes-editor";

export function NotesField({ id, title, value, editable, onChange, publicSummary = false, description }: {
  id: string; title: string; value: Value; editable: boolean; onChange: (value: Value) => void; publicSummary?: boolean; description?: string;
}) {
  const editorId = useId();
  const serialized = JSON.stringify(value);
  const observed = useRef(serialized);
  const emitted = useRef(serialized);
  const [externalVersion, setExternalVersion] = useState(0);
  useEffect(() => {
    if (observed.current === serialized) return;
    observed.current = serialized;
    // Another pane can edit the same shared draft. Recreate its editor only for external changes.
    if (editable && emitted.current !== serialized) setExternalVersion((version) => version + 1);
  }, [editable, serialized]);
  const handleChange = (nextValue: Value) => {
    emitted.current = JSON.stringify(nextValue);
    onChange(nextValue);
  };
  // Read views refresh committed content; mode changes start fresh editor history.
  return <NotesDocument key={editable ? `${id}:edit:${externalVersion}` : `${id}:read:${serialized}`} id={editorId} title={title} value={value} editable={editable} onChange={handleChange} publicSummary={publicSummary} description={description} />;
}

function NotesDocument({ id, title, value, editable, onChange, publicSummary, description }: {
  id: string; title: string; value: Value; editable: boolean; onChange: (value: Value) => void; publicSummary: boolean; description?: string;
}) {
  const editor = useNpcNotesEditor(id, value);
  return <NpcNotesEditor editor={editor} npcName={title} title={title} editable={editable}
    onChange={(nextValue) => { if (editable && JSON.stringify(nextValue) !== JSON.stringify(value)) onChange(nextValue); }}
    description={description ?? (publicSummary ? "Player-facing recap · separate from private notes" : "Private session notes")}
    ariaLabel={title} placeholder={publicSummary ? "Write a recap for the players…" : `Add ${title.toLowerCase()}…`} />;
}

