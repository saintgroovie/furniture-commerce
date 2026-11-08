"use client"

import { forwardRef, useState, type ImgHTMLAttributes } from "react"
import { preparedPhotoFallbackSource, canFallbackPreparedPhoto } from "@/lib/prepared-photos"
import { usePreparedPhotoResolver } from "./prepared-photo-scope"

/** Preserve gallery state/classifiers on the original URL; replace only image I/O. */
export const PreparedPhotoImage = forwardRef<HTMLImageElement, ImgHTMLAttributes<HTMLImageElement> & { originalPhotoSource?: string }>(function PreparedPhotoImage({ src, originalPhotoSource, onError, ...props }, ref) {
  const resolvePhoto = usePreparedPhotoResolver()
  const original = typeof src === "string" ? src : ""
  const target = resolvePhoto(original, originalPhotoSource)
  const [failed, setFailed] = useState<string | null>(null)
  return <img {...props} ref={ref} src={preparedPhotoFallbackSource(original, target, failed) || src} onError={event => {
    if (canFallbackPreparedPhoto(original, target, failed)) { setFailed(target); return }
    onError?.(event)
  }} />
})
