import type { PodiumFrame } from "@/lib/showroom-podium-media"

/** Retouched real showroom photographs; the first panorama has extended sides. */
export const showroomCarouselFrames: readonly PodiumFrame[] = [
  {
    "id": "panorama",
    "alt": "Панорама шоурума Woodright: шкаф с цветочной росписью и вывеска",
    "width": 1920,
    "height": 800,
    "smallWidth": 800,
    "webp": "/editorial/contacts/professional/panorama.webp",
    "avif": "/editorial/contacts/professional/panorama.avif",
    "smallWebp": "/editorial/contacts/professional/panorama-w800.webp",
    "smallAvif": "/editorial/contacts/professional/panorama-w800.avif"
  },
  {
    "id": "exposition",
    "alt": "Общий вид экспозиции Woodright в МТК «Гранд»",
    "width": 1672,
    "height": 941,
    "smallWidth": 800,
    "webp": "/editorial/contacts/professional/exposition.webp",
    "avif": "/editorial/contacts/professional/exposition.avif",
    "smallWebp": "/editorial/contacts/professional/exposition-w800.webp",
    "smallAvif": "/editorial/contacts/professional/exposition-w800.avif"
  },
  {
    "id": "bedroom",
    "alt": "Светлая спальня: кровать, комод и овальное зеркало",
    "width": 1448,
    "height": 1086,
    "smallWidth": 800,
    "webp": "/editorial/contacts/professional/bedroom.webp",
    "avif": "/editorial/contacts/professional/bedroom.avif",
    "smallWebp": "/editorial/contacts/professional/bedroom-w800.webp",
    "smallAvif": "/editorial/contacts/professional/bedroom-w800.avif"
  },
  {
    "id": "kids",
    "alt": "Детская мебель с авторской росписью в шоуруме Woodright",
    "width": 1449,
    "height": 1085,
    "smallWidth": 800,
    "webp": "/editorial/contacts/professional/kids.webp",
    "avif": "/editorial/contacts/professional/kids.avif",
    "smallWebp": "/editorial/contacts/professional/kids-w800.webp",
    "smallAvif": "/editorial/contacts/professional/kids-w800.avif"
  },
  {
    "id": "bed",
    "alt": "Кровать с мягким изголовьем и светлая этажерка",
    "width": 1122,
    "height": 1402,
    "smallWidth": 800,
    "webp": "/editorial/contacts/professional/bed.webp",
    "avif": "/editorial/contacts/professional/bed.avif",
    "smallWebp": "/editorial/contacts/professional/bed-w800.webp",
    "smallAvif": "/editorial/contacts/professional/bed-w800.avif"
  },
  {
    "id": "alcove",
    "alt": "Спальная зона Woodright и соседняя экспозиция",
    "width": 1448,
    "height": 1086,
    "smallWidth": 800,
    "webp": "/editorial/contacts/professional/alcove.webp",
    "avif": "/editorial/contacts/professional/alcove.avif",
    "smallWebp": "/editorial/contacts/professional/alcove-w800.webp",
    "smallAvif": "/editorial/contacts/professional/alcove-w800.avif"
  }
]

/** Wide views first, followed by paired photographs of the showroom interiors. */
export const showroomCarouselSlides = [
  {
    id: "panorama",
    label: showroomCarouselFrames[0].alt,
    frames: showroomCarouselFrames.slice(0, 1),
  },
  {
    id: "exposition",
    label: showroomCarouselFrames[1].alt,
    frames: showroomCarouselFrames.slice(1, 2),
  },
  {
    id: "interiors",
    label: "Светлая спальня и детская мебель с авторской росписью",
    frames: showroomCarouselFrames.slice(2, 4),
  },
  {
    id: "bedrooms",
    label: "Мягкая кровать и спальная экспозиция Woodright",
    frames: showroomCarouselFrames.slice(4, 6),
  },
] as const
