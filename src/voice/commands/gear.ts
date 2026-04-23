import { simvarSet, simvarGet } from "@/API/simvarApi"
import { playSound } from "@/services/playSounds"
import { useTelemetryStore } from "@/store/telemetryStore"

import { delay } from "../commandDispatch"

const GEAR_LOWER_SPEED_LIMIT = 260 // knots
let spoilerArmingDelay: ReturnType<typeof setTimeout> | null = null

export async function setGearHandle(position: number) {
  try {
    const { telemetry } = useTelemetryStore.getState()
    const currentSpeed = telemetry?.ias ?? 0
    const onGround = telemetry?.onGround ?? 1

    // Safety checks matching aircraft operation limits
    if (position === 1 && currentSpeed > GEAR_LOWER_SPEED_LIMIT) return
    if (position === 0 && onGround) {
      console.warn("Gear retraction inhibited: Aircraft on ground")
      return
    }

    const commandExpression = `(>K:GEAR_${position === 1 ? "DOWN" : "UP"})`
    const soundFile = position === 1 ? "gear_down.ogg" : "gear_up.ogg"

    // Arm auto-spoilers after a 5-second structural extension delay if lowering in-flight
    if (position === 1 && !onGround) {
      if (spoilerArmingDelay) clearTimeout(spoilerArmingDelay)

      spoilerArmingDelay = setTimeout(async () => {
        const currentSpoilerHandle = (await simvarGet("(L:MD11_SPDBRK_HANDLE)")) ?? 0
        if (currentSpoilerHandle < 0.5) {
          await simvarSet("77829 (>L:CEVENT)")
        }
      }, 5000)
    }

    // 1. Order the landing gear position change first
    await simvarSet(commandExpression)

    // 2. Wait exactly 1 second for mechanical hydraulic transition
    await delay(1000)

    // 3. Play the verbal audio confirmation after the delay clears
    await playSound(soundFile)
  } catch (error) {
    console.error("Error sending gear key event:", error)
  }
}
