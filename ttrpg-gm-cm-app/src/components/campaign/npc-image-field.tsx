import { useId, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

export type NpcImageFieldProps = {
  editable: boolean;
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  aspectRatio?: string;
  fit?: "cover" | "contain";
  className?: string;
};

export function NpcImageField({
  editable,
  label,
  value,
  onChange,
  aspectRatio = "4 / 3",
  fit = "cover",
  className,
}: NpcImageFieldProps) {
  const inputId = useId();
  const labelId = useId();
  const errorId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    // Clear the input so choosing the same file again still fires change.
    event.currentTarget.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError("Image must be 10 MB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onChange(reader.result);
        setError(null);
      } else {
        setError("This image could not be read. Try another file.");
      }
    };
    reader.onerror = () => setError("This image could not be read. Try another file.");
    reader.readAsDataURL(file);
  };

  const imageFrame = value ? (
    <img
      src={value}
      alt={label}
      className={cn("h-full w-full rounded-md", fit === "contain" ? "object-contain" : "object-cover")}
    />
  ) : (
    <div className="flex h-full min-h-28 items-center justify-center rounded-md border border-dashed bg-muted/30 px-4 text-center text-sm text-muted-foreground">
      {editable ? `No ${label.toLowerCase()} selected` : `No ${label.toLowerCase()} available yet`}
    </div>
  );

  return (
    <section className={cn("space-y-2", className)} aria-labelledby={labelId}>
      <h3 id={labelId} className="text-sm font-medium">{label}</h3>
      <div
        className="overflow-hidden rounded-md"
        style={{ aspectRatio }}
      >
        {imageFrame}
      </div>

      {editable && (
        <>
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label={`${value ? "Replace" : "Upload"} ${label.toLowerCase()}`}
            aria-describedby={error ? errorId : undefined}
            onChange={handleFileChange}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              {value ? "Replace image" : "Upload image"}
            </Button>
            {value && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { onChange(null); setError(null); }}>
                Remove image
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Image files up to 10 MB.</p>
          {error && <p id={errorId} role="alert" className="text-sm text-destructive">{error}</p>}
        </>
      )}
    </section>
  );
}
