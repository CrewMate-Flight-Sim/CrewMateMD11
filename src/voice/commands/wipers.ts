import { simvarGet, simvarSet } from "@/API/simvarApi"
import { playSound } from "@/services/playSounds"
import { useTelemetryStore } from "@/store/telemetryStore"

import { delay } from "../commandDispatch"

const WIPERS_SPEED_LIMIT_MD11 = 230 // knots

/**
 * Moves a specific wiper by sending sequential events to the L:CEVENT variable.
 */
async function moveWiper(target: number, current: number, upCode: string, downCode: string) {
  const diff = target - current
  if (diff === 0) return

  const eventCode = diff > 0 ? upCode : downCode
  const steps = Math.abs(diff)

  for (let i = 0; i < steps; i++) {
    await simvarSet(`${eventCode} (>L:CEVENT)`)
    // Delay between individual knob clicks to ensure the sim registers each notch change
    await delay(200)
  }
}

export async function setWipers(position: number) {
  try {
    const { telemetry } = useTelemetryStore.getState()
    const currentSpeed = telemetry?.ias ?? 0

    // 1. Guard check for overspeed
    if (position !== 0 && currentSpeed > WIPERS_SPEED_LIMIT_MD11) {
      playSound("check_speed.ogg")
      return
    }

    // 2. Parallelize SimVar fetching from the cache
    const [currentLeft, currentRight] = await Promise.all([
      simvarGet("(L:MD11_OVHD_L_WIPER_KB)"),
      simvarGet("(L:MD11_OVHD_R_WIPER_KB)")
    ])

    // 3. FIX: Move wipers sequentially to prevent dropped SimConnect packets
    // Execute Left wiper adjustment fully
    await moveWiper(position, currentLeft ?? 0, "90376", "90375")

    // Brief physical pause between finishing the Left switch and starting the Right switch
    await delay(200)

    // Execute Right wiper adjustment fully
    await moveWiper(position, currentRight ?? 0, "90383", "90382")

    playSound("check.ogg")
  } catch (error) {
    console.error("Error setting MD-11 wipers:", error)
  }
}
