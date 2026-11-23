# Stage agent brief (shared by all stage agents)

Project root: the repository root
Read first: `docs/user-flow.md` (approved flow, follow it exactly). If `docs/architecture.md` exists, read it too; it wins over this file where they differ.

## Stack (fixed)
Vite + React + TypeScript (strict; .ts/.tsx). Changed from JS on 2026-11-23 by the user: write every new file as .ts/.tsx, and convert any .js/.jsx file you own, Tailwind v4, shadcn/ui (components in `src/components/ui/`), p5.js 1.x instance mode, ml5.js 1.x (faceMesh, handPose), `motion` package for animation, zustand store. Path alias `@/` = `src/`. Light mode only. Target viewport 1280x800, Chrome on a laptop.

## Running in parallel with the foundation agent
A foundation agent is still finishing the shared layer at the same time as you. Shared files it owns:
`src/store/useApp.js`, `src/lib/layouts.js`, `src/lib/camera.js` (+ hook), `src/components/P5Canvas.jsx`, `src/App.jsx`, `src/main.jsx`, `src/index.css`, `src/styles/*`, `src/components/ui/*`, `package.json`.
- Do not create or rewrite those files. If one does not exist yet, check again a bit later (it is being written); meanwhile code against the contract below.
- Once `src/store/useApp.js` exists you may APPEND fields/actions you need (never rename or remove). Keep appended code in a clearly commented block with your stage name.
- If you need a new npm package, install it with `npm i <pkg>` (do not hand-edit package.json).
- Never run `npm run dev` (the lead runs the dev server). You may run `npm run build` to check your work.

## Contract (until architecture.md says otherwise)
- Store `useApp` (zustand): `screen` ('start'|'frame'|'shoot'|'decorate'|'save'), `camera` status ('idle'|'requesting'|'ready'|'denied'|'notfound'|'error'), `layoutId` ('1x4'|'2x3'|'2x4'), `eightShotMode`, `shots` (array per cell of `{ image: dataURL, clip: frames[] }` or null), `faceFilter` ('none'|'dog'|'glasses'|'blush'), `gestureEnabled`, `decor` `{ theme, frameColor, bgImage, colorFilter, dateOn, text, stickers: [{id, src, x, y, scale, rotation, z}] }`, actions such as `goTo(screen)`, `setShot(i, shot)`, `retake(i)`, `reset()`.
- `src/lib/layouts.js`: layouts 1x4 (600x1800, 4 shots), 2x3 (1200x1800, 6), 2x4 (1200x1800, 4 or 8 with eightShotMode); `cellRects(layout)` returns pixel rects.
- `src/components/P5Canvas.jsx`: `<P5Canvas sketch={(p, propsRef) => {...}} {...props} />`, instance mode, StrictMode safe.
- `src/lib/camera.js`: one shared getUserMedia stream for the whole app.
- Each stage's entry component is the default export of `src/screens/<stage>/<Stage>Screen.tsx` (StartScreen, FrameScreen, ShootScreen, DecorateScreen, SaveScreen). App.jsx renders it from `screen`.

- Import without file extensions (e.g. `@/store/useApp`) so JS-to-TS renames never break imports.

## Design rules
- Use shadcn/ui components and the existing tokens. No literal hex colors in components; use Tailwind theme classes / CSS vars. Brand scale is `--brand-1..12` (Radix, accent #7B481E), grays are `--gray-1..12`.
- Brand (primary) color ONLY on the main-flow primary action of each screen. Other selected states use neutral foreground/gray.
- Korean UI copy, short and plain. Never use the middle dot "·" in Korean text. No emoji as icons (use lucide-react, already a shadcn dependency). No tracked all-caps labels, no eyebrow labels.
- Every interactive element has a visible `:focus-visible` style. Animate transform/opacity only, never width/height/top/left, and give each animation a `prefers-reduced-motion` fallback.
- No invented numbers or testimonials. Brand assets live in `public/brand/` (logo-horizontal.svg, logo-vertical.svg, wordmark.svg, character.png, face.png, sample-*.jpg, sample-strip.png).
- Screens must fit 1280x800 with no page scroll. Avoid generic template layouts: the camera/photo is the hero of every screen.

## When done
Run `npm run build` (must pass for your files). Report: files you created, store fields you appended, anything another stage must know (especially exported function contracts), and open issues.
