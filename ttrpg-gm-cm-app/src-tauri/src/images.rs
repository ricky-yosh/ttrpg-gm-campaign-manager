use base64::{engine::general_purpose::STANDARD, Engine};
use image::{
    codecs::{jpeg::JpegDecoder, png::PngDecoder, webp::WebPDecoder},
    DynamicImage, ImageDecoder, ImageFormat, Limits,
};
use std::{io::Cursor, sync::Mutex};

static CONVERSION_LOCK: Mutex<()> = Mutex::new(());

const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const MAX_PIXELS: u64 = 40_000_000;
// libwebp's lossy encoder supports at most 16383 pixels on either axis.
const MAX_DIMENSION: u32 = 16_383;
const MAX_DECODE_ALLOC: u64 = 256 * 1024 * 1024;

fn decode_error(error: image::ImageError) -> String {
    match error {
        image::ImageError::Limits(_) => {
            "Image exceeds the decoding memory or dimension limit.".into()
        }
        _ => "This image is invalid or could not be decoded. Try another file.".into(),
    }
}

/// Pure conversion operation: no campaign changes, asset writes, or history entries.
fn convert_image(bytes: &[u8]) -> Result<Vec<u8>, String> {
    if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
        return Err("Image must be between 1 byte and 10 MiB.".into());
    }
    let format = image::guess_format(bytes)
        .map_err(|_| "Choose a PNG, JPEG, or still WebP image.".to_string())?;
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_DIMENSION);
    limits.max_image_height = Some(MAX_DIMENSION);
    limits.max_alloc = Some(MAX_DECODE_ALLOC);
    let cursor = Cursor::new(bytes);
    let mut decoder: Box<dyn ImageDecoder> = match format {
        ImageFormat::Png => {
            let decoder = PngDecoder::with_limits(cursor, limits.clone()).map_err(decode_error)?;
            if decoder.is_apng().map_err(decode_error)? {
                return Err("Animated images are not supported. Choose a still image.".into());
            }
            Box::new(decoder)
        }
        ImageFormat::Jpeg => Box::new(JpegDecoder::new(cursor).map_err(decode_error)?),
        ImageFormat::WebP => {
            let decoder = WebPDecoder::new(cursor).map_err(decode_error)?;
            if decoder.has_animation() {
                return Err("Animated images are not supported. Choose a still image.".into());
            }
            Box::new(decoder)
        }
        ImageFormat::Gif => {
            return Err(
                "GIF images are not supported. Choose a PNG, JPEG, or still WebP image.".into(),
            )
        }
        _ => return Err("Choose a PNG, JPEG, or still WebP image.".into()),
    };
    decoder.set_limits(limits).map_err(decode_error)?;
    let (width, height) = decoder.dimensions();
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > MAX_PIXELS {
        return Err("Image must contain at most 40 million pixels.".into());
    }
    if decoder.total_bytes() > MAX_DECODE_ALLOC {
        return Err("Image exceeds the decoding memory limit.".into());
    }
    let orientation = decoder.orientation().map_err(decode_error)?;
    let mut decoded = DynamicImage::from_decoder(decoder).map_err(decode_error)?;
    // Fully decode WebP to validate its payload, but preserve its original encoding.
    if format == ImageFormat::WebP {
        return Ok(bytes.to_vec());
    }
    decoded.apply_orientation(orientation);
    let rgba = decoded.into_rgba8();
    let encoded = webp::Encoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height())
        .encode_simple(false, 82.0)
        .map_err(|_| "This image could not be encoded as WebP.".to_string())?;
    // Campaign storage currently enforces this limit on stored image data too.
    if encoded.len() > MAX_IMAGE_BYTES {
        return Err("Converted image exceeds 10 MiB. Choose a smaller image.".into());
    }
    Ok(encoded.to_vec())
}

/// Base64 keeps IPC payloads compact compared with JSON arrays of individual bytes.
#[tauri::command]
pub async fn convert_image_to_webp(encoded: String) -> Result<String, String> {
    if encoded.len() > MAX_IMAGE_BYTES.div_ceil(3) * 4 {
        return Err("Image must be 10 MiB or smaller.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        // Serialize conversions so concurrent uploads cannot multiply decoder memory use.
        let _guard = CONVERSION_LOCK
            .lock()
            .map_err(|_| "Image conversion is unavailable. Restart the app.".to_string())?;
        let bytes = STANDARD
            .decode(encoded)
            .map_err(|_| "This image could not be read.".to_string())?;
        convert_image(&bytes).map(|webp| STANDARD.encode(webp))
    })
    .await
    .map_err(|_| "Image conversion could not finish. Try another file.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageEncoder, Rgba, RgbaImage};

    fn png() -> Vec<u8> {
        let mut bytes = Vec::new();
        let pixels = RgbaImage::from_fn(7, 3, |x, _| {
            Rgba([30, 100, 180, if x == 0 { 0 } else { 128 }])
        });
        image::codecs::png::PngEncoder::new(&mut bytes)
            .write_image(pixels.as_raw(), 7, 3, image::ExtendedColorType::Rgba8)
            .unwrap();
        bytes
    }

    #[test]
    fn converts_real_png_preserving_dimensions_and_alpha() {
        let result = convert_image(&png()).unwrap();
        assert_eq!(image::guess_format(&result).unwrap(), ImageFormat::WebP);
        let decoded = image::load_from_memory(&result).unwrap().into_rgba8();
        assert_eq!(decoded.dimensions(), (7, 3));
        assert_eq!(decoded.get_pixel(0, 0)[3], 0);
        assert_eq!(decoded.get_pixel(1, 0)[3], 128);
        assert_eq!(convert_image(&result).unwrap(), result);
    }

    #[test]
    fn applies_jpeg_exif_orientation() {
        let pixels = image::RgbImage::from_pixel(7, 3, image::Rgb([30, 100, 180]));
        let mut jpeg = Vec::new();
        image::codecs::jpeg::JpegEncoder::new(&mut jpeg)
            .encode(pixels.as_raw(), 7, 3, image::ExtendedColorType::Rgb8)
            .unwrap();
        // APP1: Exif header, little-endian TIFF, orientation tag = 6 (rotate 90 CW).
        let exif = b"Exif\0\0II\x2a\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0\x06\0\0\0\0\0\0\0";
        let mut oriented = jpeg[..2].to_vec();
        oriented.extend_from_slice(&[0xff, 0xe1]);
        oriented.extend_from_slice(&((exif.len() + 2) as u16).to_be_bytes());
        oriented.extend_from_slice(exif);
        oriented.extend_from_slice(&jpeg[2..]);
        let result = convert_image(&oriented).unwrap();
        assert_eq!(
            image::load_from_memory(&result)
                .unwrap()
                .into_rgba8()
                .dimensions(),
            (3, 7)
        );
    }

    #[test]
    fn rejects_empty_oversized_unsupported_and_corrupt_inputs() {
        for bytes in [
            vec![],
            vec![0; MAX_IMAGE_BYTES + 1],
            b"GIF89a".to_vec(),
            b"<svg/>".to_vec(),
            b"RIFF\x04\0\0\0WEBP".to_vec(),
        ] {
            assert!(convert_image(&bytes).is_err());
        }
        let mut truncated = png();
        truncated.truncate(truncated.len() / 2);
        assert!(convert_image(&truncated).is_err());
    }

    #[test]
    fn rejects_excessive_pixels_before_decoding() {
        // Valid PNG header for 7000 × 7000 pixels; no large pixel allocation needed.
        let mut bytes = png();
        bytes[16..20].copy_from_slice(&7000u32.to_be_bytes());
        bytes[20..24].copy_from_slice(&7000u32.to_be_bytes());
        let crc = crc32(&bytes[12..29]);
        bytes[29..33].copy_from_slice(&crc.to_be_bytes());
        assert!(convert_image(&bytes).unwrap_err().contains("40 million"));
    }

    fn crc32(bytes: &[u8]) -> u32 {
        let mut crc = !0u32;
        for byte in bytes {
            crc ^= u32::from(*byte);
            for _ in 0..8 {
                crc = (crc >> 1) ^ (0xedb88320 & (0u32.wrapping_sub(crc & 1)));
            }
        }
        !crc
    }

    #[test]
    fn rejects_animated_png() {
        let mut bytes = png();
        let mut chunk = Vec::from(&b"acTL"[..]);
        chunk.extend_from_slice(&1u32.to_be_bytes());
        chunk.extend_from_slice(&0u32.to_be_bytes());
        let crc = crc32(&chunk);
        let mut framed = 8u32.to_be_bytes().to_vec();
        framed.extend(chunk);
        framed.extend_from_slice(&crc.to_be_bytes());
        bytes.splice(33..33, framed);
        assert!(convert_image(&bytes).unwrap_err().contains("Animated"));
    }

    #[test]
    fn rejects_animated_webp() {
        let config = webp::WebPConfig::new().unwrap();
        let mut encoder = webp::AnimEncoder::new(7, 3, &config);
        let pixels = vec![128; 7 * 3 * 4];
        encoder.add_frame(webp::AnimFrame::from_rgba(&pixels, 7, 3, 0));
        let second = vec![255; 7 * 3 * 4];
        encoder.add_frame(webp::AnimFrame::from_rgba(&second, 7, 3, 100));
        let bytes = encoder.encode();
        assert!(convert_image(&bytes).unwrap_err().contains("Animated"));
    }
}
