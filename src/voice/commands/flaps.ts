import { simvarSet, simvarGet } from "@/API/simvarApi"
import { playSound } from "@/services/playSounds"
import { useTelemetryStore } from "@/store/telemetryStore"

import { delay } from "../commandDispatch"

const md11FlapDetents: Record<number, number> = {
  0: 0, // UP / RET
  1: 20, // 0 / EXT (Slats Only)
  2: 46.91, // DAF (Standard Approach Flaps 15)
  3: 70, // 28 (Go-around Gate)
  4: 82, // 35 (Landing)
  5: 100 // 50 (Full)
}

const md11FlapSpeeds: Record<number, number> = {
  1: 280, // Slats
  2: 255, // Flaps 15
  3: 210, // Flaps 28
  4: 190, // Flaps 35
  5: 175 // Flaps 50
}

const md11SoundMap: Record<number, string> = {
  0: "slats_retr.ogg",
  2: "flaps_15.ogg",
  3: "flaps_28.ogg",
  4: "flaps_35.ogg",
  5: "flaps_50.ogg"
}

export async function setFlaps(targetIndex: number) {
  try {
    const { telemetry } = useTelemetryStore.getState()
    const currentSpeed = telemetry?.ias ?? 0
    const isOnGround = telemetry?.onGround ?? 0
    const targetValue = md11FlapDetents[targetIndex] ?? 0

    // Re-read with retries before the loop
    let initialRng = 0
    for (let i = 0; i < 5; i++) {
      const val = await simvarGet("(L:md11_flap_rng)")
      if (val !== null) {
        initialRng = val
        break
      }
      await delay(150)
    }
    let currentRng = initialRng

    // 1. FO Speed Check

    // 1. FO Speed Check
    const speedLimit = md11FlapSpeeds[targetIndex]
    if (!isOnGround && speedLimit && currentSpeed > speedLimit) {
      playSound("check_speed.ogg")
      return
    }

    // 2. Click the lever until it hits the target zone
    let safetyBreak = 0
    while (Math.abs(currentRng - targetValue) > 1 && safetyBreak < 15) {
      const isMovingDown = targetValue > currentRng
      const event = isMovingDown ? "77831 (>L:CEVENT)" : "77830 (>L:CEVENT)"

      await simvarSet(event)
      await delay(700)

      currentRng = (await simvarGet("(L:md11_flap_rng)")) ?? 0
      safetyBreak++
    }
    await delay(5000)

    // 3. Play confirmation sound
    if (targetIndex === 1) {
      // Coming from above detent 1 (flaps were deployed) → flaps up
      // Coming from below detent 1 (slats retracted) → slats extend
      playSound(initialRng > md11FlapDetents[1] ? "flaps_up.ogg" : "slats_ext.ogg")
    } else {
      const confirmation = md11SoundMap[targetIndex]
      if (confirmation) playSound(confirmation)
    }
  } catch (error) {
    console.error("[MD11 Flaps] Error:", error)
  }
}
