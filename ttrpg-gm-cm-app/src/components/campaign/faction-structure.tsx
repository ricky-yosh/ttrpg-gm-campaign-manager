import { FlagIcon, UserIcon, NetworkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { appCommands } from "@/lib/app-commands";
import type { FactionNode } from "@/lib/faction-prototype";
import { FactionEmpty } from "./faction-fields";

export function openFactionNode(node: FactionNode) {
  if (node.kind === "npc") appCommands.openCharacter(node.targetId);
  if (node.kind === "faction") appCommands.openFaction(node.targetId);
}

export function FactionStructure({ name, nodes, onEdit, interactive = true }: {
  name: string; nodes: FactionNode[]; onEdit?: (node: FactionNode) => void; interactive?: boolean;
}) {
  if (!nodes.length) return <FactionEmpty title="No structure yet">Add members and subgroups to see how this faction is organized.</FactionEmpty>;
  function branch(parentId: string, visited: Set<string>): React.ReactNode {
    const children = nodes.filter((node) => node.parentId === parentId && !visited.has(node.id));
    if (!children.length) return null;
    return <ul className="flex flex-wrap items-start justify-center gap-4 border-t border-border pt-4">
      {children.map((node) => {
        const Icon = node.kind === "npc" ? UserIcon : node.kind === "faction" ? FlagIcon : NetworkIcon;
        return <li key={node.id} className="flex min-w-44 flex-1 flex-col gap-4">
          <div className="flex flex-col items-center gap-2 rounded-lg border bg-background p-3 text-center">
            <Badge variant="outline">{node.relation === "reports-to" ? "Reports to" : "Part of"}</Badge>
            {node.kind === "group" || !interactive ? <p className="break-words font-medium">{node.name}</p>
              : <Button variant="link" className="h-auto max-w-full whitespace-normal" onClick={() => openFactionNode(node)}><Icon data-icon="inline-start" />{node.name}</Button>}
            <p className="text-xs text-muted-foreground">{node.role || (node.kind === "npc" ? "Member" : "Subgroup")}</p>
            {onEdit && <Button variant="ghost" size="sm" onClick={() => onEdit(node)}>Edit connection</Button>}
          </div>
          {branch(node.id, new Set([...visited, node.id]))}
        </li>;
      })}
    </ul>;
  }
  return <div className="flex flex-col gap-4" aria-label={`${name} organization chart`}>
    <div className="mx-auto max-w-full rounded-lg border bg-muted/30 px-6 py-3 text-center font-serif font-semibold">{name}</div>
    {branch("root", new Set())}
  </div>;
}
