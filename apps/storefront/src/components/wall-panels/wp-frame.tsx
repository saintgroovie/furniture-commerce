import type { CSSProperties } from "react"
import { frameAspect, type WallPanelFrame } from "./wall-panels-media"

type Props = {
  frame: WallPanelFrame
  className?: string
  /** Override the intrinsic ratio when the layout crops to a different box. */
  ratio?: WallPanelFrame["ratio"] | "none"
  priority?: boolean
  style?: CSSProperties
  /** Extra attributes for crossfade stacks (`data-active`, etc). */
  imgProps?: Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "alt">
}

/**
 * One editorial frame: reserved aspect box + cover-cropped image. Keeps CLS at
 * zero across the asymmetric grids and lets each section decide its own crop.
 */
export function WpFrame({ frame, className, ratio, priority, style, imgProps }: Props) {
  const aspect = ratio === "none" ? undefined : frameAspect(ratio ?? frame.ratio)
  return (
    <span
      className={className ? `wp-frame ${className}` : "wp-frame"}
      style={aspect ? { aspectRatio: aspect, ...style } : style}
    >
      <img
        src={frame.src}
        alt={frame.alt}
        style={frame.pos ? { objectPosition: frame.pos } : undefined}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        draggable={false}
        {...imgProps}
      />
    </span>
  )
}
