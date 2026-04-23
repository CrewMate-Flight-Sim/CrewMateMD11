import { simvarGet, simvarSet } from "@/API/simvarApi"

export async function StartAPU() {
  try {
    await simvarSet("69828 (>L:CEVENT)")
    // Short physical delay to simulate a button click
    await new Promise((r) => setTimeout(r, 150))
    // Release the button
    await simvarSet("69829 (>L:CEVENT)")

    await new Promise((r) => setTimeout(r, 1000))

    // Brief pause before starting APU sequence to let the display update
    await new Promise((r) => setTimeout(r, 200))
    // 1. APU Master ON / Start sequence
    await simvarSet("90144 (>L:CEVENT)")
    await new Promise((r) => setTimeout(r, 100)) // Small delay for the plane to "hear" the event
    await simvarSet("90145 (>L:CEVENT)")

    let isOn = 0
    let secondsElapsed = 0
    const MAX_WAIT = 90

    while (isOn === 0 && secondsElapsed < MAX_WAIT) {
      // Note: Ensure simvarGet takes the name as a string
      const val = await simvarGet("(L:MD11_OVHD_ELEC_APU_PWR_ON_LT)")
      isOn = val ?? 0

      if (isOn === 1) break

      await new Promise((r) => setTimeout(r, 1000))
      secondsElapsed++
    }

    if (isOn === 1) {
      // 2. APU Bleed sequence
      await simvarSet("90313 (>L:CEVENT)")
    }
  } catch (error) {
    console.error("Error setting APU (LVAR):", error)
  }
}
