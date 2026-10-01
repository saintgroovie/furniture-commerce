import sharp from "sharp"

/** Storefront and the local file pipeline serve jpeg, png, and webp. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

export type ImageKind = "jpeg" | "png" | "webp"

export type UploadCheck =
  | { ok: true; mime: string; ext: "jpg" | "png" | "webp" }
  | { ok: false; message: string }

const MIME: Record<ImageKind, { mime: string; ext: "jpg" | "png" | "webp" }> = {
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  png: { mime: "image/png", ext: "png" },
  webp: { mime: "image/webp", ext: "webp" },
}

/**
 * Duplicate strategy: every accepted upload is a new file.
 * The browser filename is discarded. Nothing is overwritten.
 */
export function sniffImage(buf: Buffer): ImageKind | "heic" | "executable" | "unknown" {
  if (buf.length >= 2 && buf[0] === 0x4d && buf[1] === 0x5a) return "executable"
  if (buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) {
    return "executable"
  }
  if (buf.length >= 2 && buf[0] === 0x23 && buf[1] === 0x21) return "executable"
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg"
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "png"
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "webp"
  }
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12).toLowerCase()
    if (brand.startsWith("hei") || brand === "mif1" || brand === "hevc" || brand === "avif") {
      return "heic"
    }
  }
  return "unknown"
}

export async function validateUpload(buf: Buffer): Promise<UploadCheck> {
  if (buf.length === 0) {
    return { ok: false, message: "Файл пустой" }
  }
  if (buf.length > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "Файл больше 8 МБ" }
  }
  const kind = sniffImage(buf)
  if (kind === "executable") {
    return { ok: false, message: "Этот файл нельзя загрузить как кадр" }
  }
  if (kind === "heic") {
    return {
      ok: false,
      message: "Формат HEIC здесь не принимается. Сохраните кадр как JPEG, PNG или WebP",
    }
  }
  if (kind === "unknown") {
    return { ok: false, message: "Нужен кадр JPEG, PNG или WebP" }
  }
  try {
    const meta = await sharp(buf, { failOn: "error" }).metadata()
    if (meta.format !== kind || !meta.width || !meta.height) {
      return { ok: false, message: "Файл не открывается как изображение" }
    }
  } catch {
    return { ok: false, message: "Файл не открывается как изображение" }
  }
  const named = MIME[kind]
  return { ok: true, mime: named.mime, ext: named.ext }
}
