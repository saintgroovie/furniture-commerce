import Link from "next/link"
import { homeCopy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { homeMedia } from "./home-media"
import { HomeImg } from "./home-img"

/**
 * «По проекту»: layered collage showing what the service actually varies —
 * the same chest in two finishes plus a fabric option, with drafting-style
 * labels. All copy is the existing project block.
 */
export function HomeProject() {
  const { projectBlock } = homeCopy
  return (
    <section className="hp-section hp-project hp-wrap" aria-labelledby="hp-project-title" data-reveal>
      <div className="hp-project-inner">
        <div className="hp-project-collage" aria-hidden="true">
          <span className="hp-project-lines" />
          <span className="hp-project-shot hp-project-shot-a">
            <HomeImg src={homeMedia.projectFinishGraphite} alt="" loading="lazy" decoding="async" draggable={false} />
          </span>
          <span className="hp-project-shot hp-project-shot-b">
            <HomeImg src={homeMedia.projectFinishWhite} alt="" loading="lazy" decoding="async" draggable={false} />
          </span>
          <span className="hp-project-shot hp-project-shot-c">
            <HomeImg src={homeMedia.projectFabricChair} alt="" loading="lazy" decoding="async" draggable={false} />
          </span>
          <span className="hp-project-swatches">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="hp-project-copy">
          <h2 id="hp-project-title" className="hp-section-title">
            {projectBlock.title}
          </h2>
          <CopyLines className="hp-section-lead" lines={projectBlock.text} />
          <div className="hp-project-actions">
            <Link href="/bespoke/request" className="btn btn-primary">
              {projectBlock.ctaPrimary}
            </Link>
            <Link href="/bespoke/catalog" className="btn btn-secondary">
              {projectBlock.ctaSecondary}
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
