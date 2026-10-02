import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Stage, Text } from "react-konva";
import type Konva from "konva";
import { ImagePlusIcon, MapPinIcon, MinusIcon, PlusIcon, RotateCcwIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type MapPin = { id: number; x: number; y: number };
type Size = { width: number; height: number };

export function MapPrototypePanel() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [viewport, setViewport] = useState<Size>({ width: 800, height: 600 });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [pins, setPins] = useState<MapPin[]>([]);
  const [selectedPin, setSelectedPin] = useState<number | null>(null);
  const [addingPin, setAddingPin] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [camera, setCamera] = useState({ scale: 1, x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const hasImage = Boolean(image);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasImage]);

  useEffect(() => {
    if (!imageUrl) {
      setImage(null);
      return;
    }
    const nextImage = new window.Image();
    nextImage.onload = () => setImage(nextImage);
    nextImage.onerror = () => setError("This image could not be opened. Try a different image file.");
    nextImage.src = imageUrl;
    return () => {
      nextImage.onload = null;
      nextImage.onerror = null;
    };
  }, [imageUrl]);

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  useEffect(() => {
    const releaseSpace = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePressed(false);
    };
    const releaseOnBlur = () => setSpacePressed(false);
    window.addEventListener("keyup", releaseSpace);
    window.addEventListener("blur", releaseOnBlur);
    return () => {
      window.removeEventListener("keyup", releaseSpace);
      window.removeEventListener("blur", releaseOnBlur);
    };
  }, []);

  const imageRect = useMemo(() => {
    if (!image) return null;
    const fit = Math.min(viewport.width / image.width, viewport.height / image.height);
    const width = image.width * fit;
    const height = image.height * fit;
    return { x: (viewport.width - width) / 2, y: (viewport.height - height) / 2, width, height };
  }, [image, viewport]);

  const selectImage = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file to use as your map.");
      return;
    }
    setError(null);
    setPins([]);
    setSelectedPin(null);
    setCamera({ scale: 1, x: 0, y: 0 });
    setImageUrl(URL.createObjectURL(file));
  };

  const changeZoom = (factor: number, anchor?: { x: number; y: number }) => {
    setCamera((current) => {
      const scale = Math.max(0.4, Math.min(4, current.scale * factor));
      const point = anchor ?? { x: viewport.width / 2, y: viewport.height / 2 };
      const world = { x: (point.x - current.x) / current.scale, y: (point.y - current.y) / current.scale };
      return { scale, x: point.x - world.x * scale, y: point.y - world.y * scale };
    });
  };

  const handleMapClick = () => {
    if (!addingPin || !imageRect) return;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const x = (pointer.x - camera.x) / camera.scale;
    const y = (pointer.y - camera.y) / camera.scale;
    if (x < imageRect.x || x > imageRect.x + imageRect.width || y < imageRect.y || y > imageRect.y + imageRect.height) return;
    const id = Date.now();
    setPins((current) => [...current, { id, x: (x - imageRect.x) / imageRect.width, y: (y - imageRect.y) / imageRect.height }]);
    setSelectedPin(id);
    setAddingPin(false);
  };

  const deleteSelectedPin = () => {
    setPins((current) => current.filter((pin) => pin.id !== selectedPin));
    setSelectedPin(null);
  };

  return (
    <div className="flex size-full min-h-0 flex-col bg-background">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        aria-label="Choose a map image"
        className="sr-only"
        onChange={(event) => {
          selectImage(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />

      {error && <p role="alert" className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {image && imageRect ? (
        <div className="flex min-h-0 flex-1">
          <div
            ref={viewportRef}
            tabIndex={0}
            aria-label="Map canvas. Hold Space and drag to pan. Use a trackpad to pan and pinch to zoom."
            className={cn(
              "relative min-h-0 min-w-0 flex-1 overflow-hidden bg-muted/40 focus-visible:outline-none",
              addingPin && "cursor-crosshair",
              spacePressed && !addingPin && "cursor-grab active:cursor-grabbing",
            )}
            onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest(".konvajs-content")) {
                event.currentTarget.focus({ preventScroll: true });
              }
            }}
            onKeyDown={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest("button, input, textarea, select, [contenteditable='true']")) return;
              if (event.code === "Space" && !addingPin) {
                event.preventDefault();
                setSpacePressed(true);
              } else if (event.shiftKey && event.code === "Digit1") {
                event.preventDefault();
                setCamera({ scale: 1, x: 0, y: 0 });
              } else if ((event.metaKey || event.ctrlKey) && (event.key === "+" || event.key === "=")) {
                event.preventDefault();
                changeZoom(1.2);
              } else if ((event.metaKey || event.ctrlKey) && event.key === "-") {
                event.preventDefault();
                changeZoom(1 / 1.2);
              }
            }}
            onWheel={(event) => {
              event.preventDefault();
              if (event.ctrlKey || event.metaKey) {
                const bounds = event.currentTarget.getBoundingClientRect();
                const pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
                const deltaY = event.deltaMode === WheelEvent.DOM_DELTA_LINE
                  ? event.deltaY * 16
                  : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
                    ? event.deltaY * viewport.height
                    : event.deltaY;
                changeZoom(Math.exp(-deltaY * 0.003), pointer);
                return;
              }
              setCamera((current) => ({
                ...current,
                x: current.x - event.deltaX,
                y: current.y - event.deltaY,
              }));
            }}
          >
            <Stage
              ref={stageRef}
              width={viewport.width}
              height={viewport.height}
              x={camera.x}
              y={camera.y}
              scaleX={camera.scale}
              scaleY={camera.scale}
              draggable={spacePressed && !addingPin}
              onDragEnd={(event) => {
                if (event.target !== stageRef.current) return;
                setCamera((current) => ({ ...current, x: event.target.x(), y: event.target.y() }));
              }}
              onClick={handleMapClick}
              onTap={handleMapClick}
              onMouseDown={(event) => {
                if (addingPin && event.evt.button === 2) event.evt.preventDefault();
              }}
            >
              <Layer>
                <KonvaImage image={image} x={imageRect.x} y={imageRect.y} width={imageRect.width} height={imageRect.height} name="map-image" />
                {pins.map((pin, index) => {
                  const x = imageRect.x + pin.x * imageRect.width;
                  const y = imageRect.y + pin.y * imageRect.height;
                  const selected = pin.id === selectedPin;
                  return (
                    <Group
                      key={pin.id}
                      x={x}
                      y={y}
                      draggable={!spacePressed}
                      onClick={(event) => { event.cancelBubble = true; setSelectedPin(pin.id); }}
                      onTap={(event) => { event.cancelBubble = true; setSelectedPin(pin.id); }}
                      onDragEnd={(event) => {
                        event.cancelBubble = true;
                        const nextX = Math.max(0, Math.min(1, (event.target.x() - imageRect.x) / imageRect.width));
                        const nextY = Math.max(0, Math.min(1, (event.target.y() - imageRect.y) / imageRect.height));
                        setPins((current) => current.map((item) => item.id === pin.id ? { ...item, x: nextX, y: nextY } : item));
                      }}
                    >
                      <Circle
                        radius={selected ? 15 : 13}
                        fill={selected ? "#b45309" : "#7c2d12"}
                        stroke="#fff7ed"
                        strokeWidth={3}
                        shadowColor="#000"
                        shadowBlur={8}
                        shadowOpacity={0.35}
                      />
                      <Text
                        x={-6}
                        y={-6}
                        width={12}
                        height={12}
                        text={String(index + 1)}
                        fontSize={11}
                        fontStyle="bold"
                        fill="white"
                        align="center"
                        listening={false}
                      />
                    </Group>
                  );
                })}
              </Layer>
            </Stage>
            <div role="toolbar" aria-label="Map tools" className="absolute bottom-4 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1 rounded-xl border bg-background/95 p-1.5 shadow-xl backdrop-blur-md">
              <Tooltip>
                <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Replace map image" onClick={() => fileRef.current?.click()} />}>
                  <UploadIcon />
                </TooltipTrigger>
                <TooltipContent>Replace map image</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={
                  <Button
                    variant={addingPin ? "secondary" : "ghost"}
                    size="icon"
                    aria-label={addingPin ? "Cancel adding pin" : "Add pin"}
                    aria-pressed={addingPin}
                    onClick={() => setAddingPin((active) => !active)}
                  />
                }>
                  <MapPinIcon />
                </TooltipTrigger>
                <TooltipContent>{addingPin ? "Cancel adding pin" : "Add pin"}</TooltipContent>
              </Tooltip>
              <Separator orientation="vertical" className="mx-1 h-6" />
              <Tooltip>
                <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => changeZoom(1 / 1.2)} />}>
                  <MinusIcon />
                </TooltipTrigger>
                <TooltipContent>Zoom out</TooltipContent>
              </Tooltip>
              <span aria-live="polite" className="min-w-12 text-center text-xs font-medium tabular-nums text-muted-foreground">{Math.round(camera.scale * 100)}%</span>
              <Tooltip>
                <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => changeZoom(1.2)} />}>
                  <PlusIcon />
                </TooltipTrigger>
                <TooltipContent>Zoom in</TooltipContent>
              </Tooltip>
              <Separator orientation="vertical" className="mx-1 h-6" />
              <Tooltip>
                <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Reset map view" onClick={() => setCamera({ scale: 1, x: 0, y: 0 })} />}>
                  <RotateCcwIcon />
                </TooltipTrigger>
                <TooltipContent>Reset map view</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <aside className="hidden w-56 shrink-0 flex-col gap-3 border-l p-4 sm:flex">
            <div>
              <h2 className="text-sm font-medium">Pins</h2>
              <p className="text-xs text-muted-foreground">{pins.length === 1 ? "1 pin on this map" : `${pins.length} pins on this map`}</p>
            </div>
            {selectedPin ? (
              <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
                <p className="text-sm font-medium">Pin {pins.findIndex((pin) => pin.id === selectedPin) + 1}</p>
                <p className="text-xs text-muted-foreground">Pins will link to location notes in a later step.</p>
                <Button variant="outline" size="sm" onClick={deleteSelectedPin}>Remove pin</Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Select a pin to view it. Add a pin to mark a place on the map.</p>
            )}
          </aside>
        </div>
      ) : (
        <div ref={viewportRef} className="flex min-h-0 flex-1 items-center justify-center p-6">
          <Empty className="max-w-lg">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ImagePlusIcon aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>Start with a map image</EmptyTitle>
              <EmptyDescription>Upload a world, region, city, or dungeon image. Then add and move pins directly on the map.</EmptyDescription>
            </EmptyHeader>
            <Button onClick={() => fileRef.current?.click()}>
              <UploadIcon data-icon="inline-start" />Upload map image
            </Button>
          </Empty>
        </div>
      )}
    </div>
  );
}
