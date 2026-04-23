import { simvarGet, simvarSet } from "@/API/simvarApi"

import { delay } from "../commandDispatch"

export type AutobrakePosition = 1 | 2 | 3 | 4 // 0 = takeoff, excluded

export async function setAutobrakeDial(targetPosition: AutobrakePosition) {
  const target = Math.round(targetPosition)
  if (target < 1 || target > 4 || !Number.isFinite(target)) return

  try {
    let currentPos = (await simvarGet("(L:MD11_CTR_AUTOBRAKE_SW)")) ?? 1
    let safetyBreak = 0

    while (Math.round(currentPos) !== target && safetyBreak < 10) {
      // Determine rotation vector direction (clockwise vs counter-clockwise)
      const event = target > currentPos ? "82212 (>L:CEVENT)" : "82211 (>L:CEVENT)"

      await simvarSet(event)

      // Responsive delay catching the precise frame Rust clears the buffer
      await delay(200)

      currentPos = (await simvarGet("(L:MD11_CTR_AUTOBRAKE_SW)")) ?? 1
      safetyBreak++
    }
  } catch (error) {
    console.error("Error adjusting autobrake:", error)
  }
}
