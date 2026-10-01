import { create } from "zustand"

import { playSound } from "@/services/playSounds"

interface CabinReadyTimerStore {
  isActive: boolean
  isRunning: boolean
  isExpired: boolean
  durationMinutes: number | null
  expiresAt: number | null
  startTimer: (durationMinutes: number) => void
  stopTimer: () => void
  resetTimer: () => void
  acknowledgeExpired: () => void
}

let timerTimeoutId: ReturnType<typeof setTimeout> | null = null

function clearTimer(): void {
  if (timerTimeoutId) {
    clearTimeout(timerTimeoutId)
    timerTimeoutId = null
  }
}

export const useCabinReadyTimerStore = create<CabinReadyTimerStore>()((set) => ({
  isActive: false,
  isRunning: false,
  isExpired: false,
  durationMinutes: null,
  expiresAt: null,

  startTimer: async (durationMinutes: number) => {
    clearTimer()
    const durationMs = durationMinutes * 60 * 1000
    const expiresAt = Date.now() + durationMs

    set({
      isActive: true,
      isRunning: true,
      isExpired: false,
      durationMinutes,
      expiresAt
    })

    timerTimeoutId = setTimeout(async () => {
      set({ isRunning: false, isExpired: true })
      try {
        await playSound("cabin_secure.ogg")
      } catch (err) {
        console.error("[CabinReadyTimer] Failed to play expiry sound:", err)
      }
    }, durationMs)
  },

  stopTimer: () => {
    clearTimer()
    set({
      isActive: false,
      isRunning: false,
      isExpired: false,
      durationMinutes: null,
      expiresAt: null
    })
  },

  resetTimer: () => {
    clearTimer()
    set({
      isActive: false,
      isRunning: false,
      isExpired: false,
      durationMinutes: null,
      expiresAt: null
    })
  },

  acknowledgeExpired: () => {
    set({ isExpired: false })
  }
}))
