/**
 * Curated media for the «По проекту» landing (`/bespoke`), served from
 * `apps/storefront/public/bespoke/`.
 *
 * These are AI-generated illustrative service photos (measurer, material
 * samples, plan, woodworking, panelled interiors) - the media library has
 * no real photography of the bespoke process yet. They illustrate the
 * service, not specific products, and should be replaced with real shoots
 * when available.
 */

const P = "/bespoke"

export const bespokeMedia = {
  /** Hero: living room with classical wall panelling and walnut sideboard. */
  hero: {
    src: `${P}/hero-panels.jpg`,
    alt: "Гостиная со стеновыми панелями и комодом из массива ореха",
  },

  /** Process steps, in the order of bespokeLanding.processSteps. */
  process: [
    {
      src: `${P}/measure.jpg`,
      alt: "Замерщик снимает размеры стены лазерным дальномером",
      pos: "50% 32%",
    },
    {
      src: `${P}/samples.jpg`,
      alt: "Образцы отделок массива и ткани на столе рядом с планом комнаты",
      pos: "50% 45%",
    },
    {
      src: `${P}/plan.jpg`,
      alt: "План комнаты с размерами и спецификация на рабочем столе",
      pos: "50% 55%",
    },
    {
      src: `${P}/craftsman.jpg`,
      alt: "Мастер строгает дубовую филёнку ручным рубанком",
      pos: "50% 45%",
    },
  ],

  /** Final CTA: hallway with built-in olive wardrobe and wall panelling. */
  final: {
    src: `${P}/final-hallway.jpg`,
    alt: "Прихожая со встроенным шкафом и стеновыми панелями в оливковом цвете",
  },
} as const
