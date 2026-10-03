import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cn } from "@/lib/utils";

function ToggleGroup<Value extends string>({ className, ...props }: ToggleGroupPrimitive.Props<Value>) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={cn("inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground", className)}
      {...props}
    />
  );
}

function ToggleGroupItem<Value extends string>({ className, ...props }: TogglePrimitive.Props<Value>) {
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn("inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors hover:bg-background/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-sm disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4", className)}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
