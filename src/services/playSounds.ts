import { invoke } from "@tauri-apps/api/core"

import { useSettingsStore } from "@/store/settingsStore"

import { getMd11Variant } from "./MD11variant"

interface PlaySoundOptions {
  pack?: string
  volume?: number
}

export interface SoundSequenceEntry {
  filename?: string
  pack?: string
}

// Moved outside the function and converted to a Set for O(1) instant lookups
const INHIBITED_CARGO_SOUNDS = new Set([
  "cabin_landing.ogg",
  "cabin_report.ogg",
  "cabin_secure.ogg",
  "cabin_takeoff.ogg",
  "cabin_not_secure.ogg"
])

export const playSound = async (filename: string, options?: PlaySoundOptions) => {
  try {
    if (getMd11Variant() === "cargo" && INHIBITED_CARGO_SOUNDS.has(filename)) {
      console.log(`Sound inhibited in cargo mode: ${filename}`)
      return
    }

    const state = useSettingsStore.getState()
    await invoke("play_sound", {
      filename,
      pack: options?.pack ?? state.soundPack,
      volume: options?.volume ?? state.soundVolume / 100
    })
  } catch (error) {
    console.error("Error playing sound via backend:", error)
  }
}

export const isSoundPlaying = async (): Promise<boolean> => {
  try {
    return await invoke<boolean>("is_audio_playing")
  } catch {
    return false
  }
}

/** Play a list of sound files back-to-back (silence-trimmed, gapless). */
export const playSoundSequence = async (files: (SoundSequenceEntry | string)[], options?: PlaySoundOptions) => {
  try {
    const state = useSettingsStore.getState()
    const normalizedFiles = files.map((file) =>
      typeof file === "string" ? { filename: file, pack: state.soundPack } : file
    )

    await invoke("play_sound_sequence", {
      files: normalizedFiles,
      volume: options?.volume ?? state.soundVolume / 100
    })
  } catch (error) {
    console.error("Error playing sound sequence via backend:", error)
  }
}
