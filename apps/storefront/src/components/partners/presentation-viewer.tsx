import { isPartnerPdf, isSafePartnerFile } from "@/lib/partner-file"
import { partnersCopy } from "@/lib/woodright-copy"

type Props = {
  src: string
  title: string
  mime: string | null
}

/** File-only fallback. Image decks render through DeckViewer on the route. */
export function PresentationViewer({ src, title, mime }: Props) {
  if (!isSafePartnerFile(src)) return null
  const pdf = isPartnerPdf(src, mime)

  return (
    <div className="ed-viewer-frame">
      <div className="ed-viewer-actions">
        <a
          href={src}
          className="btn btn-primary"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${partnersCopy.openFile}: ${title}`}
        >
          {partnersCopy.openFile}
        </a>
        {pdf ? (
          <a href={src} className="btn btn-secondary" download>
            {partnersCopy.downloadFile}
          </a>
        ) : null}
      </div>
    </div>
  )
}
