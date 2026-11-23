/**
 * Thin wrapper over gifenc, shared by the GIF worker and the main-thread
 * fallback in src/lib/export.ts (save stage).
 */
import { GIFEncoder, applyPalette, quantize } from 'gifenc'

export type GifEncoder = ReturnType<typeof GIFEncoder>

export function createEncoder(): GifEncoder {
  return GIFEncoder()
}

/** Quantize one RGBA frame to its own 256-color palette and append it. */
export function encodeFrame(
  encoder: GifEncoder,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  delay: number,
): void {
  const palette = quantize(rgba, 256, { format: 'rgb565' })
  const index = applyPalette(rgba, palette, 'rgb565')
  encoder.writeFrame(index, width, height, { palette, delay, repeat: 0 })
}
