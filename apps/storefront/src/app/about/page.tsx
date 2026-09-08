import Link from "next/link"
import type { Metadata } from "next"
import { CopyLines } from "@/components/copy-lines"
import { EditorialFigure } from "@/components/editorial/editorial-figure"
import { EditorialShell } from "@/components/editorial/editorial-shell"
import { editorialMedia } from "@/lib/editorial-media"
import { formatRuInline } from "@/lib/format-ru-copy"
import { aboutCopy, seo } from "@/lib/woodright-copy"

export const metadata: Metadata = {
  title: seo.about.title,
  description: seo.about.description,
  openGraph: {
    title: seo.about.title,
    description: seo.about.description,
    url: "/about",
  },
}

export default function AboutPage() {
  return (
    <EditorialShell theme="about">
      <section className="ed-hero" aria-labelledby="about-hero-title">
        <EditorialFigure
          className="ed-hero-media"
          src={editorialMedia.aboutHero.src}
          alt={editorialMedia.aboutHero.alt}
        />
        <div className="ed-hero-scrim" aria-hidden="true" />
        <div className="ed-hero-panel">
          <p className="ed-eyebrow">Woodright</p>
          <h1 id="about-hero-title">{aboutCopy.h1}</h1>
          <CopyLines className="ed-hero-lead" lines={aboutCopy.statement} />
        </div>
      </section>

      <section className="ed-offset ed-wrap" data-reveal>
        <p className="ed-index" aria-hidden="true">
          01
        </p>
        <div className="ed-offset-copy">
          <h2>{aboutCopy.missionTitle}</h2>
          <CopyLines className="ed-body" lines={aboutCopy.lead} />
          <CopyLines className="ed-body ed-body--muted" lines={aboutCopy.missionText} />
        </div>
      </section>

      <section className="ed-bleed" data-reveal aria-label={editorialMedia.aboutInterior.alt}>
        <EditorialFigure
          className="ed-bleed-figure"
          src={editorialMedia.aboutInterior.src}
          alt={editorialMedia.aboutInterior.alt}
        />
      </section>

      <section className="ed-facts ed-wrap" data-reveal aria-label="Факты о бренде">
        {aboutCopy.facts.map((fact) => (
          <p key={fact.value} className="ed-fact">
            <span className="ed-fact-value">{formatRuInline(fact.value)}</span>
            <span className="ed-fact-label">{formatRuInline(fact.label)}</span>
          </p>
        ))}
      </section>

      <section className="ed-projects ed-wrap" data-reveal aria-labelledby="about-projects-title">
        <div className="ed-projects-intro">
          <p className="ed-index" aria-hidden="true">
            02
          </p>
          <h2 id="about-projects-title">{aboutCopy.projectsTitle}</h2>
          <CopyLines className="ed-body" lines={aboutCopy.projectsLead} />
        </div>
        <ul className="ed-project-index">
          {aboutCopy.projects.map((project) => (
            <li key={project.name}>
              <strong>{formatRuInline(project.name)}</strong>
              <span>{formatRuInline(project.caption)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ed-quote ed-wrap" data-reveal>
        <blockquote>
          <p>{formatRuInline(aboutCopy.quote)}</p>
        </blockquote>
        <EditorialFigure
          className="ed-quote-media"
          src={editorialMedia.aboutDetail.src}
          alt={editorialMedia.aboutDetail.alt}
        />
      </section>

      <nav className="ed-linkrow ed-wrap" aria-label="Разделы Woodright">
        {aboutCopy.links.map((link) => (
          <Link key={link.href} href={link.href} className="ed-link">
            {link.label}
          </Link>
        ))}
      </nav>
    </EditorialShell>
  )
}
