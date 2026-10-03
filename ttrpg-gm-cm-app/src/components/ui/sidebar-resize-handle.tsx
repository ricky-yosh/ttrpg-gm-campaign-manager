import { useEffect, useRef, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

/** Adds drag-to-collapse behavior to sidebar edges without hiding their rails. */
export function SidebarResizeHandle({ label, width, collapsed, collapsedWidth, minWidth, maxWidth, collapseThreshold, side = "right", onWidthChange, onCollapsedChange }: {
  label: string;
  width: number;
  collapsed: boolean;
  collapsedWidth: number;
  minWidth: number;
  maxWidth: number;
  collapseThreshold: number;
  side?: "left" | "right";
  onWidthChange: (width: number) => void;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    savedWidth: number;
    savedCollapsed: boolean;
    collapsed: boolean;
    element: HTMLDivElement;
    selection: string;
    cursor: string;
  } | null>(null);

  const finish = (cancel = false) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    document.documentElement.style.userSelect = current.selection;
    document.documentElement.style.cursor = current.cursor;
    if (current.element.hasPointerCapture(current.pointerId)) current.element.releasePointerCapture(current.pointerId);
    if (cancel) {
      onWidthChange(current.savedWidth);
      onCollapsedChange(current.savedCollapsed);
    }
  };

  useEffect(() => {
    const stop = () => finish();
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("blur", stop);
      finish();
    };
  }, []);

  const resize = (desired: number, wasCollapsed: boolean) => {
    // A small gap between collapse and expand thresholds prevents flickering.
    const nextCollapsed = desired < collapseThreshold + (wasCollapsed ? 24 : 0);
    onCollapsedChange(nextCollapsed);
    if (!nextCollapsed) onWidthChange(Math.max(minWidth, Math.min(maxWidth, desired)));
    return nextCollapsed;
  };

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: collapsed ? collapsedWidth : width,
      savedWidth: width,
      savedCollapsed: collapsed,
      collapsed,
      element: event.currentTarget,
      selection: document.documentElement.style.userSelect,
      cursor: document.documentElement.style.cursor,
    };
    document.documentElement.style.userSelect = "none";
    document.documentElement.style.cursor = "col-resize";
  };

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={collapsedWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={collapsed ? collapsedWidth : width}
      aria-valuetext={collapsed ? "Collapsed" : `${Math.round(width)} pixels`}
      tabIndex={0}
      title="Drag to resize; drag inward to collapse. Double-click to toggle."
      className={cn(
        "absolute inset-y-0 z-20 w-2 cursor-col-resize touch-none select-none rounded-sm outline-none hover:bg-sidebar-ring/30 focus-visible:bg-sidebar-ring/50",
        side === "right" ? "-right-1" : "-left-1",
      )}
      onPointerDown={start}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        const delta = (event.clientX - current.startX) * (side === "right" ? 1 : -1);
        current.collapsed = resize(current.startWidth + delta, current.collapsed);
      }}
      onPointerUp={() => finish()}
      onPointerCancel={() => finish(true)}
      onLostPointerCapture={() => finish()}
      onDoubleClick={() => onCollapsedChange(!collapsed)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && drag.current) {
          event.preventDefault();
          finish(true);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const increasesWidth = (event.key === "ArrowRight") === (side === "right");
          if (collapsed) {
            if (increasesWidth) onCollapsedChange(false);
          } else if (!increasesWidth && width <= minWidth) onCollapsedChange(true);
          else resize(width + (increasesWidth ? 16 : -16), false);
        } else if (event.key === "Enter") {
          event.preventDefault();
          onCollapsedChange(!collapsed);
        }
      }}
    />
  );
}
