import { homeCopy } from "@/lib/woodright-copy"
import { formatRuInline } from "@/lib/format-ru-copy"
import { homeMedia } from "./home-media"

/**
 * Dark production section. Heading is the existing hero note («Собственное
 * производство: от массива до ручной отделки»), captions are the existing
 * wood block bullets — each paired with a tight material crop.
 */
type CraftMedia = { src: string; pos: string; zoom?: number; alt: string }

const CRAFT_MEDIA: CraftMedia[] = [
  { src: homeMedia.craftWood, pos: "50% 12%", alt: "Столешница рабочего стола из массива, тёмный орех" },
  { src: homeMedia.craftFinish, pos: "44% 40%", zoom: 1.9, alt: "Комод Greenwich в отделке графит, рифлёные фасады" },
  { src: homeMedia.craftHandpaint, pos: "38% 26%", zoom: 1.9, alt: "Ручная роспись на столешнице детского стола Oliver" },
  { src: homeMedia.craftSeries, pos: "50% 50%", alt: "Комод Greenwich в белой отделке" },
]

export function HomeCraft() {
  const note = homeCopy.hero.note
  const bullets = homeCopy.woodBlock.bullets
  return (
    <section className="hp-craft" aria-labelledby="hp-craft-title" data-reveal>
      <div className="hp-craft-inner hp-wrap">
        <div className="hp-craft-head">
          <h2 id="hp-craft-title" className="hp-section-title">
            {formatRuInline(note)}
          </h2>
          <span className="hp-craft-rule" aria-hidden="true" />
        </div>
        <ul className="hp-craft-grid">
          {bullets.map((bullet, i) => {
            const media = CRAFT_MEDIA[i]
            return (
              <li className="hp-craft-item" key={bullet} style={{ "--reveal-i": i } as React.CSSProperties}>
                {media && (
                  <span className="hp-craft-media">
                    <img
                      src={media.src}
                      alt={media.alt}
                      style={
                        {
                          objectPosition: media.pos,
                          ...(media.zoom ? { "--craft-zoom": media.zoom } : {}),
                        } as React.CSSProperties
                      }
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  </span>
                )}
                <span className="hp-craft-caption">
                  <span className="hp-index" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {formatRuInline(bullet)}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
