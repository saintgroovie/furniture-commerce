"use client"

/**
 * Мост между галереей PDP и кнопкой «В корзину».
 *
 * Выбор исполнения (цвет/отделка/дерево/обивка/изголовье) живёт внутри
 * ProductCardMediaGalleryCore и не является Medusa-вариантом (у всех товаров
 * ровно один variant). Чтобы корзина знала, в каком цвете товар положили,
 * галерея в PDP-режиме публикует сюда текущий выбор, а ProductCta читает его
 * в момент add-to-cart и передаёт в line item `metadata`.
 *
 * Модульный синглтон достаточен: в один момент времени смонтирована ровно
 * одна PDP; при размонтировании галерея очищает выбор.
 */

export type PdpExecutionSpec = { label: string; value: string }

export type PdpExecutionSelection = {
  /** Hero-фото, соответствующее выбранному исполнению. */
  imageSrc?: string
  /** Пары «Цвет: Молочный», «Дерево: Дуб» — только реально показанные селекторы. */
  specs: PdpExecutionSpec[]
}

let current: PdpExecutionSelection | null = null

export function publishPdpExecutionSelection(selection: PdpExecutionSelection): void {
  current = selection
}

export function clearPdpExecutionSelection(): void {
  current = null
}

export function readPdpExecutionSelection(): PdpExecutionSelection | null {
  return current
}
