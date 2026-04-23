import { simvarGet, simvarSet } from "@/API/simvarApi"

import { delay } from "../commandDispatch"

export type AutobrakePosition = 1 | 2 | 3 | 4 // 0 = takeoff, excluded

// Autobrake commands
export async function setAutobrakeDial(targetPosition: AutobrakePosition) {
  if (isNaN(targetPosition) || targetPosition < 1 || targetPosition > 4) return
  const target = Math.round(targetPosition)

  try {
    let currentPos = (await simvarGet("(L:MD11_CTR_AUTOBRAKE_SW)")) ?? 1
    let safetyBreak = 0

    while (Math.round(currentPos) !== target && safetyBreak < 10) {
      const diff = target - currentPos
      const event = diff > 0 ? "82212 (>L:CEVENT)" : "82211 (>L:CEVENT)"

      await simvarSet(event)
      await delay(150)

      currentPos = (await simvarGet("(L:MD11_CTR_AUTOBRAKE_SW)")) ?? 1
      safetyBreak++
    }
  } catch (error) {
    console.error("Error adjusting autobrake:", error)
  }
}
