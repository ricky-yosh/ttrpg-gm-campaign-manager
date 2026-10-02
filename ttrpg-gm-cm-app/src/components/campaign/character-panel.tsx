import { useEffect, useRef, useState } from "react";
import { useEditorRef, useEditorSelector, Plate, PlateContent, PlateElement, usePath, usePlateEditor, useSelected, withHOC } from "platejs/react";
import type { PlateElementProps } from "platejs/react";
import { KEYS, type TMediaElement } from "platejs";
import type { IDockviewPanelProps } from "dockview-react";
import { BasicBlocksPlugin, BasicMarksPlugin, BlockquotePlugin } from "@platejs/basic-nodes/react";
import { CaptionPlugin, CaptionTextarea } from "@platejs/caption/react";
import { ListPlugin } from "@platejs/list-classic/react";
import { ImagePlugin } from "@platejs/media/react";
import { Resizable, ResizableProvider, ResizeHandle, useResizableValue } from "@platejs/resizable";
import { BoldIcon, Heading1Icon, Heading2Icon, Heading3Icon, ImageIcon, ItalicIcon, ListIcon, ListOrderedIcon, PilcrowIcon, QuoteIcon, UnderlineIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "cn";
import { getCharacterNotes, saveCharacterNotes, useCampaign } from "@/lib/campaign-data";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_DISPLAY_HEIGHT = 448;
const MAX_INITIAL_IMAGE_WIDTH_RATIO = 0.85;

const ImageElement = withHOC(
  ResizableProvider,
  function ImageElement(props: PlateElementProps<TMediaElement & { alt?: string; width?: number }>) {
    const { element } = props;
    const editor = useEditorRef();
    const path = usePath();
    const selected = useSelected();
    const figureRef = useRef<HTMLElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const resizeCleanupRef = useRef<(() => void) | null>(null);
    const width = useResizableValue("width");

    const beginImageResize = (event: React.MouseEvent) => {
      event.preventDefault();
      resizeCleanupRef.current?.();
      document.documentElement.dataset.imageResizing = "true";

      const endImageResize = () => {
        delete document.documentElement.dataset.imageResizing;
        window.removeEventListener("mouseup", endImageResize);
        window.removeEventListener("blur", endImageResize);
        document.removeEventListener("visibilitychange", endIfHidden);
        resizeCleanupRef.current = null;
      };
      const endIfHidden = () => {
        if (document.hidden) endImageResize();
      };

      resizeCleanupRef.current = endImageResize;
      window.addEventListener("mouseup", endImageResize, { once: true });
      window.addEventListener("blur", endImageResize, { once: true });
      document.addEventListener("visibilitychange", endIfHidden);
    };

    useEffect(() => () => resizeCleanupRef.current?.(), []);

    useEffect(() => {
      const figure = figureRef.current;
      const image = imageRef.current;
      if (!figure || !image || element.width !== undefined) return;

      let initialized = false;
      const initializeWidth = () => {
        if (initialized || element.width !== undefined || !image.naturalWidth || !image.naturalHeight) return;

        const availableWidth = figure.clientWidth;
        if (!availableWidth) return;

        const heightLimitedWidth = image.naturalWidth * Math.min(1, MAX_IMAGE_DISPLAY_HEIGHT / image.naturalHeight);
        const initialWidth = Math.min(
          heightLimitedWidth,
          availableWidth * MAX_INITIAL_IMAGE_WIDTH_RATIO,
        );
        initialized = true;
        editor.tf.setNodes({ width: initialWidth }, { at: path });
      };

      const resizeObserver = new ResizeObserver(initializeWidth);
      resizeObserver.observe(figure);
      image.addEventListener("load", initializeWidth);
      initializeWidth();

      return () => {
        resizeObserver.disconnect();
        image.removeEventListener("load", initializeWidth);
      };
    }, [editor, element.url, element.width, path]);

    return (
      <PlateElement {...props} className="my-5">
        <figure
          ref={figureRef}
          contentEditable={false}
          data-selected={selected || undefined}
          className={cn("m-0 max-w-full rounded-sm", selected && "ring-2 ring-ring ring-offset-2")}
        >
          <Resizable
            options={{ align: "center", maxWidth: "100%", minWidth: 120 }}
            className="group mx-auto"
          >
            <ResizeHandle
              aria-hidden="true"
              options={{ direction: "left", onMouseDown: beginImageResize }}
              className="absolute left-0 top-1/2 z-10 h-8 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full bg-muted-foreground/60 opacity-80 transition-colors hover:bg-primary hover:opacity-100"
            />
            <img
              ref={imageRef}
              src={element.url}
              alt={element.alt ?? ""}
              draggable={false}
              className="block w-full rounded-md object-contain"
              onClick={() => {
                editor.tf.select(path);
                editor.tf.focus();
              }}
            />
            <ResizeHandle
              aria-hidden="true"
              options={{ direction: "right", onMouseDown: beginImageResize }}
              className="absolute right-0 top-1/2 z-10 h-8 w-2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full bg-muted-foreground/60 opacity-80 transition-colors hover:bg-primary hover:opacity-100"
            />
          </Resizable>
          <figcaption style={{ width }} className="mx-auto px-2 pt-2">
            <CaptionTextarea
              aria-label="Image caption"
              placeholder="Add a caption…"
              className="block min-h-5 w-full resize-none bg-transparent text-center text-xs leading-5 text-muted-foreground outline-none placeholder:text-muted-foreground/70"
            />
          </figcaption>
        </figure>
        {props.children}
      </PlateElement>
    );
  },
);

const characterEditorPlugins = [
  BasicBlocksPlugin,
  BasicMarksPlugin,
  ListPlugin,
  ImagePlugin.withComponent(ImageElement),
  CaptionPlugin.configure({ options: { query: { allow: [KEYS.img] } } }),
];

function FormattingToolbar() {
  const editor = useEditorRef();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState("");
  const boldActive = useEditorSelector((currentEditor) => currentEditor.api.hasMark("bold"), []);
  const italicActive = useEditorSelector((currentEditor) => currentEditor.api.hasMark("italic"), []);
  const underlineActive = useEditorSelector((currentEditor) => currentEditor.api.hasMark("underline"), []);
  const currentBlockType = useEditorSelector(
    (currentEditor) => currentEditor.api.block()?.[0].type ?? "p",
    [],
  );
  const quoteActive = useEditorSelector(
    (currentEditor) => Boolean(
      currentEditor.api.above({
        match: (node) => node.type === currentEditor.getType(KEYS.blockquote),
      }),
    ),
    [],
  );
  const bulletedListActive = useEditorSelector(
    (currentEditor) => Boolean(
      currentEditor.api.above({
        match: (node) => node.type === currentEditor.getType(KEYS.ulClassic),
      }),
    ),
    [],
  );
  const numberedListActive = useEditorSelector(
    (currentEditor) => Boolean(
      currentEditor.api.above({
        match: (node) => node.type === currentEditor.getType(KEYS.olClassic),
      }),
    ),
    [],
  );

  const preventSelectionLoss = (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault();

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files;
    const file = files?.[0];
    if (!file || !files) return;

    if (!file.type.startsWith("image/")) {
      setImageError("Choose an image file.");
      event.currentTarget.value = "";
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setImageError("Images must be 10 MB or smaller.");
      event.currentTarget.value = "";
      return;
    }

    setImageError("");
    const selection = editor.selection;
    if (selection) editor.tf.select(selection);
    editor.getTransforms(ImagePlugin).insert.imageFromFiles(files, selection ? { at: selection } : undefined);
    event.currentTarget.value = "";
  };

  return (
    <div role="toolbar" aria-label="Text formatting" className="flex items-center gap-1 border-b p-2">
      <Button
        type="button"
        size="icon-sm"
        variant={boldActive ? "secondary" : "ghost"}
        aria-label="Bold"
        aria-pressed={boldActive}
        title="Bold"
        onMouseDown={preventSelectionLoss}
        onClick={() => editor.tf.toggleMark("bold")}
      >
        <BoldIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant={italicActive ? "secondary" : "ghost"}
        aria-label="Italic"
        aria-pressed={italicActive}
        title="Italic"
        onMouseDown={preventSelectionLoss}
        onClick={() => editor.tf.toggleMark("italic")}
      >
        <ItalicIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant={underlineActive ? "secondary" : "ghost"}
        aria-label="Underline"
        aria-pressed={underlineActive}
        title="Underline"
        onMouseDown={preventSelectionLoss}
        onClick={() => editor.tf.toggleMark("underline")}
      >
        <UnderlineIcon aria-hidden="true" />
      </Button>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Button
        type="button"
        size="icon-sm"
        variant={currentBlockType === "p" ? "secondary" : "ghost"}
        aria-label="Paragraph"
        aria-pressed={currentBlockType === "p"}
        title="Paragraph"
        onMouseDown={preventSelectionLoss}
        onClick={() => editor.tf.toggleBlock("p")}
      >
        <PilcrowIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant={currentBlockType === "h1" ? "secondary" : "ghost"}
        aria-label="Heading 1"
        aria-pressed={currentBlockType === "h1"}
        title="Heading 1"
        onMouseDown={preventSelectionLoss}
        onClick={() => editor.tf.toggleBlock("h1")}
      >
        <Heading1Icon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant={currentBlockType === "h2" ? "secondary" : "ghost"}
        aria-label="Heading 2"
        aria-pressed={currentBlockType === "h2"}
        title="Heading 2"
        onMouseDown={preventSelectionLoss}
        onClick={() => editor.tf.toggleBlock("h2")}
      >
        <Heading2Icon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant={currentBlockType === "h3" ? "secondary" : "ghost"}
        aria-label="Heading 3"
        aria-pressed={currentBlockType === "h3"}
        title="Heading 3"
        onMouseDown={preventSelectionLoss}
        onClick={() => editor.tf.toggleBlock("h3")}
      >
        <Heading3Icon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant={quoteActive ? "secondary" : "ghost"}
        aria-label="Quote"
        aria-pressed={quoteActive}
        title="Quote"
        onMouseDown={preventSelectionLoss}
        onClick={() => editor.getTransforms(BlockquotePlugin).blockquote.toggle()}
      >
        <QuoteIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant={bulletedListActive ? "secondary" : "ghost"}
        aria-label="Bulleted list"
        aria-pressed={bulletedListActive}
        title="Bulleted list"
        onMouseDown={preventSelectionLoss}
        onClick={() => editor.getTransforms(ListPlugin).toggle.bulletedList()}
      >
        <ListIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant={numberedListActive ? "secondary" : "ghost"}
        aria-label="Numbered list"
        aria-pressed={numberedListActive}
        title="Numbered list"
        onMouseDown={preventSelectionLoss}
        onClick={() => editor.getTransforms(ListPlugin).toggle.numberedList()}
      >
        <ListOrderedIcon aria-hidden="true" />
      </Button>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Insert image"
        title="Insert image"
        onMouseDown={preventSelectionLoss}
        onClick={() => imageInputRef.current?.click()}
      >
        <ImageIcon aria-hidden="true" />
      </Button>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        aria-hidden="true"
        tabIndex={-1}
        className="sr-only"
        onChange={handleImageChange}
      />
      {imageError && <span role="alert" className="ml-2 text-xs text-destructive">{imageError}</span>}
    </div>
  );
}

export function CharacterPanel({ params, api }: IDockviewPanelProps) {
  const id = typeof params.name === "string" ? params.name : "";
  const { campaign } = useCampaign();
  const npc = campaign.npcs.find((item) => item.id === id);
  const name = npc?.name ?? "Character";
  const scrollRef = useRef<HTMLElement>(null);
  const initialScrollTop = useRef(typeof params.scrollTop === "number" ? params.scrollTop : 0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = initialScrollTop.current; });
    return () => cancelAnimationFrame(frame);
  }, []);
  const editor = usePlateEditor({
    id: `character-notes:${id}`,
    plugins: characterEditorPlugins,
    value: () => structuredClone(getCharacterNotes(id)),
  });
  useEffect(() => {
    if (npc && JSON.stringify(editor.children) !== JSON.stringify(npc.notes)) editor.tf.setValue(structuredClone(npc.notes));
  }, [editor, npc]);
  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;

    const selectedImage = Array.from(
      editor.api.nodes({
        at: [],
        match: (node) => node.type === editor.getType(KEYS.img),
        voids: true,
      }),
    ).find(([, path]) => editor.api.isSelected(path));
    if (!selectedImage) return;

    const imagePath = selectedImage[1];
    if (imagePath.length === 0) return;

    event.preventDefault();
    const paragraphPath = [...imagePath];
    paragraphPath[paragraphPath.length - 1] += 1;
    const nextNode = editor.api.node(paragraphPath)?.[0];
    const hasEmptyParagraph =
      nextNode?.type === editor.getType("p") && editor.api.string(paragraphPath) === "";

    if (!hasEmptyParagraph) {
      editor.tf.insertNodes(
        { type: editor.getType("p"), children: [{ text: "" }] },
        { at: paragraphPath },
      );
    }

    requestAnimationFrame(() => {
      const paragraphStart = editor.api.start(paragraphPath);
      if (paragraphStart) editor.tf.focus({ at: paragraphStart });
    });
    return true;
  };

  return (
    <article ref={scrollRef} className="h-full overflow-auto p-8" onScroll={(event) => {
      api.updateParameters({ scrollTop: event.currentTarget.scrollTop });
      window.dispatchEvent(new Event("campaign-workspace-change"));
    }}>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">NPC</p>
      <h1 className="text-2xl font-semibold">{name}</h1>
      <p className="mt-3 max-w-prose text-sm text-muted-foreground">
        Private campaign notes. Use Save to keep your changes.
      </p>
      <section aria-label={`${name} notes`} className="mt-6 max-w-3xl overflow-hidden rounded-xl border bg-card">
        <Plate
          editor={editor}
          onValueChange={({ value }) => saveCharacterNotes(id, value)}
        >
          <FormattingToolbar />
          <PlateContent
            aria-label={`${name} notes editor`}
            placeholder="Add notes about this character…"
            onKeyDown={handleEditorKeyDown}
            className="min-h-60 px-4 py-3 text-sm leading-6 outline-none [&_p]:mb-3 [&_p:last-child]:mb-0 [&_h1]:mb-3 [&_h1]:mt-5 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1:first-child]:mt-0 [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:leading-tight [&_h2:first-child]:mt-0 [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:leading-tight [&_h3:first-child]:mt-0 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:pl-1"
          />
        </Plate>
      </section>
    </article>
  );
}
