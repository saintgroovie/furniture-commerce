import { Button, Text } from "@medusajs/ui"
import { ArrowUpRightOnBox } from "@medusajs/icons"
import { useState } from "react"
import { buyerProductPreviewUrl } from "../../../lib/woodright-admin/site-preview-url"

type Props = {
  productId: string
  onSite: boolean
  siteUrl: string
}

export function PreviewActions({ productId, onSite, siteUrl }: Props) {
  const [copied, setCopied] = useState<string | null>(null)
  const origin = siteUrl.trim()
  const href = origin ? buyerProductPreviewUrl(productId, origin) : ""

  const copy = async () => {
    if (!href) return
    try {
      await navigator.clipboard.writeText(href)
      setCopied("Ссылка скопирована")
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      setCopied("Не удалось скопировать ссылку")
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {onSite && href && (
          <Button variant="secondary" size="small" asChild>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label="Открыть на сайте, откроется в новой вкладке"
            >
              Открыть на сайте
              <ArrowUpRightOnBox />
            </a>
          </Button>
        )}
        {href && (
          <Button variant="secondary" size="small" onClick={() => void copy()}>
            Скопировать ссылку
          </Button>
        )}
      </div>
      {copied && (
        <Text size="small" className="text-ui-fg-subtle">
          {copied}
        </Text>
      )}
    </div>
  )
}
