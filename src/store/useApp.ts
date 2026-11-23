/**
 * Shared app state (zustand). Owned by foundation.
 *
 * Stage agents: you may APPEND fields/actions in the marked blocks (add the
 * type to the interface AND the value/implementation below). Never rename or
 * remove existing ones; other screens read them. Label your block with your stage.
 *
 * In a component (select only what you need, so it re-renders less):
 *   const screen = useApp((s) => s.screen)
 *   const goTo = useApp((s) => s.goTo)
 * Outside React (p5 sketches, lib code): useApp.getState(), useApp.setState().
 */
import { create } from 'zustand'
import { DEFAULT_LAYOUT_ID, getLayout, shotCount, type Layout, type LayoutId } from '@/lib/layouts'

export type { LayoutId } from '@/lib/layouts'

/** Screen order of the main flow. */
export const SCREENS = ['start', 'frame', 'shoot', 'decorate', 'save'] as const
export type Screen = (typeof SCREENS)[number]

export type CameraStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'notfound' | 'error'
export type FaceFilter = 'none' | 'dog' | 'glasses' | 'blush'
export type ThemeId = 'basic' | 'forest' | 'campus' | 'retro'

/** One frame of a shot's motion clip. Shoot picks the format; compose/export accept all three. */
export type ClipFrame = string | ImageBitmap | HTMLCanvasElement

export interface Shot {
  /** dataURL of the still (already mirrored, face filter baked in) */
  image: string
  /** ~1.5 s of frames for GIF/WebM, oldest first */
  clip: ClipFrame[]
}

export interface Sticker {
  id: string
  /** dataURL (background already removed) */
  src: string
  /** center x in layout pixels */
  x: number
  /** center y in layout pixels */
  y: number
  /** 1 = natural size */
  scale: number
  /** degrees */
  rotation: number
  /** higher draws on top */
  z: number
}

export interface Decor {
  theme: ThemeId
  /** CSS color */
  frameColor: string
  /** dataURL or /brand/... path; null = solid frameColor */
  bgImage: string | null
  /** 'none' or an id defined in src/lib/filters.ts (decorate) */
  colorFilter: string
  dateOn: boolean
  text: string
  stickers: Sticker[]
}

export interface AppState {
  // --- flow ---
  screen: Screen
  cameraStatus: CameraStatus
  // --- frame select ---
  layoutId: LayoutId
  /** only meaningful for layout '2x4' */
  eightShotMode: boolean
  // --- shoot ---
  /** one entry per shot, null = not taken yet; length = shotCount(layout, eightShotMode) */
  shots: (Shot | null)[]
  faceFilter: FaceFilter
  gestureEnabled: boolean
  // --- decorate ---
  decor: Decor

  // --- APPEND NEW STATE FIELD TYPES BELOW (stage agents) ---
}

export interface AppActions {
  goTo: (screen: Screen) => void
  setCameraStatus: (status: CameraStatus) => void
  /** Also resets shots to the right length. */
  setLayout: (layoutId: LayoutId) => void
  /** Also resets shots to the right length. */
  setEightShotMode: (on: boolean) => void
  setShot: (index: number, shot: Shot) => void
  /** Clear one shot so Shoot can retake it. */
  retake: (index: number) => void
  clearShots: () => void
  setFaceFilter: (filter: FaceFilter) => void
  setGestureEnabled: (on: boolean) => void
  /** Shallow-merge into decor, e.g. updateDecor({ frameColor: '#000' }). */
  updateDecor: (patch: Partial<Decor>) => void
  addSticker: (sticker: Sticker) => void
  updateSticker: (id: string, patch: Partial<Sticker>) => void
  removeSticker: (id: string) => void
  /** "처음부터": back to Start with everything cleared. Camera stream stays alive. */
  reset: () => void

  // --- APPEND NEW ACTION TYPES BELOW (stage agents) ---
}

export type AppStore = AppState & AppActions

const initialDecor = (): Decor => ({
  theme: 'basic',
  frameColor: '#ffffff',
  bgImage: null,
  colorFilter: 'none',
  dateOn: true,
  text: '',
  stickers: [],
})

const emptyShots = (layoutId: LayoutId, eightShotMode: boolean): (Shot | null)[] =>
  Array<Shot | null>(shotCount(getLayout(layoutId), eightShotMode)).fill(null)

const initialState = (): AppState => ({
  screen: 'start',
  cameraStatus: 'idle',
  layoutId: DEFAULT_LAYOUT_ID,
  eightShotMode: false,
  shots: emptyShots(DEFAULT_LAYOUT_ID, false),
  faceFilter: 'none',
  gestureEnabled: true,
  decor: initialDecor(),

  // --- APPEND NEW STATE FIELD VALUES BELOW (stage agents) ---
})

export const useApp = create<AppStore>()((set, get) => ({
  ...initialState(),

  goTo: (screen) => set({ screen }),
  setCameraStatus: (cameraStatus) => set({ cameraStatus }),

  setLayout: (layoutId) => set((s) => ({ layoutId, shots: emptyShots(layoutId, s.eightShotMode) })),
  setEightShotMode: (eightShotMode) =>
    set((s) => ({ eightShotMode, shots: emptyShots(s.layoutId, eightShotMode) })),

  setShot: (index, shot) =>
    set((s) => {
      const shots = s.shots.slice()
      shots[index] = shot
      return { shots }
    }),
  retake: (index) =>
    set((s) => {
      const shots = s.shots.slice()
      shots[index] = null
      return { shots }
    }),
  clearShots: () => set((s) => ({ shots: emptyShots(s.layoutId, s.eightShotMode) })),
  setFaceFilter: (faceFilter) => set({ faceFilter }),
  setGestureEnabled: (gestureEnabled) => set({ gestureEnabled }),

  updateDecor: (patch) => set((s) => ({ decor: { ...s.decor, ...patch } })),
  addSticker: (sticker) =>
    set((s) => ({ decor: { ...s.decor, stickers: [...s.decor.stickers, sticker] } })),
  updateSticker: (id, patch) =>
    set((s) => ({
      decor: {
        ...s.decor,
        stickers: s.decor.stickers.map((st) => (st.id === id ? { ...st, ...patch } : st)),
      },
    })),
  removeSticker: (id) =>
    set((s) => ({
      decor: { ...s.decor, stickers: s.decor.stickers.filter((st) => st.id !== id) },
    })),

  reset: () => set({ ...initialState(), cameraStatus: get().cameraStatus }),

  // --- APPEND NEW ACTION IMPLEMENTATIONS BELOW (stage agents) ---
}))

/** Derived selectors. Use as useApp(selectLayout). All return stable values. */
export const selectLayout = (s: AppState): Layout => getLayout(s.layoutId)
export const selectShotCount = (s: AppState): number => s.shots.length
export const selectAllShotsTaken = (s: AppState): boolean => s.shots.every(Boolean)
export const selectNextEmptyIndex = (s: AppState): number => s.shots.findIndex((x) => x === null)
