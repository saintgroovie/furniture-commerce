/**
 * Real Woodright podium photography for `/contacts`.
 * Graded stills from the Khimki showroom. Not catalog renders.
 * Large file is the retina source; `-w800` / `-w640` is the smaller srcset candidate.
 */

const P = "/editorial/contacts"

export type PodiumFrame = {
  id: string
  alt: string
  width: number
  height: number
  webp: string
  avif: string
  smallWebp: string
  smallAvif: string
  smallWidth: number
}

function frame(
  id: string,
  alt: string,
  width: number,
  height: number,
  smallWidth: number,
  smallSuffix: string,
): PodiumFrame {
  return {
    id,
    alt,
    width,
    height,
    webp: `${P}/${id}.webp`,
    avif: `${P}/${id}.avif`,
    smallWebp: `${P}/${id}-${smallSuffix}.webp`,
    smallAvif: `${P}/${id}-${smallSuffix}.avif`,
    smallWidth,
  }
}

export const showroomPodiumMedia = {
  hero: frame(
    "woodright-showroom-podium-01",
    "Подиум Woodright в МТК «Гранд»: светлая экспозиция мебели и вывеска шоурума",
    1280,
    720,
    800,
    "w800",
  ),
  wardrobe: frame(
    "woodright-showroom-podium-02",
    "Шкаф с росписью на подиуме Woodright под вывеской шоурума",
    1140,
    855,
    800,
    "w800",
  ),
  creamBedroom: frame(
    "woodright-showroom-podium-03",
    "Светлая спальня на подиуме: комод, овальное зеркало и кровать",
    1240,
    930,
    800,
    "w800",
  ),
  kids: frame(
    "woodright-showroom-podium-04",
    "Детская экспозиция на подиуме: шкаф с росписью, кровать и высокий комод",
    1260,
    944,
    800,
    "w800",
  ),
  bed: frame(
    "woodright-showroom-podium-05",
    "Кровать с серым изголовьем, этажерка и комод с росписью на подиуме Woodright",
    768,
    960,
    640,
    "w640",
  ),
  alcove: frame(
    "woodright-showroom-podium-06",
    "Зона спальни на подиуме Woodright: комод, кровать и проход в соседнюю экспозицию",
    1180,
    885,
    800,
    "w800",
  ),
} as const
