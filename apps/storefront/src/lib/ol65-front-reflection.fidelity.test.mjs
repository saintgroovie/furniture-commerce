import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
const require = createRequire(import.meta.url)
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const Module = require('node:module')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const originalResolve = Module._resolveFilename
Module._resolveFilename = function(specifier, parent, ...rest) {
  return originalResolve.call(this, specifier.startsWith('@/') ? path.join(root, specifier.slice(2)) : specifier, parent, ...rest)
}
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, filename)
}
const { oliverDeskMedia } = require('./oliver-desk-variants.ts')
const { OL65_ORIGINAL_FRONT, OL65_LEFT_REFLECTED_FRONT, isReflectedOliverDeskFront } = require('./ol65-front-reflection.ts')
const base = '/product-static/imports/WR-PFW-20260721T020528Z/'
const left = ['0e8dbdc6733f2d174e3d041d33bc25738aa61a8871c1e24e404afd6baeb51df1.jpg', '5eef871cfb0c0fa19676f75ee530dea350e2fc91f5ebf7a105bff40ae129a226.jpg', '5dd23f6fb646801093d800284cee4bd6823e7253bb56ef406362849bc07b16b1.jpg'].map(x => base + x)
const right = ['25cc40df99f115319a41da4dacea181ec29b7c449e13ec65a134769398ab9774.jpg', '4d684e60dddd51d91391e9f278372ed9cb9c49c39f91e83c6965cc38b705d3b1.jpg', '11dac192d1200d59787cfd94aef71f5cea6f00be334bc31d074baf4c58d22338.jpg', 'e8512abd9e52fb25ad02b5352c6c030ee081da3bc1263a4fbb6eeb61dfc2908f.jpg'].map(x => base + x)
const desk = { materials: [], choices: [
  { id: 'variant_01KNTBXBMK8E3CDX35TG4AWGYN', sku: 'OL-65-1', hero: right[0], gallery: right },
  { id: 'variant_01KY5SEYMYFBSA6FTYH9J8B3ZR', sku: 'OL-65-2', hero: left[0], gallery: left },
] }
const all = [...left, ...right]
const l = oliverDeskMedia(desk, desk.choices[1].id, all[0], all.slice(1))
assert.deepEqual([l.mainSrc, ...l.extraSrcs], [...left, OL65_LEFT_REFLECTED_FRONT])
const r = oliverDeskMedia(desk, desk.choices[0].id, all[0], all.slice(1))
assert.deepEqual([r.mainSrc, ...r.extraSrcs], right)
const missingFront = all.filter(url => url !== OL65_ORIGINAL_FRONT)
const absent = oliverDeskMedia(desk, desk.choices[1].id, missingFront[0], missingFront.slice(1))
assert.deepEqual([absent.mainSrc, ...absent.extraSrcs], left)
assert.equal(new URL(OL65_LEFT_REFLECTED_FRONT, 'https://woodright.ru').pathname, OL65_ORIGINAL_FRONT)
assert(isReflectedOliverDeskFront(OL65_LEFT_REFLECTED_FRONT))
assert(!isReflectedOliverDeskFront(OL65_ORIGINAL_FRONT))
assert(!isReflectedOliverDeskFront('/other.jpg#ol65-left-front-mirror'))
const css = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8')
assert(css.includes(`img[src="${OL65_LEFT_REFLECTED_FRONT}"] {\n  scale: -1 1;`))
const lightbox = fs.readFileSync(path.join(root, 'components/pdp-image-lightbox.tsx'), 'utf8')
assert(lightbox.includes('mirroredFront ? -offset.x : offset.x'))
assert(lightbox.includes('[offset.x, offset.y, zoom, dragging, mirroredFront]'))
console.log(JSON.stringify({ status: 'PASS_NEW_LEFT_FRONT_REFLECTION_ONLY', leftFrames: 4, priorLeftFrames: 3, rightFramesUnchanged: 4,
  identity: 'LEFT OL-65-2 variant_01KY5SEYMYFBSA6FTYH9J8B3ZR; supplied visible URL variant_01KNTBXBMK8E3CDX35TG4AWGYN is RIGHT OL-65-1',
  bitmap: 'same original URL, hash is presentation-only; no new pixels', geometry: 'individual scale composes with zoom; pan X compensated', noOldCasesRepeated: true }))
