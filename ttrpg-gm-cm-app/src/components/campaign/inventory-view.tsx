import { BackpackIcon, CoinsIcon, HammerIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import type { PartyInventory } from "@/lib/inventory-data";

export function InventoryView({ inventory }: { inventory: PartyInventory }) {
  return <div className="flex flex-col gap-5">
    <Card><CardHeader><CardTitle variant="dossier"><h2 className="flex items-center gap-2"><CoinsIcon aria-hidden="true" className="size-5" />Party gold</h2></CardTitle></CardHeader>
      <CardContent><p className="font-serif text-3xl tabular-nums">{inventory.gold.toLocaleString()} <span className="text-base text-muted-foreground">gold</span></p></CardContent></Card>
    <div className="grid grid-cols-1 items-start gap-5 @min-[700px]:grid-cols-2">
      {(["item", "material"] as const).map((kind) => {
        const entries = inventory.entries.filter((entry) => entry.kind === kind);
        const Icon = kind === "item" ? BackpackIcon : HammerIcon;
        return <Card key={kind}><CardHeader><CardTitle variant="dossier"><h2 className="flex items-center gap-2"><Icon className="size-5" aria-hidden="true" />{kind === "item" ? "Carried items" : "Materials"}</h2></CardTitle></CardHeader>
          <CardContent>{entries.length ? <ul className="flex flex-col gap-3">{entries.map((entry) => <li key={entry.id} className="flex min-w-0 items-start justify-between gap-4 border-b pb-3 last:border-0 last:pb-0">
            <div className="min-w-0"><p className="break-words font-medium">{entry.name}</p>{entry.note && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{entry.note}</p>}</div>
            <span aria-label={`Quantity ${entry.quantity}`} className="shrink-0 tabular-nums">× {entry.quantity.toLocaleString()}</span>
          </li>)}</ul> : <Empty size="compact"><EmptyHeader><EmptyTitle>{kind === "item" ? "No carried items" : "No materials"}</EmptyTitle><EmptyDescription>Nothing recorded yet.</EmptyDescription></EmptyHeader></Empty>}</CardContent>
        </Card>;
      })}
    </div>
  </div>;
}
