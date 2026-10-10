"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react"
import { DeckViewer } from "@/components/partners/deck-viewer"
import { deckHistoryState, isPlainDeckActivation, readDeckHistory } from "@/lib/deck-activation"
import { isPartnerPdf } from "@/lib/partner-file"
import { hasPartnerMark, PartnerMark } from "@/components/partners/partner-mark"
import { bindPinProgress } from "@/components/partners/pin-progress"
import type { EditorialSlide, StorePartner, StorePartnerPresentation } from "@/lib/api/partners"
import { formatRuInline } from "@/lib/format-ru-copy"
import { designersLandingCopy, partnersCopy } from "@/lib/woodright-copy"

type OpenDeck = {
  partner: StorePartner
  index: number
}

const PLATE_SLUGS = ["mvd-academy", "kunstkamera"] as const

function deckOf(partner: StorePartner | undefined): StorePartnerPresentation | null {
  if (!partner) return null
  return (
    partner.presentations.find((item) => (item.slides?.length ?? 0) > 0) ??
    partner.presentations.find((item) => isPartnerPdf(item.file_url, item.mime)) ??
    null
  )
}

function slidesOf(partner: StorePartner | undefined): EditorialSlide[] {
  return deckOf(partner)?.slides ?? []
}

function findSlide(partner: StorePartner | undefined, file: string): EditorialSlide | undefined {
  return slidesOf(partner).find((slide) => slide.src.endsWith(`/${file}`))
}

function presentationHref(partner: StorePartner): string {
  const deck = deckOf(partner)
  return deck ? `/partners/${partner.slug}/presentations/${deck.id}` : `/partners/${partner.slug}`
}

function repeatsTitle(title: string, description: string | null | undefined): boolean {
  const heading = title.trim().toLocaleLowerCase("ru")
  const body = (description ?? "").trim().toLocaleLowerCase("ru")
  if (!heading || !body) return false
  return body.startsWith(heading) || heading.startsWith(body)
}

function markReturn(event: MouseEvent<HTMLElement>) {
  document.querySelector("[data-deck-return]")?.removeAttribute("data-deck-return")
  event.currentTarget.setAttribute("data-deck-return", "")
}

export function PartnersEditorial({ partners }: { partners: StorePartner[] }) {
  const [open, setOpen] = useState<OpenDeck | null>(null)
  const partnersRef = useRef(partners)
  const bySlug = new Map(partners.map((partner) => [partner.slug, partner]))
  const bolshoi = bySlug.get("bolshoi")
  const mariinsky = bySlug.get("mariinsky-palace")
  const ran = bySlug.get("ran-presidential")
  const hero = bolshoi ?? partners.find((partner) => partner.images[0])
  const heroSlide = findSlide(hero, "hall.jpg") ?? slidesOf(hero)[0]
  const craft = findSlide(bolshoi, "chairs-velvet.jpg")
  const featured = new Set<string>([
    "bolshoi",
    "mariinsky-palace",
    "mvd-academy",
    "kunstkamera",
    "ran-presidential",
  ])
  const extra = partners.filter(
    (partner) => slidesOf(partner).length > 0 && !featured.has(partner.slug)
  )
  const theses = ["bolshoi", "mariinsky-palace", "mvd-academy", "ran-presidential"]
    .map((slug) => bySlug.get(slug))
    .filter((partner): partner is StorePartner => Boolean(partner?.description))
  const closeImage =
    findSlide(mariinsky, "benches.jpg") ??
    findSlide(bolshoi, "chairs-velvet.jpg") ??
    heroSlide

  const closeDeck = useCallback(() => setOpen(null), [])

  useEffect(() => {
    partnersRef.current = partners
  }, [partners])

  useEffect(() => {
    const onPop = () => {
      const restored = readDeckHistory(window.history.state)
      if (!restored) {
        setOpen(null)
        return
      }
      const partner = partnersRef.current.find((item) => item.slug === restored.slug)
      if (!partner || slidesOf(partner).length === 0) {
        setOpen(null)
        return
      }
      setOpen({ partner, index: restored.index })
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const openDeck = (event: MouseEvent<HTMLElement>, partner: StorePartner, index = 0) => {
    if (!slidesOf(partner).length) return
    const anchor = event.currentTarget instanceof HTMLAnchorElement ? event.currentTarget : null
    if (
      !isPlainDeckActivation({
        defaultPrevented: event.defaultPrevented,
        button: event.button,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        target: anchor?.getAttribute("target") ?? null,
      })
    ) {
      return
    }
    event.preventDefault()
    markReturn(event)
    setOpen({ partner, index })
    window.history.pushState(deckHistoryState(partner.slug, index), "")
  }

  return (
    <div className="px">
      <PinHost />
      {hero?.images[0] ? (
        <section className="px-hero" aria-label={partnersCopy.h1}>
          <div className="px-hero-media">
            <img
              src={heroSlide?.src ?? hero.images[0]}
              alt={heroSlide?.alt ?? hero.name}
              width={2000}
              height={1229}
              fetchPriority="high"
              decoding="async"
              data-veil-atf=""
            />
          </div>
          <div className="px-hero-copy">
            <p className="px-hero-title">{partnersCopy.h1}</p>
            <p className="px-hero-note">
              {formatRuInline(hero.name)}
              {hero.description ? ` · ${formatRuInline(hero.description)}` : ""}
            </p>
          </div>
        </section>
      ) : null}

      <section className="px-statement" data-reveal>
        <h1>
          {partnersCopy.statement.map((line, index) => (
            <span key={line} className="px-line" style={{ ["--d" as string]: `${index * 90}ms` }}>
              <span>{formatRuInline(line)}</span>
            </span>
          ))}
        </h1>
      </section>

      {craft ? (
        <figure className="px-break px-mask" data-reveal>
          <div className="px-mask-clip">
            <img src={craft.src} alt={craft.alt} decoding="async" loading="lazy" />
          </div>
          <figcaption>
            <span>{formatRuInline(craft.title)}</span>
            <span>{formatRuInline(craft.caption)}</span>
          </figcaption>
        </figure>
      ) : null}

      {theses.length > 0 ? (
        <section className="px-theses" data-reveal aria-label={partnersCopy.h1}>
          {theses.map((partner, index) => (
            <article key={partner.id} className="px-thesis" style={{ ["--reveal-i" as string]: String(index) }}>
              <p className="px-kicker">{formatRuInline(partner.name)}</p>
              <h2>{formatRuInline(partner.description || "")}</h2>
            </article>
          ))}
        </section>
      ) : null}

      {bolshoi && slidesOf(bolshoi).length > 0 ? (
        <PresentationStage partner={bolshoi} kind="fan" onOpen={openDeck} />
      ) : null}

      {mariinsky && slidesOf(mariinsky).length > 0 ? (
        <PresentationStage partner={mariinsky} kind="sequence" mirrored onOpen={openDeck} />
      ) : null}

      {PLATE_SLUGS.map((slug, index) => {
        const partner = bySlug.get(slug)
        if (!partner || slidesOf(partner).length === 0) return null
        const preferred = slug === "kunstkamera" ? "expeditions.jpg" : "reading-room.jpg"
        const slide = findSlide(partner, preferred) ?? slidesOf(partner)[0]
        return (
          <Plate
            key={slug}
            partner={partner}
            slide={slide}
            flip={index % 2 === 1}
            portrait={slug === "kunstkamera"}
            onOpen={openDeck}
          />
        )
      })}

      {ran && slidesOf(ran).length > 0 ? (
        <WideProof
          partner={ran}
          slide={findSlide(ran, "hall.jpg") ?? slidesOf(ran)[0]}
          onOpen={openDeck}
        />
      ) : null}

      {extra.map((partner) => (
        <PresentationStage key={partner.id} partner={partner} kind="sequence" onOpen={openDeck} />
      ))}

      <Roster partners={partners} onOpen={openDeck} />

      <section className="px-close">
        {closeImage ? (
          <figure className="px-mask" data-reveal>
            <div className="px-mask-clip">
              <img src={closeImage.src} alt={closeImage.alt} decoding="async" loading="lazy" />
            </div>
          </figure>
        ) : null}
        <div className="px-close-copy">
          <h2>{designersLandingCopy.h1}</h2>
          {designersLandingCopy.closing.map((line) => (
            <p key={line}>{formatRuInline(line)}</p>
          ))}
          <p className="px-close-actions">
            <Link href="/bespoke/request" className="px-cta">
              {designersLandingCopy.ctaPrimary}
              <span className="px-arrow" aria-hidden="true">
                →
              </span>
            </Link>
            <Link href="/designers" className="px-quiet">
              {designersLandingCopy.eyebrow}
            </Link>
          </p>
        </div>
      </section>

      {open && slidesOf(open.partner).length > 0 ? (
        <DeckViewer
          key={`${open.partner.slug}:${open.index}`}
          title={deckOf(open.partner)?.title || open.partner.name}
          kicker={open.partner.name}
          slides={slidesOf(open.partner)}
          fileUrl={deckOf(open.partner)?.file_url || undefined}
          mime={deckOf(open.partner)?.mime}
          initialIndex={open.index}
          onClose={closeDeck}
        />
      ) : null}
    </div>
  )
}

function PinHost() {
  useEffect(() => bindPinProgress(), [])
  return null
}

function PresentationStage({
  partner,
  kind,
  mirrored = false,
  onOpen,
}: {
  partner: StorePartner
  kind: "fan" | "sequence"
  mirrored?: boolean
  onOpen: (event: MouseEvent<HTMLElement>, partner: StorePartner, index?: number) => void
}) {
  const deck = deckOf(partner)
  const slides = slidesOf(partner)
  if (!deck || slides.length === 0) return null
  const last = Math.max(1, slides.length - 1)
  const href = presentationHref(partner)

  return (
    <section
      className={mirrored ? "px-stage is-copy-end" : "px-stage"}
      data-pin
      aria-label={deck.title}
    >
      <div className="px-sticky">
        <StageCopy partner={partner} deck={deck} href={href} onOpen={onOpen} />
        {kind === "fan" ? (
          <div className="px-fan">
            {slides.map((slide, index) => (
              <button
                key={slide.src}
                type="button"
                className="px-sheet"
                style={{ ["--i" as string]: String(index) } as CSSProperties}
                onClick={(event) => onOpen(event, partner, index)}
                aria-label={`${slide.title}. ${partnersCopy.viewPresentation}`}
              >
                <img src={slide.src} alt="" decoding="async" loading="lazy" />
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            className="px-seq"
            style={{ ["--last" as string]: String(last) } as CSSProperties}
            aria-label={partnersCopy.viewPresentation}
            onClick={(event) => {
              const pin = event.currentTarget.closest<HTMLElement>("[data-pin]")
              const progress = Number(pin?.style.getPropertyValue("--p") || "0")
              const index = Math.round((Number.isFinite(progress) ? progress : 0) * (slides.length - 1))
              onOpen(event, partner, index)
            }}
          >
            {slides.map((slide, index) => (
              <span
                key={slide.src}
                className="px-seq-frame"
                style={{ ["--i" as string]: String(index) } as CSSProperties}
              >
                <img src={slide.src} alt="" decoding="async" loading="lazy" />
              </span>
            ))}
          </button>
        )}
        <SlideSwipe partner={partner} slides={slides} onOpen={onOpen} />
        <SlideStack partner={partner} slides={slides} onOpen={onOpen} />
      </div>
    </section>
  )
}

function StageCopy({
  partner,
  deck,
  href,
  onOpen,
}: {
  partner: StorePartner
  deck: StorePartnerPresentation
  href: string
  onOpen: (event: MouseEvent<HTMLElement>, partner: StorePartner, index?: number) => void
}) {
  const count = deck.page_count ?? deck.slides?.length ?? 0
  const isPdf = isPartnerPdf(deck.file_url, deck.mime)
  return (
    <div className="px-copy">
      <p className="px-kicker">{formatRuInline(partner.name)}</p>
      <h2>{formatRuInline(deck.title)}</h2>
      {partner.description && !repeatsTitle(deck.title, partner.description) ? (
        <p>{formatRuInline(partner.description)}</p>
      ) : null}
      <p className="px-meta">
        <span>{isPdf ? partnersCopy.pdfLabel : partnersCopy.workKind}</span>
        {count > 0 ? <span>{partnersCopy.pages(count)}</span> : null}
      </p>
      <p className="px-actions">
        <Link href={href} className="px-watch" onClick={(event) => onOpen(event, partner, 0)}>
          {partnersCopy.viewPresentation}
          <span className="px-arrow" aria-hidden="true">
            →
          </span>
        </Link>
        {isPdf ? (
          <a className="px-quiet" href={deck.file_url} download>
            {partnersCopy.downloadFile}
          </a>
        ) : (
          <Link href={`/partners/${partner.slug}`} className="px-quiet">
            {partnersCopy.openCase}
          </Link>
        )}
      </p>
    </div>
  )
}

function SlideSwipe({
  partner,
  slides,
  onOpen,
}: {
  partner: StorePartner
  slides: EditorialSlide[]
  onOpen: (event: MouseEvent<HTMLElement>, partner: StorePartner, index?: number) => void
}) {
  return (
    <div className="px-swipe" aria-label={partnersCopy.viewPresentation}>
      {slides.map((slide, index) => (
        <button key={slide.src} type="button" onClick={(event) => onOpen(event, partner, index)}>
          <img src={slide.src} alt={slide.alt} decoding="async" loading="lazy" />
          <span>{formatRuInline(slide.title)}</span>
        </button>
      ))}
    </div>
  )
}

function SlideStack({
  partner,
  slides,
  onOpen,
}: {
  partner: StorePartner
  slides: EditorialSlide[]
  onOpen: (event: MouseEvent<HTMLElement>, partner: StorePartner, index?: number) => void
}) {
  return (
    <div className="px-stack">
      {slides.map((slide, index) => (
        <button key={slide.src} type="button" onClick={(event) => onOpen(event, partner, index)}>
          <img src={slide.src} alt={slide.alt} decoding="async" loading="lazy" />
        </button>
      ))}
    </div>
  )
}

function Plate({
  partner,
  slide,
  flip,
  portrait = false,
  onOpen,
}: {
  partner: StorePartner
  slide: EditorialSlide
  flip: boolean
  portrait?: boolean
  onOpen: (event: MouseEvent<HTMLElement>, partner: StorePartner, index?: number) => void
}) {
  const deck = deckOf(partner)
  const plateClass = ["px-plate", flip ? "is-flip" : "", portrait ? "is-portrait" : ""]
    .filter(Boolean)
    .join(" ")
  return (
    <section className={plateClass}>
      <figure className="px-mask" data-reveal>
        <div className="px-mask-clip">
          <img src={slide.src} alt={slide.alt} decoding="async" loading="lazy" />
        </div>
      </figure>
      <div className="px-plate-copy">
        <p className="px-kicker">{formatRuInline(partner.name)}</p>
        <h2>{formatRuInline(deck?.title || partner.name)}</h2>
        {partner.description && !repeatsTitle(deck?.title || partner.name, partner.description) ? (
          <p>{formatRuInline(partner.description)}</p>
        ) : null}
        {slide.caption && !repeatsTitle(deck?.title || partner.name, slide.caption) ? (
          <p>{formatRuInline(slide.caption)}</p>
        ) : null}
        {deck ? (
          <Link
            href={presentationHref(partner)}
            className="px-watch"
            onClick={(event) => onOpen(event, partner, 0)}
          >
            {partnersCopy.viewPresentation}
            <span className="px-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        ) : null}
      </div>
    </section>
  )
}

function WideProof({
  partner,
  slide,
  onOpen,
}: {
  partner: StorePartner
  slide: EditorialSlide
  onOpen: (event: MouseEvent<HTMLElement>, partner: StorePartner, index?: number) => void
}) {
  return (
    <section className="px-wide">
      <figure className="px-mask" data-reveal>
        <div className="px-mask-clip">
          <img src={slide.src} alt={slide.alt} decoding="async" loading="lazy" />
        </div>
      </figure>
      <div className="px-wide-copy">
        <p className="px-kicker">{formatRuInline(partner.name)}</p>
        <h2>{formatRuInline(partner.description || slide.title)}</h2>
        <Link
          href={presentationHref(partner)}
          className="px-watch"
          onClick={(event) => onOpen(event, partner, 0)}
        >
          {partnersCopy.viewPresentation}
          <span className="px-arrow" aria-hidden="true">
            →
          </span>
        </Link>
      </div>
    </section>
  )
}

function Roster({
  partners,
  onOpen,
}: {
  partners: StorePartner[]
  onOpen: (event: MouseEvent<HTMLElement>, partner: StorePartner, index?: number) => void
}) {
  return (
    <section className="px-roster-wrap" data-reveal aria-labelledby="px-roster-title">
      <h2 id="px-roster-title">{partnersCopy.backToIndex}</h2>
      <ol className="px-roster">
        {partners.map((partner) => {
          const deck = deckOf(partner)
          const showMark = partner.images.length === 0 && (partner.logo_url || hasPartnerMark(partner.slug))
          return (
            <li key={partner.id}>
              <Link
                href={`/partners/${partner.slug}`}
                className={showMark ? "px-roster-main has-mark" : "px-roster-main"}
              >
                {showMark ? (
                  <span className="px-roster-mark">
                    {partner.logo_url ? (
                      <img src={partner.logo_url} alt="" />
                    ) : (
                      <PartnerMark slug={partner.slug} name={partner.name} />
                    )}
                  </span>
                ) : null}
                <span className="px-roster-name">{formatRuInline(partner.name)}</span>
                {partner.description ? (
                  <span className="px-roster-desc">{formatRuInline(partner.description)}</span>
                ) : (
                  <span className="px-roster-desc" />
                )}
              </Link>
              {deck && slidesOf(partner).length > 0 ? (
                <Link
                  href={presentationHref(partner)}
                  className="px-watch px-watch--row"
                  onClick={(event) => onOpen(event, partner, 0)}
                >
                  {partnersCopy.viewPresentation}
                </Link>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
