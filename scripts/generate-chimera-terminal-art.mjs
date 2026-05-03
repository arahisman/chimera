#!/usr/bin/env node
import sharp from 'sharp'
import { resolve } from 'node:path'

const source = resolve(
  process.cwd(),
  'docs/assets/chimera-terminal-mascot-reference.png',
)

const quadrantGlyphs = {
  0: ' ',
  1: '▘',
  2: '▝',
  3: '▀',
  4: '▖',
  5: '▌',
  6: '▞',
  7: '▛',
  8: '▗',
  9: '▚',
  10: '▐',
  11: '▜',
  12: '▄',
  13: '▙',
  14: '▟',
  15: '█',
}

const brailleBits = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
]

const crops = {
  status: {
    target: [8, 3],
    crop: { left: 169, top: 261, width: 58, height: 47 },
    threshold: 0.55,
  },
  welcome: {
    target: [18, 7],
    crop: { left: 169, top: 261, width: 58, height: 47 },
    threshold: 0.55,
  },
  banner: {
    target: [18, 7],
    crop: { left: 169, top: 261, width: 58, height: 47 },
    threshold: 0.55,
  },
  running: [
    { left: 43, top: 806, width: 135, height: 82 },
    { left: 188, top: 806, width: 135, height: 82 },
    { left: 333, top: 806, width: 135, height: 82 },
    { left: 488, top: 806, width: 135, height: 82 },
    { left: 643, top: 806, width: 135, height: 82 },
    { left: 768, top: 806, width: 135, height: 82 },
    { left: 893, top: 806, width: 135, height: 82 },
    { left: 1018, top: 806, width: 135, height: 82 },
  ],
}

function isCreamPixel(r, g, b) {
  return r > 150 && g > 135 && b > 95 && Math.abs(r - g) < 90 && r > b + 15
}

async function convert(crop, columns, rows, threshold = 0.14) {
  const { data, info } = await sharp(source)
    .extract(crop)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const lines = []

  for (let row = 0; row < rows; row++) {
    let line = ''
    for (let column = 0; column < columns; column++) {
      let mask = 0
      for (let quadrantY = 0; quadrantY < 2; quadrantY++) {
        for (let quadrantX = 0; quadrantX < 2; quadrantX++) {
          const x0 = Math.floor(
            (column + quadrantX / 2) * (info.width / columns),
          )
          const x1 = Math.floor(
            (column + (quadrantX + 1) / 2) * (info.width / columns),
          )
          const y0 = Math.floor((row + quadrantY / 2) * (info.height / rows))
          const y1 = Math.floor(
            (row + (quadrantY + 1) / 2) * (info.height / rows),
          )
          let hit = 0
          let total = 0

          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const offset = (y * info.width + x) * info.channels
              if (isCreamPixel(data[offset], data[offset + 1], data[offset + 2])) {
                hit++
              }
              total++
            }
          }

          if (hit / total > threshold) {
            mask |= (quadrantY ? 4 : 1) << quadrantX
          }
        }
      }
      line += quadrantGlyphs[mask]
    }
    lines.push(line)
  }

  return lines
}

async function convertBraille(crop, columns, rows, threshold = 0.55) {
  const { data, info } = await sharp(source)
    .extract(crop)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const lines = []

  for (let row = 0; row < rows; row++) {
    let line = ''
    for (let column = 0; column < columns; column++) {
      let mask = 0
      for (let subY = 0; subY < 4; subY++) {
        for (let subX = 0; subX < 2; subX++) {
          const x0 = Math.floor((column + subX / 2) * (info.width / columns))
          const x1 = Math.floor(
            (column + (subX + 1) / 2) * (info.width / columns),
          )
          const y0 = Math.floor((row + subY / 4) * (info.height / rows))
          const y1 = Math.floor(
            (row + (subY + 1) / 4) * (info.height / rows),
          )
          let hit = 0
          let total = 0

          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const offset = (y * info.width + x) * info.channels
              if (isCreamPixel(data[offset], data[offset + 1], data[offset + 2])) {
                hit++
              }
              total++
            }
          }

          if (hit / total > threshold) {
            mask |= brailleBits[subY][subX]
          }
        }
      }
      line += mask ? String.fromCharCode(0x2800 + mask) : ' '
    }
    lines.push(line)
  }

  return lines
}

function convertConfigured(config) {
  const converter = config.mode === 'braille' ? convertBraille : convert
  return converter(config.crop, config.target[0], config.target[1], config.threshold)
}

function printRows(name, rows, indent = '') {
  console.log(name ? `${indent}${name}: [` : `${indent}[`)
  for (const row of rows) {
    console.log(`${indent}  ${JSON.stringify(row)},`)
  }
  console.log(`${indent}],`)
}

const status = await convertConfigured(crops.status)
const welcome = await convertConfigured(crops.welcome)
const banner = await convertConfigured(crops.banner)
const running = []
for (const crop of crops.running) {
  running.push(await convert(crop, 18, 5))
}

console.log('// Generated from docs/assets/chimera-terminal-mascot-reference.png')
printRows('STATUS_FRAME', status)
printRows('WELCOME_ROWS', welcome)
printRows('BANNER_ROWS', banner)
console.log('RUNNING_FRAMES: [')
for (const frame of running) {
  printRows('', frame, '  ')
}
console.log('],')
