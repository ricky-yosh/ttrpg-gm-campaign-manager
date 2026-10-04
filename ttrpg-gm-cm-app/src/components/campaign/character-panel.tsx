import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useEditorRef, useEditorSelector, Plate, PlateContent, PlateElement, usePath, usePlateEditor, useSelected, withHOC } from "platejs/react";
import type { PlateElementProps } from "platejs/react";
import { KEYS, type TMediaElement } from "platejs";
import type { IDockviewPanelProps } from "dockview-react";
import { BasicBlocksPlugin, BasicMarksPlugin, BlockquotePlugin } from "@platejs/basic-nodes/react";
import { CaptionPlugin, CaptionTextarea } from "@platejs/caption/react";
import { ListPlugin } from "@platejs/list-classic/react";
import { ImagePlugin } from "@platejs/media/react";
import { Resizable, ResizableProvider, ResizeHandle, useResizableValue } from "@platejs/resizable";
import { BoldIcon, Heading1Icon, Heading2Icon, Heading3Icon, ImageIcon, ItalicIcon, ListIcon, ListOrderedIcon, PencilIcon, PilcrowIcon, QuoteIcon, UnderlineIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "cn";
import { useCampaign, type NpcPresentation, type NpcReference } from "@/lib/campaign-data";
import { NpcImageField } from "@/components/campaign/npc-image-field";
import { Dnd55eStatblock } from "@/components/campaign/npc-statblock";
import type { Value } from "platejs";
import { saveNpcChanges } from "@/lib/campaign-data";

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
  const panelId = useId();
  const npc = useCampaign((state) => state.campaign.npcs.find((item) => item.id === id));
  const scrollRef = useRef<HTMLElement>(null);
  const initialScrollTop = useRef(typeof params.scrollTop === "number" ? params.scrollTop : 0);
  const editor = usePlateEditor({
    id: `character-notes:${id}`,
    plugins: characterEditorPlugins,
    value: () => structuredClone(npc?.notes ?? [{ type: "p", children: [{ text: "" }] }]),
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isWide, setIsWide] = useState(false);
  const [draftName, setDraftName] = useState(npc?.name ?? "");
  const [draftPresentation, setDraftPresentation] = useState<NpcPresentation | null>(
    npc?.presentation ? structuredClone(npc.presentation) : null,
  );
  const [draftNotes, setDraftNotes] = useState<Value>(structuredClone(npc?.notes ?? [{ type: "p", children: [{ text: "" }] }]));

  useEffect(() => {
    const frame = requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = initialScrollTop.current; });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const updateWidth = () => setIsWide(element.clientWidth >= 900);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!npc) return;
    const notes = structuredClone(npc.notes);
    setDraftName(npc.name);
    setDraftPresentation(structuredClone(npc.presentation));
    setDraftNotes(notes);
    setIsEditing(false);
    editor.tf.setValue(notes);
  }, [editor, id, npc]);

  const hasChanges = useMemo(() => {
    if (!npc || !draftPresentation) return false;
    return draftName !== npc.name
      || JSON.stringify(draftPresentation) !== JSON.stringify(npc.presentation)
      || JSON.stringify(draftNotes) !== JSON.stringify(npc.notes);
  }, [draftName, draftNotes, draftPresentation, npc]);

  const updatePresentation = (change: Partial<NpcPresentation>) => {
    setDraftPresentation((current) => current ? { ...current, ...change } : current);
  };

  const handleCancel = () => {
    if (!npc) return;
    const notes = structuredClone(npc.notes);
    setDraftName(npc.name);
    setDraftPresentation(structuredClone(npc.presentation));
    setDraftNotes(notes);
    editor.tf.setValue(notes);
    setIsEditing(false);
  };

  const handleSave = () => {
    if (!npc || !draftPresentation) return;
    saveNpcChanges(id, { name: draftName.trim() || npc.name, notes: draftNotes, presentation: draftPresentation });
    setIsEditing(false);
  };

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

  if (!npc || !draftPresentation) {
    return <article className="h-full overflow-auto p-8"><p className="text-sm text-muted-foreground">This NPC is no longer available.</p></article>;
  }

  const presentation = draftPresentation;
  const reference = presentation.gmReference;
  const setReference = (key: keyof NpcReference, value: string) => {
    updatePresentation({ gmReference: { ...reference, [key]: value } });
  };
  const imageUrl = (image: NpcPresentation["banner"]) => image?.url ?? null;
  const toImage = (url: string | null): NpcPresentation["banner"] => url ? { type: "img", url } : null;

  const referenceGroups: { title: string; fields: { key: keyof NpcReference; label: string }[] }[] = [
    { title: "Background", fields: [{ key: "background", label: "Background" }] },
    { title: "Characteristics", fields: [
      { key: "wants", label: "Wants" }, { key: "ideals", label: "Ideals" }, { key: "bond", label: "Bond" },
      { key: "flaw", label: "Flaw" }, { key: "secrets", label: "Secrets" }, { key: "reaction", label: "Reaction" },
    ] },
    { title: "Roleplaying", fields: [
      { key: "personality", label: "Personality" }, { key: "mannerisms", label: "Mannerisms" },
      { key: "notableActions", label: "Notable actions" }, { key: "voice", label: "Voice" },
    ] },
    { title: "Relationships", fields: [
      { key: "allies", label: "Allies" }, { key: "enemies", label: "Enemies" }, { key: "other", label: "Other" },
    ] },
  ];

  const renderReference = () => (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">GM Reference</h2>
      {referenceGroups.map((group) => {
        const fields = group.fields.filter(({ key }) => isEditing || reference[key].trim());
        if (!fields.length) return null;
        return (
          <section key={group.title} className="border-t pt-3 first:border-0 first:pt-0">
            <h2 className="mb-2 text-sm font-semibold">{group.title}</h2>
            <div className="space-y-2.5">
              {fields.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
                  {isEditing ? (
                    <textarea
                      aria-label={label}
                      value={reference[key]}
                      onChange={(event) => setReference(key, event.currentTarget.value)}
                      rows={key === "background" ? 4 : 2}
                      placeholder={`Add ${label.toLowerCase()}…`}
                      className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  ) : <p className="whitespace-pre-wrap text-sm leading-6">{reference[key]}</p>}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );

  const renderPortrait = () => (
    <div className={cn(isWide && "w-full max-w-[48%]")}>
      <NpcImageField
        editable={isEditing}
        label="Portrait"
        value={imageUrl(presentation.portrait)}
        onChange={(url) => updatePresentation({ portrait: toImage(url) })}
        aspectRatio="4 / 5"
        fit="contain"
      />
    </div>
  );

  const renderPublicDescription = (withPortrait = false) => (
    <section aria-labelledby={`${panelId}-player-description-heading`} className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 id={`${panelId}-player-description-heading`} className="font-semibold">Description for Players</h2>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Public</span>
      </div>
      <div className={cn("flex flex-col gap-4", withPortrait && "sm:flex-row")}>
        {withPortrait && (
          <div className="w-full shrink-0 sm:w-1/3">
            <NpcImageField
              editable={isEditing}
              label="Portrait"
              value={imageUrl(presentation.portrait)}
              onChange={(url) => updatePresentation({ portrait: toImage(url) })}
              aspectRatio="4 / 5"
              fit="contain"
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <textarea
              aria-label="Description for Players"
              value={presentation.playerDescription}
              onChange={(event) => updatePresentation({ playerDescription: event.currentTarget.value })}
              rows={4}
              placeholder="Write a few sentences players can see when this NPC is presented…"
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {presentation.playerDescription || "No player description has been added yet."}
            </p>
          )}
        </div>
      </div>
    </section>
  );

  const renderStatblock = () => presentation.statblock.fieldSetId === "dnd-5.5e" ? (
    <div className={cn(isWide && "mb-5 ml-6 w-[48%] float-right")}>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">D&amp;D 5.5e Statblock</p>
      <Dnd55eStatblock
        value={presentation.statblock.data}
        editable={isEditing}
        onChange={(data) => updatePresentation({ statblock: { ...presentation.statblock, data } })}
        fallbackName={npc.name}
        tokenImage={presentation.statblock.tokenImage?.url ?? null}
        onTokenImageChange={(url) => updatePresentation({ statblock: {
          ...presentation.statblock,
          tokenImage: url ? { type: "img", url } : null,
        } })}
      />
    </div>
  ) : (
    <section className={cn("rounded-xl border bg-card p-4", isWide && "mb-5 ml-6 w-[48%] float-right")}>
      <h2 className="font-semibold">Statblock</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This statblock uses the unsupported ruleset <span className="font-medium">{presentation.statblock.fieldSetId}</span> (version {presentation.statblock.fieldSetVersion}). Its data is preserved, but this view cannot edit or display it yet.
      </p>
    </section>
  );

  const renderNotes = () => (
    <section aria-label={`${npc.name} GM notes`} className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold">GM Notes</h2>
        <p className="text-xs text-muted-foreground">Private reference notes</p>
      </div>
      <Plate editor={editor} onValueChange={({ value }) => setDraftNotes(value)}>
        {isEditing && <FormattingToolbar />}
        <PlateContent
          aria-label={`${npc.name} private notes`}
          placeholder="Add private notes about this NPC…"
          readOnly={!isEditing}
          onKeyDown={isEditing ? handleEditorKeyDown : undefined}
          className="min-h-40 px-4 py-3 text-sm leading-6 outline-none [&_p]:mb-3 [&_p:last-child]:mb-0 [&_h1]:mb-3 [&_h1]:mt-5 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1:first-child]:mt-0 [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:leading-tight [&_h2:first-child]:mt-0 [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:leading-tight [&_h3:first-child]:mt-0 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:pl-1"
        />
      </Plate>
    </section>
  );

  return (
    <article ref={scrollRef} className="h-full overflow-auto p-8" onScroll={(event) => {
      api.updateParameters({ scrollTop: event.currentTarget.scrollTop });
      window.dispatchEvent(new Event("campaign-workspace-change"));
    }}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">NPC</p>
          {isEditing ? (
            <Input aria-label="NPC name" value={draftName} onChange={(event) => setDraftName(event.currentTarget.value)} className="max-w-3xl" />
          ) : <h1 className="font-serif text-2xl font-semibold">{npc.name}</h1>}
          {!isEditing && <p className="mt-1 text-sm text-muted-foreground">NPC reference</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          {isEditing ? (
            <>
              {hasChanges && <span className="self-center text-sm text-muted-foreground">Unsaved changes</span>}
              <Button type="button" variant="outline" onClick={handleCancel}>Cancel</Button>
              <Button type="button" onClick={handleSave} disabled={!hasChanges}>Save changes</Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => setIsEditing(true)}>
              <PencilIcon aria-hidden="true" /> Edit
            </Button>
          )}
        </div>
      </header>

      {(isEditing || presentation.banner) && (
        <NpcImageField
          editable={isEditing}
          label="Banner"
          value={imageUrl(presentation.banner)}
          onChange={(url) => updatePresentation({ banner: toImage(url) })}
          aspectRatio="7 / 1"
          fit="cover"
          className="mb-5"
        />
      )}

      {isWide ? (
        <div className="flow-root">
          {renderStatblock()}
          <div className="mb-5 max-w-[48%]">{renderPublicDescription(true)}</div>
          <div className="mt-5 space-y-5">{renderReference()}</div>
          <div className="clear-both pt-5">{renderNotes()}</div>
        </div>
      ) : (
        <div className="space-y-5">
          {renderPortrait()}
          {renderStatblock()}
          {renderPublicDescription()}
          {renderReference()}
          {renderNotes()}
        </div>
      )}
    </article>
  );
}
