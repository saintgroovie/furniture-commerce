import { Badge } from "@medusajs/ui"

export function HighlightText({ text, query }: { text: string; query: string }) {
  const needle = query.trim()
  if (!needle) return <>{text}</>
  const lower = text.toLowerCase()
  const index = lower.indexOf(needle.toLowerCase())
  if (index < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-ui-bg-highlight">{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  )
}

export function StateBadge({
  badge,
  color,
}: {
  badge: string
  color: "green" | "grey" | "orange"
}) {
  return (
    <Badge size="2xsmall" color={color}>
      {badge}
    </Badge>
  )
}
