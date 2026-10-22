import { homeCopy } from "@/lib/woodright-copy"
import { formatRuInline } from "@/lib/format-ru-copy"
import { homeMedia } from "./home-media"
import { HomeImg } from "./home-img"

/**
 * Dark production section. Heading is the existing hero note («Собственное
 * производство: от массива до ручной отделки»), captions are the existing
 * wood block bullets — paired with distinct catalog details and room scenes.
 */
type CraftMedia = { src: string; pos: string; alt: string }

const CRAFT_MEDIA: CraftMedia[] = [
  { src: homeMedia.craftWood, pos: "42% 28%", alt: "Деревянное обрамление и ножка консоли Greenwich с видимой фактурой" },
  { src: homeMedia.craftFinish, pos: "48% 63%", alt: "Расписной фасад и открытый ящик комода Templers" },
  { src: homeMedia.craftKids, pos: "52% 68%", alt: "Детская Муравьиная деревня: кроватка и комод с росписью" },
  { src: homeMedia.craftSeries, pos: "10% 58%", alt: "Комплект Oliver: шкаф, кровать, тумба и комод в одном интерьере" },
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
                    <HomeImg
                      surface="LIFESTYLE_BLOCK"
                      src={media.src}
                      alt={media.alt}
                      style={{ objectPosition: media.pos }}
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
