import { useLayoutEffect, useRef } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type AutoSizeTextareaProps = ComponentPropsWithoutRef<"textarea"> & { value: string };

/** Fits controlled text and recalculates wrapping when its container changes width. */
export function AutoSizeTextarea({ value, rows = 2, className, ...props }: AutoSizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const resize = () => {
      // Restore the intrinsic rows height first so deleting text can shrink the field.
      element.style.height = "auto";
      const borderHeight = element.offsetHeight - element.clientHeight;
      element.style.height = `${element.scrollHeight + borderHeight}px`;
    };
    resize();
    let width = element.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const nextWidth = element.getBoundingClientRect().width;
      if (nextWidth === width) return;
      width = nextWidth;
      resize();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [value, rows]);

  return (
    <textarea
      {...props}
      ref={ref}
      value={value}
      rows={rows}
      className={cn(
        "box-border w-full resize-none overflow-hidden rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    />
  );
}
