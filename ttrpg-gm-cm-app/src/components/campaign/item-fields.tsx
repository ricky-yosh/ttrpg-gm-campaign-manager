import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { AutoSizeTextarea } from "@/components/ui/auto-size-textarea";
import { itemFieldsError, type ItemFieldDefinition, type ItemFieldKind, type ItemValue } from "@/lib/item-data";

export function ItemPropertyInput({ field, value, onChange }: {
  field: ItemFieldDefinition; value: ItemValue; onChange: (value: ItemValue) => void;
}) {
  const id = useId();
  return <Field>
    <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
    {field.kind === "checkbox" ? <Checkbox id={id} checked={value === true} onCheckedChange={(checked) => onChange(checked === true)} />
      : field.kind === "choice" ? <NativeSelect id={id} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.currentTarget.value || null)}>
        <NativeSelectOption value="">Not set</NativeSelectOption>
        {field.options.map((option) => <NativeSelectOption key={option.id} value={option.id}>{option.label}</NativeSelectOption>)}
      </NativeSelect>
      : <Input id={id} type={field.kind === "number" ? "number" : "text"} step={field.kind === "number" ? "any" : undefined}
        value={typeof value === "string" || typeof value === "number" ? value : ""}
        onChange={(event) => onChange(field.kind === "number" ? event.currentTarget.value === "" ? null : Number(event.currentTarget.value) : event.currentTarget.value)} />}
  </Field>;
}

export function AddItemFieldDialog({ fields, attachedIds, onAdd, onClose }: {
  fields: ItemFieldDefinition[];
  attachedIds: string[];
  onAdd: (field: ItemFieldDefinition, isNew: boolean) => void;
  onClose: () => void;
}) {
  const id = useId();
  const available = fields.filter((field) => !attachedIds.includes(field.id));
  const [selected, setSelected] = useState(available[0]?.id ?? "new");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<ItemFieldKind>("text");
  const [choices, setChoices] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const field: ItemFieldDefinition | undefined = selected === "new"
      ? { id: crypto.randomUUID(), label: label.trim(), kind, options: kind === "choice"
        ? choices.split("\n").map((value) => value.trim()).filter(Boolean).map((value) => ({ id: crypto.randomUUID(), label: value })) : [] }
      : available.find((field) => field.id === selected);
    if (!field) return;
    const problem = itemFieldsError([field]);
    if (problem) { setError(problem); return; }
    onAdd(field, selected === "new");
    onClose();
  };
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogPopup>
    <DialogTitle>Add item field</DialogTitle>
    <DialogDescription>Reuse a campaign field or create an optional field. New fields are saved with this item.</DialogDescription>
    <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="flex flex-col gap-4">
      <FieldGroup>
        <Field><FieldLabel htmlFor={`${id}-field`}>Field</FieldLabel><NativeSelect id={`${id}-field`} value={selected} onChange={(event) => { setSelected(event.currentTarget.value); setError(null); }}>
          {available.map((field) => <NativeSelectOption key={field.id} value={field.id}>{field.label} ({field.kind})</NativeSelectOption>)}
          <NativeSelectOption value="new">Create a new field…</NativeSelectOption>
        </NativeSelect></Field>
        {selected === "new" && <>
          <Field><FieldLabel htmlFor={`${id}-label`}>Field name</FieldLabel><Input id={`${id}-label`} value={label} required onChange={(event) => setLabel(event.currentTarget.value)} placeholder="For example, Material or Tier" /></Field>
          <Field><FieldLabel htmlFor={`${id}-kind`}>Field type</FieldLabel><NativeSelect id={`${id}-kind`} value={kind} onChange={(event) => setKind(event.currentTarget.value as ItemFieldKind)}>
            <NativeSelectOption value="text">Text</NativeSelectOption><NativeSelectOption value="number">Number</NativeSelectOption>
            <NativeSelectOption value="checkbox">Checkbox</NativeSelectOption><NativeSelectOption value="choice">Single choice</NativeSelectOption>
          </NativeSelect></Field>
          {kind === "choice" && <Field><FieldLabel htmlFor={`${id}-choices`}>Choices, in sorting order</FieldLabel><AutoSizeTextarea id={`${id}-choices`} value={choices} required onChange={(event) => setChoices(event.currentTarget.value)} placeholder={"E\nD\nC\nB\nA\nS"} /><FieldDescription>One choice per line. This order controls table sorting.</FieldDescription></Field>}
        </>}
        {error && <FieldError role="alert">{error}</FieldError>}
      </FieldGroup>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Add field</Button></div>
    </form>
  </DialogPopup></Dialog>;
}
