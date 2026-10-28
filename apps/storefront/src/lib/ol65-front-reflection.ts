/** Pixel-identical existing original, owner-requested horizontal display only. */
export const OL65_ORIGINAL_FRONT = "/product-static/imports/WR-PFW-20260721T020528Z/4d684e60dddd51d91391e9f278372ed9cb9c49c39f91e83c6965cc38b705d3b1.jpg"
export const OL65_LEFT_REFLECTED_FRONT = `${OL65_ORIGINAL_FRONT}#ol65-left-front-mirror`
export function isReflectedOliverDeskFront(src: string): boolean {
  return src === OL65_LEFT_REFLECTED_FRONT
}
