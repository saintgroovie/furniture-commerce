"use client"

import { partnersCopy } from "@/lib/woodright-copy"

type Props = {
  src: string
  title: string
  mime: string | null
}

export function PresentationViewer({ src, title, mime: _mime }: Props) {
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
        <a href={src} className="btn btn-secondary" download>
          {partnersCopy.downloadFile}
        </a>
      </div>
    </div>
  )
}
