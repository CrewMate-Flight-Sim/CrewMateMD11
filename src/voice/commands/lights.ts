import { simvarGet, simvarSet } from "@/API/simvarApi"

import { delay } from "../commandDispatch"

export async function setStrobeLights(position: number) {
  try {
    const current = await simvarGet("(L:MD11_OVHD_LTS_HI_INT_BT)")
    const isOn = current === 1
    const shouldBeOn = position === 1

    if (isOn !== shouldBeOn) {
      await simvarSet("90273 (>L:CEVENT)")
    }
  } catch (error) {
    console.error("Error setting strobe lights:", error)
  }
}

export async function setNoseLights(position: number) {
  try {
    const current = await simvarGet("(L:md11_ovhd_lts_nose_sw)")
    if (current === position) return

    const expression =
      position === 1
        ? "90262 (>L:CEVENT)" // inc (off -> on)
        : "90261 (>L:CEVENT)" // dec (on -> off)

    await simvarSet(expression)
  } catch (error) {
    console.error("Error setting nose lights:", error)
  }
}

export async function setRwyTOFF(position: number) {
  try {
    // Fetch both light states simultaneously from the cache
    const [left, right] = await Promise.all([
      simvarGet("(L:MD11_OVHD_LTS_RWY_TURNOFF_L_BT)"),
      simvarGet("(L:MD11_OVHD_LTS_RWY_TURNOFF_R_BT)")
    ])

    const shouldBeOn = position === 1

    // 1. Evaluate and click Left light if out of sync
    if ((left === 1) !== shouldBeOn) {
      await simvarSet("90263 (>L:CEVENT)")
      // Brief physical delay so the simulator registers the left click before processing the right
      await delay(150)
    }

    // 2. Evaluate and click Right light if out of sync
    if ((right === 1) !== shouldBeOn) {
      await simvarSet("90265 (>L:CEVENT)")
      // Stabilization delay after finishing the routine
      await delay(150)
    }
  } catch (error) {
    console.error("Error setting runway turnoff lights:", error)
  }
}
