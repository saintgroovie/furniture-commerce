"use client"

import { partnersCopy } from "@/lib/woodright-copy"

type Props = {
  src: string
  title: string
  mime: string | null
}

export function PresentationViewer({ src, title, mime }: Props) {
  const isPdf = !mime || mime === "application/pdf" || src.toLowerCase().endsWith(".pdf")

  return (
    <div className="ed-viewer-frame">
      <div className="ed-viewer-actions">
        <a href={src} className="btn btn-primary" target="_blank" rel="noopener noreferrer">
          {partnersCopy.openFile}
        </a>
        <a href={src} className="btn btn-secondary" download>
          {partnersCopy.downloadFile}
        </a>
      </div>
      {isPdf ? (
        <iframe
          title={title}
          src={`${src}#view=FitH`}
          className="ed-viewer-iframe"
          loading="lazy"
        />
      ) : (
        <p className="ed-body">{partnersCopy.viewerFallback[0]}</p>
      )}
    </div>
  )
}
