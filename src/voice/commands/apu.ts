import { simvarGet, simvarSet } from "@/API/simvarApi"

import { delay } from "../commandDispatch"

export async function StartAPU() {
  try {
    // Open SD ENGINE page (needed for monitoring)
    await simvarSet("69828 (>L:CEVENT)")
    await delay(150)
    await simvarSet("69829 (>L:CEVENT)")

    // Pre-flight stabilization wait
    await delay(2200)

    // 1. APU Master ON / Start sequence execution
    await simvarSet("90144 (>L:CEVENT)")
    await delay(100)
    await simvarSet("90145 (>L:CEVENT)")

    let isOn = 0
    // 90 seconds max at 5 ticks per second = 450 loops
    const MAX_LOOPS = 450

    // Highly responsive loop catching the exact frame Rust flips the cache state
    for (let loopCount = 0; loopCount < MAX_LOOPS; loopCount++) {
      isOn = (await simvarGet("(L:MD11_OVHD_ELEC_APU_PWR_ON_LT)")) ?? 0
      if (isOn === 1) break
      await delay(200)
    }

    // 2. APU Bleed sequence if power successfully stabilized
    if (isOn === 1) {
      await simvarSet("90313 (>L:CEVENT)")
    }
  } catch (error) {
    console.error("Error setting APU (LVAR):", error)
  }
}
