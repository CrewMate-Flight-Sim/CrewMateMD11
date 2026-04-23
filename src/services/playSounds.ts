import { invoke } from "@tauri-apps/api/core"

import { getMd11Variant } from "@/hooks/useMD11variant"
import { useSettingsStore } from "@/store/settingsStore"

interface PlaySoundOptions {
  pack?: string
  volume?: number
}

export interface SoundSequenceEntry {
  filename?: string
  pack?: string
}

export const playSound = async (filename: string, options?: PlaySoundOptions) => {
  try {
    // Check if we're in cargo mode and should inhibit sounds
    const isCargo = getMd11Variant() === "cargo"

    // Define sounds that should be inhibited in cargo mode
    // This list can be expanded based on your requirements
    const inhibitedSounds = [
      "cabin_landing.ogg",
      "cabin_report.ogg",
      "cabin_secure.ogg",
      "cabin_takeoff.ogg",
      "cabin_not_secure.ogg"
    ]

    // If in cargo mode and this sound should be inhibited, skip playing it
    if (isCargo && inhibitedSounds.includes(filename)) {
      console.log(`Sound inhibited in cargo mode: ${filename}`)
      return
    }

    const state = useSettingsStore.getState()
    const soundPack = options?.pack ?? state.soundPack
    const volume = options?.volume ?? state.soundVolume / 100
    await invoke("play_sound", {
      filename,
      pack: soundPack,
      volume
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

/// Play a list of sound files back-to-back (silence-trimmed, gapless).
/// Each entry specifies its own pack, allowing mixed voices in one sequence.
export const playSoundSequence = async (files: SoundSequenceEntry[] | string[], options?: PlaySoundOptions) => {
  try {
    const state = useSettingsStore.getState()
    const volume = options?.volume ?? state.soundVolume / 100

    // Convert strings to objects if necessary before sending to the backend
    const normalizedFiles: SoundSequenceEntry[] = files.map((file) =>
      typeof file === "string"
        ? { filename: file, pack: state.soundPack } // ✅ include pack
        : file
    )

    await invoke("play_sound_sequence", { files: normalizedFiles, volume })
  } catch (error) {
    console.error("Error playing sound sequence via backend:", error)
  }
}
