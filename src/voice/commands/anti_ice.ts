import { simvarGet, simvarSet } from "@/API/simvarApi"

import { delay } from "../commandDispatch"

async function setAntiIceToggle(position: number, readVar: string, pressCevent: number, isAutoSystemFitted: boolean) {
  const current = (await simvarGet(`(${readVar})`)) ?? 0
  if (current === position) return

  // 1. Press the button
  await simvarSet(`${pressCevent} (>L:CEVENT)`)

  // 2. Only fire release if it's the momentary (Auto-fitted) system
  if (isAutoSystemFitted) {
    await delay(200) // Physical click duration
    await simvarSet(`${pressCevent + 1} (>L:CEVENT)`)
  }

  // Brief stabilization gap before completing this specific toggle task
  await delay(50)
}

async function getValidAiceMode(): Promise<number> {
  let val = await simvarGet("(L:MD11_OVHD_AICE_SYSTEM_SEL_BT)")
  while (val == null) {
    await delay(100)
    val = await simvarGet("(L:MD11_OVHD_AICE_SYSTEM_SEL_BT)")
  }
  return val
}

export async function setAntiIceSystemMode(desiredManualState: number) {
  const isAutoSystemFitted = (await simvarGet("(L:MD11_OPT_AUTO_AICE)")) === 1
  if (!isAutoSystemFitted) return

  const currentMode = await getValidAiceMode()
  if (currentMode !== desiredManualState) {
    await simvarSet("90443 (>L:CEVENT)")
  }
}

export async function setEngAntiIce(position: number) {
  try {
    const isAuto = (await simvarGet("(L:MD11_OPT_AUTO_AICE)")) === 1
    const switches = [90414, 90416, 90418]

    for (let i = 0; i < switches.length; i++) {
      // Safely await each execution entirely before moving forward
      await setAntiIceToggle(position, `L:MD11_OVHD_AICE_ENG${i + 1}_ON_LT`, switches[i], isAuto)

      // Only delay if there's another switch remaining in the queue
      if (i < switches.length - 1) {
        await delay(200)
      }
    }
  } catch (error) {
    console.error("Error setting MD-11 engine anti-ice:", error)
  }
}

export async function setAirfoilAntiIce(position: number) {
  try {
    const isAuto = (await simvarGet("(L:MD11_OPT_AUTO_AICE)")) === 1

    await setAntiIceToggle(position, "L:MD11_OVHD_AICE_WING_ON_LT", 90420, isAuto)
    await delay(200)
    await setAntiIceToggle(position, "L:MD11_OVHD_AICE_TAIL_ON_LT", 90422, isAuto)
  } catch (error) {
    console.error("Error setting MD-11 airfoil anti-ice:", error)
  }
}
