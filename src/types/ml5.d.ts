// ml5 is loaded at runtime from a CDN script (see src/lib/ml5.ts) and has no
// published types. Keep this minimal; type the parts you use locally if needed.
export {}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ml5: any
  }
}
