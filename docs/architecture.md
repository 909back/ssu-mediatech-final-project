# Dotori 4Cut: architecture and agent contract

This file wins over `docs/agent-brief.md` where they differ. The approved flow is `docs/user-flow.md`.

## Stack

| Package | Version | Notes |
|---|---|---|
| vite | ^8.3 | `npm run dev`; `npm run build` = `tsc -b && vite build` |
| typescript | ~7.0 | strict; `tsconfig.app.json` (src), `tsconfig.node.json` (vite.config.ts). `allowJs` is on only so leftover .js files still build; new code is .ts/.tsx |
| react / react-dom | ^19.3 | TSX |
| tailwindcss + @tailwindcss/vite | ^4.3 | config lives in `src/index.css` (`@theme inline`) |
| shadcn/ui | CLI latest, `tsx: true`, style new-york | components in `src/components/ui/` |
| radix-ui, class-variance-authority, clsx, tailwind-merge, lucide-react, sonner, tw-animate-css | latest | shadcn dependencies |
| p5 + @types/p5 | ^1.11 / ^1.7 | instance mode only, through `P5Canvas`. Do not upgrade to 2.x (ml5 breaks) |
| ml5 | 1.3.1 (CDN) | loaded on demand by `src/lib/ml5.ts`, not bundled; `window.ml5: any` declared in `src/types/ml5.d.ts` |
| motion | ^14 | `import { animate } from 'motion'` or `motion/react` |
| zustand | ^5 | `src/store/useApp.ts` |

Path alias: `@/` = `src/` (vite.config.ts + tsconfig paths). Font: Pretendard Variable, self-hosted (`src/assets/fonts/PretendardVariable.woff2`, `@font-face` in `src/styles/fonts.css`).

## Folder ownership

| Owner | Files |
|---|---|
| foundation | `src/store/useApp.ts`, `src/lib/layouts.ts`, `src/lib/camera.ts`, `src/hooks/useCamera.ts`, `src/lib/ml5.ts`, `src/lib/motion.ts`, `src/lib/utils.ts`, `src/types/**`, `src/components/P5Canvas.tsx`, `src/components/shell/**`, `src/components/ui/**`, `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/styles/**`, `src/assets/fonts/**`, `index.html`, `package.json`, `tsconfig*.json`, `vite.config.ts` |
| start | `src/screens/start/**` |
| frame | `src/screens/frame/**` |
| shoot | `src/screens/shoot/**`, `src/lib/gesture.ts`, `src/lib/face.ts` |
| decorate | `src/screens/decorate/**`, `src/lib/compose.ts`, `src/lib/cutout.ts`, `src/lib/filters.ts` |
| save | `src/screens/save/**`, `src/lib/export.ts` |

Rules for shared files:
- The store may be extended by stage agents only by APPENDING in the four marked blocks: the type in `AppState` / `AppActions`, the value in `initialState()`, the implementation in `create()`. Wrap your block in a comment with your stage name. Never rename or remove existing keys.
- Other shared files: do not edit. If you need a change, write it in your report and the lead routes it to foundation.
- Need a new npm package: `npm i <pkg>`; never hand-edit `package.json`.
- A stage may add private components inside its own folder (for example `src/screens/shoot/CountdownRing.tsx`).

## Entry points

`App.tsx` renders `src/screens/<stage>/<Stage>Screen.tsx` (default export, no props; imported extensionless) from `store.screen`, inside `AppShell`:
- `AppShell` = 56 px header (horizontal logo, step indicator from `frame` on) + `<main>` that fills the rest of the 1280x800 viewport. Your screen root should be `h-full` and must not scroll the page.
- `App` wraps everything in shadcn `TooltipProvider` and mounts one `<Toaster />` (sonner). Show toasts with `import { toast } from 'sonner'`.
- Screens are keyed by name, so each screen mounts fresh when you `goTo` it.

## Store shape (`src/store/useApp.ts`)

Exported types: `Screen`, `CameraStatus`, `LayoutId`, `FaceFilter`, `ThemeId`, `ClipFrame`, `Shot`, `Sticker`, `Decor`, `AppState`, `AppActions`, `AppStore`. Import with `import { useApp, type Shot } from '@/store/useApp'`.

```js
{
  screen: 'start',            // 'start'|'frame'|'shoot'|'decorate'|'save'
  cameraStatus: 'idle',       // 'idle'|'requesting'|'ready'|'denied'|'notfound'|'error'
  layoutId: '1x4',            // '1x4'|'2x3'|'2x4'
  eightShotMode: false,       // 2x4 only
  shots: [null, null, null, null], // (Shot|null)[], length = shotCount(layout, eightShotMode)
  faceFilter: 'none',         // 'none'|'dog'|'glasses'|'blush'
  gestureEnabled: true,
  decor: {
    theme: 'basic',           // 'basic'|'forest'|'campus'|'retro'
    frameColor: '#ffffff',
    bgImage: null,            // dataURL or /brand path, null = solid frameColor
    colorFilter: 'none',      // ids defined in src/lib/filters.ts
    dateOn: true,
    text: '',
    stickers: [],             // { id, src, x, y, scale, rotation, z }, x/y = center in layout px
  },
}
// Shot = { image: string (dataURL, mirrored, face filter baked in), clip: ClipFrame[] (~1.5 s, for GIF/WebM) }
// ClipFrame = string | ImageBitmap | HTMLCanvasElement  (shoot picks; compose/export must accept all three)
```

Actions: `goTo(screen)`, `setCameraStatus(s)`, `setLayout(id)` and `setEightShotMode(bool)` (both reset `shots` to the right length), `setShot(i, shot)`, `retake(i)`, `clearShots()`, `setFaceFilter(f)`, `setGestureEnabled(b)`, `updateDecor(patch)`, `addSticker(st)`, `updateSticker(id, patch)`, `removeSticker(id)`, `reset()` (back to Start, clears everything except camera status).

Selectors: `selectLayout`, `selectShotCount`, `selectAllShotsTaken`, `selectNextEmptyIndex`, and `SCREENS` (flow order). Use selectors in components (`useApp((s) => s.shots)`); in p5 sketches and lib code use `useApp.getState()`.

## Shared modules

- `layouts.ts`: types `Layout`, `LayoutId`, `Rect`, `CellRect`. `LAYOUTS`, `LAYOUT_IDS`, `getLayout(id)`, `shotCount(layout, eight)`, `cellRects(layout, eight)` returns `{x, y, w, h, shotIndex}[]` in reading order, `footerRect(layout)`, `cellAspect(layout, eight)`. 2x4 without eightShotMode has 8 cells but 4 shots: row r shows shot r in both columns (two identical strips, the classic cut-in-half print). Geometry (pad, gap, footer band) is data in `LAYOUTS`; pure functions, no DOM.
- `camera.ts`: `startCamera()` (idempotent, one shared stream, writes `cameraStatus`), `getStream()`, `stopCamera()`, `errorToStatus(err)`. NotAllowedError/SecurityError = `denied`; NotFoundError/OverconstrainedError = `notfound`; anything else = `error`. The stream is not mirrored.
- `useCamera({ autoStart = true })` returns `{ videoRef, videoEl, status, retry }`. Put `ref={videoRef}` on a `<video muted playsInline autoPlay className="-scale-x-100">` for the mirror preview. Pass `videoEl.current` to p5/ml5 and flip there. Start uses `autoStart: false` and calls `retry()` on the button.
- `ml5.ts`: `loadMl5()` resolves with `window.ml5` (pinned 1.3.1, unpkg with jsdelivr fallback); rejects on failure so Start can show "model load failed" with a retry. Call it early to warm up.
- `P5Canvas.tsx`: `<P5Canvas<Props> sketch={sketch} className onReady={(p) => ...} {...props} />` with `const sketch: Sketch<Props> = (p, propsRef) => {...}` (types `Sketch`, `SketchProps`, `P5CanvasProps` exported; `p` is a typed `p5` instance). Read `propsRef.current` inside `draw()` for the latest props. Define `sketch` at module level: a new function identity recreates the instance. StrictMode safe.
- `motion.ts`: `prefersReducedMotion()`.
- `compose.ts` (decorate owns it): `composeLayout(shots, layout, decor, { eightShotMode, frameIndex, scale }) => Promise<HTMLCanvasElement>`. The contract is in the file header. Save depends on it, so keep the signature.

## Design tokens

- Palette: exact Radix custom export for accent #7B481E in `src/styles/radix-palette.css` (copy of `docs/radix-palette.css`), imported by `src/index.css` together with `src/styles/fonts.css`. Scales: `--brand-1..12`, `--brand-a1..a12`, `--brand-contrast`, `--gray-1..12`, `--gray-a1..a12`. Tailwind utilities: `bg-brand-3`, `text-gray-11`, `border-gray-6`, and so on.
- shadcn mapping: `--primary` = brand-9, `--primary-foreground` = brand-contrast, `--ring` = brand-8. Everything else is the Radix gray family: background/card/popover white, foreground gray-12, secondary and muted gray-3, muted-foreground gray-11, accent (shadcn hover surface) gray-4, border gray-6, input gray-7. Note shadcn's `--accent` is a neutral hover color, not the brand.
- Light mode only. No dark palette has been exported, so there is no `.dark` block and the sonner toaster is forced to light. Add dark mode later by pasting a dark export and adding a `.dark` block in `src/index.css`.

## Conventions

- UI copy is Korean, short and plain. Never use the middle dot "·" in Korean text. No emoji as icons (use lucide-react).
- Brand color only on the primary action of each screen and the main-flow CTA. Selected states elsewhere (layout cards, tabs, toggles, filter chips) use neutral: foreground/gray-12 border or `bg-gray-3`.
- No literal hex colors in components. Use theme classes or CSS vars. (Canvas drawing code may use hex where the color is part of the output image.)
- Animation: transform and opacity only. Every animation checks `prefersReducedMotion()` (JS) or is covered by the global reduced-motion CSS rule.
- Every interactive element has a visible focus style. shadcn components already do; a global `:focus-visible` outline covers plain elements. Do not remove outlines.
- Target viewport 1280x800 in Chrome. No page scroll; the camera or photo is the hero of every screen.
- Brand assets: `public/brand/` = `logo-horizontal.svg`, `logo-vertical.svg`, `wordmark.svg`, `character.png`, `face.png` (transparent PNGs), `logo-character.jpg`, `sample-hug.jpg`, `sample-vsign.jpg`, `sample-cheeks.jpg`, `sample-wink.jpg`, `sample-strip.png`. Reference them as `/brand/<name>`.
- TypeScript strict: no `any` except `window.ml5`; no `@ts-ignore`. Prefer the exported store/layout types over re-declaring shapes.
- Run `npm run build` (type check + bundle) before reporting. Do not start a dev server.
