import { simvarGet, simvarSet } from "@/API/simvarApi"

import { delay } from "../commandDispatch"

export async function setSeatBelts(position: number) {
  try {
    // Rust natively holds block collection polling now—stable frame loop is dead code
    const currentPosition = (await simvarGet("(L:MD11_OVHD_LTS_SEAT_BELTS_SW)")) ?? 0
    const steps = position - currentPosition

    if (steps === 0) return

    const event = steps > 0 ? "90249 (>L:CEVENT)" : "90248 (>L:CEVENT)"
    const totalSteps = Math.abs(steps)

    // Step the 3-way switch sequentially through detents
    for (let i = 0; i < totalSteps; i++) {
      await simvarSet(event)
      await delay(50)
    }
  } catch (error) {
    console.error("Error setting seat belts:", error)
  }
}
