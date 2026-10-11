import { useContext, useEffect, useRef, useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { Circle, Group, Image as KonvaImage, Layer, Stage, Text, RegularPolygon } from "react-konva";
import type Konva from "konva";
import { ChevronLeftIcon, ChevronRightIcon, MapPinIcon, MinusIcon, PlusIcon, RotateCcwIcon, UsersIcon, SettingsIcon, MousePointer2Icon, MoveIcon, UndoIcon, RedoIcon } from "lucide-react";
import { useStore } from "zustand";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { SidebarResizeHandle } from "@/components/ui/sidebar-resize-handle";
import { MapEditor } from "./map-editor";
import { MapPinEditor, type PinDetails } from "./map-pin-editor";
import { MapLocationPreview } from "./map-location-preview";
import { NpcHistoryContext } from "./npc-history-context";
import { useCampaign, getCampaign, createLocation } from "@/lib/campaign-data";
import { appCommands } from "@/lib/app-commands";
import { defaultMapCamera, readMapCamera, mapTransform, sameMap, type MapCamera, type MapPin, type MapPoint } from "@/lib/map-data";
import { commitMapEdit, applyMapHistory, mapHistory, mapHistoryStore } from "@/lib/map-history";
import { cn } from "@/lib/utils";

type Tool = "select" | "move" | "party";
export function MapPanel({ params, api }: IDockviewPanelProps) {
  const maps = useCampaign((state) => state.campaign.maps);
  const locations = useCampaign((state) => state.campaign.locations);
  const map = maps?.find((item) => item.id === params.mapId);
  const root = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const inspectorRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ x: 800, y: 600 });
  const [rootWidth, setRootWidth] = useState(1000);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  // Dockview params are the camera source of truth; mirroring them through React state made trackpad pan updates echo between effects until React hit its update-depth limit.
  const camera = readMapCamera(params.camera);
  const cameraRef = useRef<MapCamera>(camera);
  cameraRef.current = camera;
  const [previewId, setPreviewId] = useState<string | null>(params.previewLocationId ?? null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(params.selectedPinId ?? null);
  const [collapsed, setCollapsed] = useState(Boolean(params.collapsed));
  const [sidebarWidth, setSidebarWidth] = useState<number>(params.inspectorWidth ?? 360);
  const [spacePressed, setSpacePressed] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [pinEditor, setPinEditor] = useState<MapPin | "new" | null>(null);
  const [pendingPin, setPendingPin] = useState<PinDetails | null>(null);
  const [editingMap, setEditingMap] = useState(false);
  const [error, setError] = useState("");
  const [pinToRemove, setPinToRemove] = useState<string | null>(null);
  const historyContext = useContext(NpcHistoryContext);
  useStore(mapHistoryStore);
  const history = mapHistory(map?.id ?? "");
  const undoEdit = history.past[history.past.length - 1];
  const redoEdit = history.future[history.future.length - 1];
  const canUndo = !!undoEdit && sameMap(undoEdit.after, map);
  const canRedo = !!redoEdit && sameMap(redoEdit.before, map);
  const remember = (change: Record<string, unknown>) => {
    api.updateParameters(change);
    window.dispatchEvent(new Event("campaign-workspace-change"));
  };
  useEffect(() => { if (inspectorRef.current) inspectorRef.current.scrollTop = 0; }, [previewId]);
  useEffect(() => {
    const handler = { canUndo, canRedo, undoLabel: undoEdit?.label ?? null, redoLabel: redoEdit?.label ?? null,
      apply: (direction: "undo" | "redo") => map ? applyMapHistory(map.id, direction) : false };
    historyContext?.set(api, handler);
    window.dispatchEvent(new Event("npc-history-change"));
    return () => { historyContext?.delete(api); window.dispatchEvent(new Event("npc-history-change")); };
  }, [api, historyContext, map, canUndo, canRedo, undoEdit, redoEdit]);
  useEffect(() => {
    if (params.previewLocationId !== undefined) setPreviewId(params.previewLocationId);
    if (params.selectedPinId !== undefined) setSelectedPinId(params.selectedPinId);
    if (params.collapsed !== undefined) setCollapsed(params.collapsed);
  }, [params.camera, params.previewLocationId, params.selectedPinId, params.collapsed]);
  useEffect(() => {
    if (typeof params.placeLocationId !== "string") return;
    setPendingPin({ locationId: params.placeLocationId, newName: "", parentId: null, label: "", destinationMapId: null });
    setCollapsed(true);
  }, [params.placeRequest, params.placeLocationId]);
  useEffect(() => {
    remember({ previewLocationId: previewId, selectedPinId, collapsed, inspectorWidth: sidebarWidth });
  }, [previewId, selectedPinId, collapsed, sidebarWidth]);
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (viewportRef.current) {
        const nextViewport = { x: Math.max(1, viewportRef.current.clientWidth), y: Math.max(1, viewportRef.current.clientHeight) };
        setViewport((current) => current.x === nextViewport.x && current.y === nextViewport.y ? current : nextViewport);
      }
      if (root.current) setRootWidth(root.current.clientWidth);
    });
    if (viewportRef.current) observer.observe(viewportRef.current);
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, [!!map]);
  useEffect(() => {
    setImage(null); setError("");
    if (!map) return;
    const next = new Image();
    next.onload = () => setImage(next);
    next.onerror = () => setError("The map image could not be opened. Replace its artwork in map details.");
    next.src = map.image.url;
    return () => { next.onload = null; next.onerror = null; };
  }, [map?.image.url]);
  useEffect(() => {
    const release = (event: KeyboardEvent) => { if (event.code === "Space") setSpacePressed(false); };
    const blur = () => setSpacePressed(false);
    window.addEventListener("keyup", release); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keyup", release); window.removeEventListener("blur", blur); };
  }, []);
  if (!map) return <Empty><EmptyHeader><EmptyTitle>Map unavailable</EmptyTitle><EmptyDescription>This map may have been removed.</EmptyDescription></EmptyHeader><Button onClick={() => appCommands.selectSection("Maps")}>Browse maps</Button></Empty>;
  const transform = mapTransform(map.width, map.height, viewport, camera);
  const narrow = rootWidth < 700;
  const displayedPin = map.pins.find((pin) => pin.locationId === previewId);
  const selectedPin = map.pins.find((pin) => pin.id === selectedPinId);
  const commit = (patch: Partial<typeof map>, label: string) => {
    const latest = getCampaign().campaign.maps?.find((item) => item.id === map.id);
    if (latest && sameMap(latest, { ...latest, ...patch })) return;
    if (!latest || !commitMapEdit({ ...latest, ...patch }, label)) setError("This map changed or the placement is invalid. Try again.");
    else setError("");
  };
  const preview = (locationId: string, pinId?: string) => {
    setPreviewId(locationId);
    const selected = pinId ?? map.pins.find((pin) => pin.locationId === locationId)?.id ?? null;
    setSelectedPinId(selected);
    setCollapsed(false);
    remember({ previewLocationId: locationId, selectedPinId: selected, collapsed: false });
  };
  const updateCamera = (next: MapCamera | ((current: MapCamera) => MapCamera)) => {
    const resolved = typeof next === "function" ? next(cameraRef.current) : next;
    cameraRef.current = resolved;
    remember({ camera: resolved });
  };
  const center = (pinId: string) => {
    const pin = map.pins.find((item) => item.id === pinId);
    if (pin) updateCamera({ x: pin.x, y: pin.y, zoom: Math.max(2, cameraRef.current.zoom) });
  };
  const changeZoom = (factor: number, point = { x: viewport.x / 2, y: viewport.y / 2 }) => {
    updateCamera((current) => {
      const old = mapTransform(map.width, map.height, viewport, current);
      const zoom = Math.max(0.2, Math.min(12, current.zoom * factor));
      const scale = old.scale * zoom / current.zoom;
      const world = { x: (point.x - old.x) / old.scale, y: (point.y - old.y) / old.scale };
      return { zoom, x: (world.x - (point.x - viewport.x / 2) / scale) / map.width, y: (world.y - (point.y - viewport.y / 2) / scale) / map.height };
    });
  };
  const mapPoint = (point: MapPoint) => ({ x: Math.max(0, Math.min(1, point.x / map.width)), y: Math.max(0, Math.min(1, point.y / map.height)) });
  const makePin = (details: PinDetails, existing?: MapPin, point?: MapPoint) => {
    const campaign = getCampaign().campaign;
    if (!campaign.maps?.some((item) => item.id === map.id) || (details.locationId && !campaign.locations.some((item) => item.id === details.locationId))) { setError("The map or location is no longer available."); return; }
    if (details.destinationMapId && !campaign.maps?.some((item) => item.id === details.destinationMapId)) { setError("The linked map is no longer available. Choose another destination."); return; }
    const locationId = details.locationId || createLocation(details.newName, details.parentId);
    if (!locationId) { setError("This location could not be created. Choose an available parent."); return; }
    const pin: MapPin = { id: existing?.id ?? crypto.randomUUID(), ...point ?? existing ?? { x: 0.5, y: 0.5 },
      locationId, label: details.label, destinationMapId: details.destinationMapId };
    const pins = existing ? map.pins.map((item) => item.id === pin.id ? pin : item) : [...map.pins, pin];
    commit({ pins }, existing ? "Edit map pin" : "Add map pin");
    preview(locationId, pin.id); setPendingPin(null); setPinEditor(null);
    remember({ placeLocationId: null, placeRequest: null });
  };
  const cancelPlacement = () => { setPendingPin(null); setTool("select"); remember({ placeLocationId: null, placeRequest: null }); };
  return <div ref={root} className="relative flex size-full min-h-0 flex-col bg-background">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
      <div className="flex min-w-0 items-center gap-2"><Button variant="ghost" size="sm" onClick={() => appCommands.goBack()}>← Back</Button><h1 className="truncate font-serif font-semibold" title={map.name}>{map.name}</h1><span className="text-xs text-muted-foreground">{map.kind}</span></div>
      <div className="flex gap-1"><Button variant="ghost" size="icon" aria-label="Edit map details" title="Edit map details" onClick={() => setEditingMap(true)}><SettingsIcon /></Button><Button variant="ghost" size="icon" aria-label="Undo map edit" title="Undo map edit" disabled={!canUndo} onClick={() => applyMapHistory(map.id, "undo")}><UndoIcon /></Button><Button variant="ghost" size="icon" aria-label="Redo map edit" title="Redo map edit" disabled={!canRedo} onClick={() => applyMapHistory(map.id, "redo")}><RedoIcon /></Button></div>
    </header>
    {error && <p role="alert" className="border-b px-3 py-2 text-sm text-destructive">{error}</p>}
    {pendingPin && <div role="status" className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm"><span>Click the map to place {pendingPin.newName || locations.find((place) => place.id === pendingPin.locationId)?.name || "this location"}.</span><Button variant="ghost" size="sm" onClick={cancelPlacement}>Cancel</Button></div>}
    <div className="relative flex min-h-0 flex-1">
      <div ref={viewportRef} tabIndex={0} aria-label="Map canvas. Space and drag to pan; pinch to zoom. Escape cancels placement." className={cn("relative min-h-0 min-w-0 flex-1 overflow-hidden bg-muted/40 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", (pendingPin || tool === "party") && "cursor-crosshair", spacePressed && "cursor-grab")}
        onPointerDown={() => viewportRef.current?.focus({ preventScroll: true })}
        onKeyDown={(event) => {
          if ((event.target as HTMLElement).closest("button,input,select,textarea")) return;
          if (event.key === "Escape") cancelPlacement();
          else if (event.code === "Space") { event.preventDefault(); setSpacePressed(true); }
          else if (event.shiftKey && event.code === "Digit1") { event.preventDefault(); updateCamera(defaultMapCamera); }
          else if ((event.metaKey || event.ctrlKey) && ["+", "=", "-"].includes(event.key)) { event.preventDefault(); changeZoom(event.key === "-" ? 1 / 1.2 : 1.2); }
        }}
        onWheel={(event) => {
          event.preventDefault();
          const mode = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.y : 1;
          if (event.ctrlKey || event.metaKey) {
            const bounds = event.currentTarget.getBoundingClientRect();
            changeZoom(Math.exp(-event.deltaY * mode * 0.003), { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
          } else updateCamera((current) => {
            const currentTransform = mapTransform(map.width, map.height, viewport, current);
            return { ...current, x: current.x + event.deltaX * mode / (map.width * currentTransform.scale), y: current.y + event.deltaY * mode / (map.height * currentTransform.scale) };
          });
        }}>
        {image && <Stage ref={stageRef} width={viewport.x} height={viewport.y} x={transform.x} y={transform.y} scaleX={transform.scale} scaleY={transform.scale} draggable={spacePressed && !pendingPin}
          onDragEnd={(event) => {
            if (event.target !== stageRef.current) return;
            updateCamera((current) => ({ ...current, x: (viewport.x / 2 - event.target.x()) / (map.width * transform.scale), y: (viewport.y / 2 - event.target.y()) / (map.height * transform.scale) }));
          }}
          onClick={(event) => {
            if (event.evt.button !== 0 || (!pendingPin && tool !== "party")) return;
            const pointer = stageRef.current?.getPointerPosition();
            if (!pointer) return;
            const point = { x: (pointer.x - transform.x) / transform.scale, y: (pointer.y - transform.y) / transform.scale };
            if (point.x < 0 || point.y < 0 || point.x > map.width || point.y > map.height) return;
            if (pendingPin) makePin(pendingPin, undefined, mapPoint(point));
            else { commit({ party: mapPoint(point) }, "Move party marker"); setTool("select"); }
          }}>
          <Layer><KonvaImage image={image} width={map.width} height={map.height} />
            {map.pins.map((pin, index) => {
              const selected = pin.id === displayedPin?.id;
              return <Group key={pin.id} x={pin.x * map.width} y={pin.y * map.height} draggable={tool === "move" && !spacePressed && !pendingPin}
                onClick={(event) => { event.cancelBubble = true; preview(pin.locationId, pin.id); }}
                onDragEnd={(event) => { event.cancelBubble = true; const point = mapPoint(event.target.position()); event.target.position({ x: point.x * map.width, y: point.y * map.height }); commit({ pins: map.pins.map((item) => item.id === pin.id ? { ...item, ...point } : item) }, "Move map pin"); preview(pin.locationId, pin.id); }}>
                <Circle radius={(selected ? 19 : 15) / transform.scale} fill="#7c2d12" stroke="white" strokeWidth={(selected ? 4 : 2) / transform.scale} />
                {selected && <Circle radius={24 / transform.scale} stroke="white" strokeWidth={2 / transform.scale} listening={false} />}
                <Text x={-12 / transform.scale} y={-6 / transform.scale} width={24 / transform.scale} text={String(index + 1)} fontSize={12 / transform.scale} fontStyle="bold" fill="white" align="center" listening={false} />
              </Group>;
            })}
            {map.party && <Group x={map.party.x * map.width} y={map.party.y * map.height} draggable={tool === "move" && !spacePressed && !pendingPin}
              onClick={(event) => { event.cancelBubble = true; }} onDragEnd={(event) => { event.cancelBubble = true; commit({ party: mapPoint(event.target.position()) }, "Move party marker"); }}>
              <RegularPolygon sides={3} radius={21 / transform.scale} fill="#334155" stroke="white" strokeWidth={3 / transform.scale} />
              <Text x={-25 / transform.scale} y={22 / transform.scale} width={50 / transform.scale} text="Party" fontSize={12 / transform.scale} fill="white" stroke="#334155" strokeWidth={0.5 / transform.scale} align="center" listening={false} />
            </Group>}
          </Layer>
        </Stage>}
        {!image && !error && <p role="status" className="p-4 text-sm text-muted-foreground">Loading map…</p>}
        <div role="toolbar" aria-label="Map tools" className="absolute left-3 right-3 top-3 flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1 rounded-xl border bg-background/95 p-1.5 shadow-lg">
          <ToggleGroup value={[tool]} onValueChange={(values) => {
            const value = values[0];
            if (value !== "select" && value !== "move" && value !== "party") return;
            setPendingPin(null); setTool(value); remember({ placeLocationId: null, placeRequest: null });
          }} aria-label="Map interaction mode">
            <ToggleGroupItem value="select" aria-label="Select pins" title="Select pins"><MousePointer2Icon /></ToggleGroupItem>
            <ToggleGroupItem value="move" aria-label="Move pins and party" title="Move pins and party"><MoveIcon /></ToggleGroupItem>
            <ToggleGroupItem value="party" aria-label="Place party marker" title="Place party marker"><UsersIcon /></ToggleGroupItem>
          </ToggleGroup>
          <Button variant="ghost" size="icon" title="Add location pin" aria-label="Add location pin" onClick={() => setPinEditor("new")}><MapPinIcon /></Button>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => changeZoom(1 / 1.2)}><MinusIcon /></Button><span className="min-w-10 text-center text-xs tabular-nums">{Math.round(camera.zoom * 100)}%</span><Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => changeZoom(1.2)}><PlusIcon /></Button>
          <Button variant="ghost" size="icon" aria-label="Fit map" title="Fit map (Shift+1)" onClick={() => updateCamera(defaultMapCamera)}><RotateCcwIcon /></Button>
        </div>
        <p className="pointer-events-none absolute bottom-2 left-3 rounded bg-background/90 px-2 py-1 text-xs text-muted-foreground">Space + drag to pan · Pinch to zoom{tool === "move" && " · Drag a pin or the party"}</p>
      </div>
      <aside aria-label="Location preview" className={cn("relative flex shrink-0 flex-col border-l bg-background", narrow && !collapsed && "absolute inset-y-0 right-0 shadow-xl")} style={{ width: collapsed ? 44 : Math.min(sidebarWidth, Math.max(1, rootWidth - 48)) }}>
        <div className="flex shrink-0 items-center gap-2 border-b p-2"><Button variant="ghost" size="icon" aria-label={collapsed ? "Expand location preview" : "Collapse location preview"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronLeftIcon /> : <ChevronRightIcon />}</Button>{!collapsed && <span className="text-sm font-medium">{previewId ? "Location preview" : "Locations on this map"}</span>}</div>
        {!collapsed && <div ref={inspectorRef} className="min-h-0 flex-1 overflow-y-auto">
          {previewId ? <><MapLocationPreview map={map} locationId={previewId} onPreview={(id) => preview(id)} onCenter={center} onOpenLocation={(id) => { setCollapsed(true); remember({ collapsed: true }); appCommands.openLocationBesideMap(id); }} />
            <Separator />
            <div className="flex flex-wrap gap-2 p-4"><Button size="sm" variant="outline" onClick={() => { setPreviewId(null); remember({ previewLocationId: null }); }}>All pins</Button>{selectedPin && selectedPin.locationId === previewId && <><Button size="sm" variant="outline" onClick={() => setPinEditor(selectedPin)}>Edit pin</Button><Button size="sm" variant="ghost" onClick={() => setPinToRemove(selectedPin.id)}>Remove pin…</Button></>}</div>
          </> : <div className="flex flex-col gap-2 p-3">{map.pins.length ? map.pins.map((pin, index) => <Button key={pin.id} variant="ghost" className="h-auto justify-start" onClick={() => preview(pin.locationId, pin.id)}><MapPinIcon data-icon="inline-start" /><span className="truncate">{index + 1}. {pin.label || locations.find((place) => place.id === pin.locationId)?.name || "Unavailable location"}</span></Button>) : <Empty size="compact"><EmptyHeader><EmptyTitle>No locations pinned</EmptyTitle><EmptyDescription>Add a pin to link a place to this map.</EmptyDescription></EmptyHeader></Empty>}
            <Button variant="outline" size="sm" onClick={() => setPinEditor("new")}>Add location pin</Button>
            {map.party && <Button variant="ghost" size="sm" onClick={() => commit({ party: null }, "Remove party marker")}>Remove party marker</Button>}
          </div>}
        </div>}
        {!narrow && <SidebarResizeHandle label="Resize location preview" width={sidebarWidth} collapsed={collapsed} side="left" collapsedWidth={44} minWidth={280} maxWidth={520} collapseThreshold={180} onWidthChange={setSidebarWidth} onCollapsedChange={setCollapsed} />}
      </aside>
    </div>
    {editingMap && <MapEditor map={map} onClose={() => setEditingMap(false)} onSaved={() => {}} />}
    {pinEditor && <MapPinEditor mapId={map.id} pin={pinEditor === "new" ? undefined : pinEditor} onClose={() => setPinEditor(null)} onChoose={(details) => {
      if (pinEditor === "new") { setPendingPin(details); setPinEditor(null); }
      else makePin(details, pinEditor);
    }} />}
    <Dialog open={pinToRemove !== null} onOpenChange={(open) => { if (!open) setPinToRemove(null); }}><DialogPopup><div className="flex flex-col gap-4 p-5"><DialogTitle>Remove pin?</DialogTitle><DialogDescription>Its location page will remain available.</DialogDescription><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPinToRemove(null)}>Cancel</Button><Button variant="destructive" onClick={() => { commit({ pins: map.pins.filter((pin) => pin.id !== pinToRemove) }, "Remove map pin"); setPinToRemove(null); setSelectedPinId(null); }}>Remove pin</Button></div></div></DialogPopup></Dialog>
  </div>;
}
