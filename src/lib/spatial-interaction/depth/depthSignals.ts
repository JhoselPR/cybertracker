import type { DepthDistances } from './types'

export const WRIST_TO_MIDDLE_INDEX = 1
export const INDEX_TO_PINKY_INDEX = 7
export const APPARENT_SCALE_MASK = (1 << WRIST_TO_MIDDLE_INDEX) | (1 << INDEX_TO_PINKY_INDEX)

export function median(values: number[] | Float64Array, count: number): number {
  for (let i = 1; i < count; i += 1) {
    const value = values[i]
    let j = i - 1
    while (j >= 0 && values[j] > value) {
      values[j + 1] = values[j]
      j -= 1
    }
    values[j + 1] = value
  }
  if (count === 0) return 0
  const middle = count >> 1
  return count % 2 ? values[middle] : (values[middle - 1] + values[middle]) * 0.5
}

export function apparentPalmScale(distances: DepthDistances, validMask: number, minimumDistance: number): number {
  if ((validMask & APPARENT_SCALE_MASK) !== APPARENT_SCALE_MASK) return 0
  const length = distances[WRIST_TO_MIDDLE_INDEX]
  const width = distances[INDEX_TO_PINKY_INDEX]
  if (!(length >= minimumDistance) || !(width >= minimumDistance)
    || !Number.isFinite(length) || !Number.isFinite(width)) return 0
  const scale = Math.sqrt(length * width)
  return Number.isFinite(scale) && scale > 0 ? scale : 0
}
