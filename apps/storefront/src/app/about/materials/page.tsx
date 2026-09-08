import Link from "next/link"
import type { Metadata } from "next"
import { CopyLines } from "@/components/copy-lines"
import { EditorialFigure } from "@/components/editorial/editorial-figure"
import { EditorialShell } from "@/components/editorial/editorial-shell"
import { editorialMedia } from "@/lib/editorial-media"
import { aboutMaterialsCopy, seo } from "@/lib/woodright-copy"

export const metadata: Metadata = {
  title: seo.aboutMaterials.title,
  description: seo.aboutMaterials.description,
  openGraph: {
    title: seo.aboutMaterials.title,
    url: "/about/materials",
  },
}

export default function MaterialsPage() {
  return (
    <EditorialShell theme="materials">
      <header className="ed-materials-head ed-wrap">
        <h1>{aboutMaterialsCopy.h1}</h1>
        <CopyLines className="ed-body" lines={aboutMaterialsCopy.lead} />
      </header>

      <section className="ed-mosaic" data-reveal aria-label={aboutMaterialsCopy.mosaicCaption}>
        <EditorialFigure
          className="ed-mosaic-a"
          src={editorialMedia.materialsOlive.src}
          alt={editorialMedia.materialsOlive.alt}
        />
        <EditorialFigure
          className="ed-mosaic-b"
          src={editorialMedia.materialsGraphite.src}
          alt={editorialMedia.materialsGraphite.alt}
        />
        <EditorialFigure
          className="ed-mosaic-c"
          src={editorialMedia.materialsWhite.src}
          alt={editorialMedia.materialsWhite.alt}
        />
        <EditorialFigure
          className="ed-mosaic-d"
          src={editorialMedia.materialsFabric.src}
          alt={editorialMedia.materialsFabric.alt}
          caption={aboutMaterialsCopy.mosaicCaption}
        />
      </section>

      <div className="ed-materials-foot ed-wrap" data-reveal>
        <CopyLines className="ed-body" lines={aboutMaterialsCopy.body} />
        <div className="ed-cta-row">
          <Link href="/bespoke/request" className="btn btn-primary">
            Обсудить проект
          </Link>
          <Link href="/about" className="btn btn-secondary">
            О бренде
          </Link>
          <Link href="/catalog" className="btn btn-secondary">
            Каталог
          </Link>
        </div>
      </div>
    </EditorialShell>
  )
}
