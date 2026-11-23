// Minimal types for gifenc 1.x (no bundled typings). Save stage.
declare module 'gifenc' {
  type Format = 'rgb565' | 'rgb444' | 'rgba4444'
  type Palette = number[][]
  interface Encoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: { palette?: Palette; delay?: number; repeat?: number; transparent?: boolean },
    ): void
    finish(): void
    bytes(): Uint8Array
  }
  export function GIFEncoder(opts?: { auto?: boolean }): Encoder
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: { format?: Format }): Palette
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: Format): Uint8Array
}
