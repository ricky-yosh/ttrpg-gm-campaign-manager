# Image import and WebP conversion

**Status: implemented.** Imports use Rust's `image` and `webp` crates through a Tauri command. Conversion requires the desktop app (`pnpm tauri dev` during development); browser canvas encoding is no longer used.

## Import flow

```text
NPC banner / portrait / token / map upload
  → frontend image helper reads the File
  → convert_image_to_webp Tauri command
  → Rust validates, decodes, and encodes on a blocking worker
  → WebP bytes returned for preview and frontend state
  → campaign save stores a content-hashed .webp asset
```

Conversion happens at import, before the image enters campaign state. The map prototype uses the same command for its local preview; saving maps is a separate feature. GM notes do not offer image uploads.

## Responsibilities

Paths below are relative to `ttrpg-gm-cm-app/`.

| File | Responsibility |
| --- | --- |
| `src-tauri/src/images.rs` | Image validation and conversion, plus a thin Tauri command. Keep the conversion function callable without Tauri. |
| `src-tauri/src/lib.rs` | Register `convert_image_to_webp`. |
| `src-tauri/Cargo.toml` | Add `image` for decoding and `webp` for encoding, with only required features enabled. |
| `src/lib/image-utils.ts` | Read the upload, check size for immediate feedback, invoke Rust, and adapt returned data to a Blob or data URL. No canvas encoding. |
| `src/components/campaign/npc-image-field.tsx`, `npc-statblock.tsx`, `map-prototype-panel.tsx` | File selection, pending/error state, and applying the converted image. Ignore stale conversion results after a newer selection. |
| `src-tauri/src/campaign.rs` | Continue hashing and storing assets and resolving them when loading a campaign. Do not encode again during save. |

## Import behavior

- Accept PNG, JPEG, and still WebP uploads initially; file pickers and Rust validation must agree. Determine the format from the bytes, rather than trusting the supplied MIME type.
- Reject empty files and inputs larger than **10 MiB (10 × 1024 × 1024 bytes)** in Rust. Retain the frontend size check for immediate feedback.
- Limit images to **40 million pixels**, **16,383 pixels per axis**, and **256 MiB of decoder allocations**. These are decoder limits, not a cap on total process memory. Serialize conversions on the blocking workers to avoid simultaneous large decodes.
- Fully decode still WebP to validate it, then return the original bytes without recompression.
- Encode PNG/JPEG at WebP quality **82** and preserve transparency. Apply photo orientation before encoding, then preserve the resulting dimensions and aspect ratio. Do not crop or resize maps, since their coordinates depend on image geometry.
- Reject animated inputs with a clear message. SVG and AVIF import support require separate work.
- Run decoding and encoding through `spawn_blocking` so conversion does not block the interface. The command accepts and returns base64 strings to avoid JSON arrays of individual bytes. Return actionable errors for invalid files, unsupported formats, limits, and encoding failures.
- Keep existing campaign assets readable in their original formats. This change does not migrate existing images or recompress them on every save.

WebP conversion does not guarantee a smaller file for every input. Check representative maps and portraits before settling the quality setting.

## Undo and redo

These are requirements for the campaign edit history; that shared history is not implemented yet.

Conversion is preparation and does **not** create an undo entry. Choosing a file, waiting for conversion, or a failed conversion does not change campaign state. After conversion succeeds, applying the image is one undoable edit: adding an image restores the empty field on undo, and replacing an image restores the previous image. Redo reapplies the already converted WebP without reading the source file or encoding again.

The edit stores the previous and next image references. Keep the corresponding image data or assets available for as long as an undo or redo entry references them. Future asset cleanup must count history references alongside current campaign references; clearing a redo branch can release its references. Do not copy large image payloads into every history entry.

For maps, replacing an image currently also clears pins and resets the camera. When map editing joins campaign history, treat that replacement as one edit that restores the image, pins, and camera together. The current local map prototype has no campaign undo integration.

Saving converted assets is persistence work and adds no undo entry. Undo changes the campaign record and follows the normal save flow; it does not delete an asset immediately. History grouping and persistence across app restarts remain part of the [backend history design](backend-architecture.md#undo-and-redo).

## Checks

- Rust tests cover actual WebP output, dimensions, JPEG orientation, transparency, reuse of existing WebP, invalid/oversized files, pixel limits, and PNG/WebP animation rejection.
- Existing campaign persistence tests cover asset save/reopen compatibility. No campaign schema migration is required.
- Run `cargo test --manifest-path src-tauri/Cargo.toml --lib`, `pnpm build`, and `pnpm lint` from the app directory.
- Manually check NPC uploads and map preview/pins in the desktop app, and verify builds on each supported desktop target. The initial native build is checked on macOS; other operating systems still need verification.

References: [Tauri commands](https://v2.tauri.app/develop/calling-rust/), [image decoding limits](https://docs.rs/image/latest/image/struct.ImageReader.html), [WebP encoder](https://docs.rs/webp/latest/webp/struct.Encoder.html).
