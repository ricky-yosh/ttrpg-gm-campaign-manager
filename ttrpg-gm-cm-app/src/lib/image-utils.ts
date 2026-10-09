import { invoke, isTauri } from "@tauri-apps/api/core";

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

/** Rust validates and converts the upload, preserving its displayed dimensions. */
export async function convertImageToWebp(file: File): Promise<Blob> {
  if (!file.size || file.size > MAX_IMAGE_SIZE) {
    throw new Error("Image must be between 1 byte and 10 MiB.");
  }
  if (!isTauri()) {
    throw new Error("Image import is available in the desktop app.");
  }
  const dataUrl = await blobToDataUrl(file);
  try {
    const encoded = await invoke<string>("convert_image_to_webp", {
      encoded: dataUrl.slice(dataUrl.indexOf(",") + 1),
    });
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: "image/webp" });
  } catch (error) {
    throw new Error(typeof error === "string" ? error : "This image could not be converted. Try another file.");
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("This image could not be read."));
    reader.onerror = () => reject(new Error("This image could not be read."));
    reader.readAsDataURL(blob);
  });
}
