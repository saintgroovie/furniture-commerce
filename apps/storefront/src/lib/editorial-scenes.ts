export type EditorialProduct = {
  handle: string
  title: string
  href: string
  priceLabel: string | null
  actionLabel: string
}

export type EditorialSpot = {
  handle: string
  x: number
  y: number
  width: number
  height: number
}

export type EditorialScene = {
  src: string
  alt: string
  width: number
  height: number
  position?: readonly [number, number]
  spots: readonly EditorialSpot[]
}

/** Coordinates belong to these exact photographs, not to a mutable product hero. */
export const kidsEditorialScenes = {
  playroom: {
    src: "/editorial/kids/oliver-playroom.webp",
    alt: "Игровая зона Oliver: столик, стул, книги и игрушки",
    width: 1536, height: 1024, position: [0.55, 0.5],
    spots: [
      { handle: "ol-81-1", x: 49, y: 68, width: 14, height: 23 },
      { handle: "ol-82-1", x: 64, y: 78, width: 10, height: 23 },
    ],
  },
  nursery: {
    src: "/editorial/kids/oliver-nursery.webp",
    alt: "Светлая детская Oliver с кроваткой и мебелью для хранения",
    width: 1526, height: 1031, position: [0.5, 0.5],
    spots: [
      { handle: "ol-85-1", x: 36, y: 58, width: 27, height: 38 },
      { handle: "ol-82-1", x: 91, y: 72, width: 10, height: 22 },
    ],
  },
  rural: {
    src: "/editorial/kids/rural-scenery.webp",
    alt: "Роспись Сельский пейзаж на высоком комоде Вилли Винки",
    width: 1243, height: 1266, position: [0.64, 0.59],
    spots: [{ handle: "rs-05-3", x: 68, y: 61, width: 35, height: 45 }],
  },
} satisfies Record<string, EditorialScene>

export const roomEditorialScenes: Readonly<Record<string, EditorialScene>> = {
  "spalnya-cloud": {
    src: "/editorial/rooms/spalnya-cloud.jpg",
    alt: "Спальня Cloud из каталога Woodright",
    width: 1600, height: 1000,
    spots: [
      { handle: "greenwich-gr-12-1", x: 52, y: 67, width: 33, height: 32 },
      { handle: "greenwich-gr-67-1", x: 13, y: 68, width: 19, height: 23 },
      { handle: "greenwich-gr-08-1", x: 76, y: 70, width: 13, height: 18 },
    ],
  },
  "spalnya-greenwich": {
    src: "/editorial/rooms/spalnya-greenwich.jpg",
    alt: "Спальня Greenwich из каталога Woodright",
    width: 1500, height: 1000,
    spots: [
      { handle: "greenwich-gr-12-1", x: 45, y: 68, width: 42, height: 33 },
      { handle: "greenwich-gr-67-1", x: 30, y: 47, width: 27, height: 18 },
      { handle: "greenwich-gr-08-1", x: 86, y: 72, width: 17, height: 25 },
    ],
  },
}
