import { listen } from "@tauri-apps/api/event"
import { create } from "zustand"
import { persist } from "zustand/middleware"

interface TakeoffData {
  transitionAltitude: number
  trim: number
  antiIce?: string
  armNav: boolean
}

interface LandingData {
  transitionLevel: number
  missedAltitude: number
  antiIce?: string
  flaps?: string
}

interface PerformanceStore {
  takeoff: TakeoffData
  landing: LandingData
  setTakeoffData: (data: Partial<TakeoffData>) => void
  setLandingData: (data: Partial<LandingData>) => void
  resetTakeoffData: () => void
  resetLandingData: () => void
}

const defaultTakeoffData: TakeoffData = {
  transitionAltitude: 5000,
  trim: 3.0,
  antiIce: "off",
  armNav: true
}

const defaultLandingData: LandingData = {
  transitionLevel: 7000,
  missedAltitude: 3000,
  flaps: "35",
  antiIce: "off"
}

export const usePerformanceStore = create<PerformanceStore>()(
  persist(
    (set) => ({
      takeoff: defaultTakeoffData,
      landing: defaultLandingData,
      setTakeoffData: (data) =>
        set((state) => ({
          takeoff: { ...state.takeoff, ...data }
        })),
      setLandingData: (data) =>
        set((state) => ({
          landing: { ...state.landing, ...data }
        })),
      resetTakeoffData: () => set({ takeoff: defaultTakeoffData }),
      resetLandingData: () => set({ landing: defaultLandingData })
    }),
    {
      name: "performance-data"
    }
  )
)

listen<Partial<TakeoffData>>("takeoff-updated", (event) => {
  usePerformanceStore.getState().setTakeoffData(event.payload)
})

listen<Partial<LandingData>>("landing-updated", (event) => {
  usePerformanceStore.getState().setLandingData(event.payload)
})
