/**
 * ml5.js loader.
 *
 * ml5 1.x is loaded from a pinned CDN script on first use (not bundled: it
 * ships TensorFlow.js and is large). Pinned to 1.3.1, which works with p5 1.x.
 *
 *   const ml5 = await loadMl5()
 *   const faceMesh = ml5.faceMesh({ maxFaces: 1, flipped: true })
 *
 * Call loadMl5() early (e.g. when the Start button is clicked) to warm it up.
 * It rejects if the script fails to load; show the "model load failed" error.
 * A rejected call can be retried (the cached promise is cleared).
 */
export const ML5_VERSION = '1.3.1'
const SOURCES = [
  `https://unpkg.com/ml5@${ML5_VERSION}/dist/ml5.min.js`,
  `https://cdn.jsdelivr.net/npm/ml5@${ML5_VERSION}/dist/ml5.min.js`,
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ml5 = any

let promise: Promise<Ml5> | null = null

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = src
    el.async = true
    el.crossOrigin = 'anonymous'
    el.onload = () => resolve()
    el.onerror = () => {
      el.remove()
      reject(new Error(`ml5 failed to load from ${src}`))
    }
    document.head.appendChild(el)
  })
}

export function loadMl5(): Promise<Ml5> {
  if (window.ml5) return Promise.resolve(window.ml5)
  if (promise) return promise
  promise = (async () => {
    let lastErr: unknown
    for (const src of SOURCES) {
      try {
        await injectScript(src)
        if (window.ml5) return window.ml5
      } catch (err) {
        lastErr = err
      }
    }
    promise = null
    throw lastErr ?? new Error('ml5 not available')
  })()
  return promise
}
