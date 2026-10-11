import { useId, type ReactNode } from "react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export function FactionSection({ title, description, action, children }: {
  title: string; description?: string; action?: ReactNode; children: ReactNode;
}) {
  return <Card><CardHeader><CardTitle variant="dossier">{title}</CardTitle>
    {description && <CardDescription>{description}</CardDescription>}
    {action && <CardAction>{action}</CardAction>}
  </CardHeader><CardContent><div className="flex min-w-0 flex-col gap-3">{children}</div></CardContent></Card>;
}

export function FactionSelect({ label, value, onChange, children }: {
  label: string; value: string; onChange: (value: string) => void; children: ReactNode;
}) {
  const id = useId();
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><NativeSelect id={id} value={value}
    className="w-full" onChange={(event) => onChange(event.currentTarget.value)}>{children}</NativeSelect></Field>;
}

export function FactionVisibility({ revealed, onChange }: { revealed: boolean; onChange: (value: boolean) => void }) {
  return <FactionSelect label="Player visibility" value={revealed ? "revealed" : "hidden"} onChange={(value) => onChange(value === "revealed")}>
    <NativeSelectOption value="hidden">Hidden from players</NativeSelectOption>
    <NativeSelectOption value="revealed">Revealed to players</NativeSelectOption>
  </FactionSelect>;
}

export function FactionEmpty({ title, children }: { title: string; children: ReactNode }) {
  return <Empty size="compact"><EmptyHeader><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{children}</EmptyDescription></EmptyHeader></Empty>;
}
