import { Fragment, type CSSProperties, type ElementType } from "react"
import { asCopyLines, formatRuInline, type CopyBlock } from "@/lib/format-ru-copy"

type Props = {
  lines: CopyBlock
  className?: string
  style?: CSSProperties
  as?: "p" | "span" | "div" | "h1" | "h2" | "h3"
  role?: string
}

/** Renders one or more meaning-based lines with RU hanging-preposition protection. */
export function CopyLines({ lines, className, style, as: Tag = "p", role }: Props) {
  const parts = asCopyLines(lines)
  const Comp = Tag as ElementType

  return (
    <Comp className={className} style={style} role={role}>
      {parts.map((line, index) => (
        <Fragment key={`${index}:${line.slice(0, 24)}`}>
          {index > 0 ? <br /> : null}
          {formatRuInline(line)}
        </Fragment>
      ))}
    </Comp>
  )
}
