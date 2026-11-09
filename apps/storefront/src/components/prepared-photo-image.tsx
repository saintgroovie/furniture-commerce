"use client"

import { forwardRef, useCallback, useEffect, useRef, useState, type ImgHTMLAttributes } from "react"
import { preparedPhotoFallbackSource, canFallbackPreparedPhoto } from "@/lib/prepared-photos"
import { usePreparedPhotoResolver } from "./prepared-photo-scope"

/** An SSR image error may finish before React attaches its onError handler. */
export function shouldRecoverPreparedPhotoImage(
  image: Pick<HTMLImageElement, "complete" | "naturalWidth" | "getAttribute"> | null,
  renderedSource: string | undefined,
  original: string,
  target: string,
  failedTarget: string | null,
): boolean {
  return !!image && typeof renderedSource === "string" && renderedSource.length > 0 &&
    image.getAttribute("src") === renderedSource && image.complete && image.naturalWidth === 0 &&
    canFallbackPreparedPhoto(original, target, failedTarget)
}

/** Preserve gallery state/classifiers on the original URL; replace only image I/O. */
export const PreparedPhotoImage = forwardRef<HTMLImageElement, ImgHTMLAttributes<HTMLImageElement> & { originalPhotoSource?: string }>(function PreparedPhotoImage({ src, originalPhotoSource, onError, ...props }, ref) {
  const resolvePhoto = usePreparedPhotoResolver()
  const original = typeof src === "string" ? src : ""
  const target = resolvePhoto(original, originalPhotoSource)
  const [failed, setFailed] = useState<string | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const renderedSource = preparedPhotoFallbackSource(original, target, failed) || src
  const attachRef = useCallback((image: HTMLImageElement | null) => {
    imageRef.current = image
    if (typeof ref === "function") {
      const cleanup = ref(image)
      if (typeof cleanup === "function") return () => {
        if (imageRef.current === image) imageRef.current = null
        cleanup()
      }
    } else if (ref) ref.current = image
  }, [ref])
  useEffect(() => {
    if (shouldRecoverPreparedPhotoImage(imageRef.current, renderedSource, original, target, failed)) {
      setFailed(current => canFallbackPreparedPhoto(original, target, current) ? target : current)
    }
  }, [renderedSource, original, target, failed])
  return <img {...props} ref={attachRef} src={renderedSource} onError={event => {
    if (canFallbackPreparedPhoto(original, target, failed)) {
      setFailed(current => canFallbackPreparedPhoto(original, target, current) ? target : current)
      return
    }
    onError?.(event)
  }} />
})
