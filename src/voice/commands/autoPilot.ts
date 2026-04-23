import { simvarGet, simvarSet } from "@/API/simvarApi"

import { delay } from "../commandDispatch"

const btn = async (press: number, release: number, ms = 150) => {
  await simvarSet(`${press} (>L:CEVENT)`)
  await delay(ms)
  await simvarSet(`${release} (>L:CEVENT)`)
}

// Autopilot
export const setAutoPilot = () => btn(86094, 86095)
export const setAltHld = () => btn(86084, 86085)
export const setAPPR = () => btn(86092, 86093)
export const setFOFlightDirector = () => simvarSet("95498 (>L:CEVENT)")

// Speed
export const setSelSpeed = () => btn(86068, 86069)
export const setSpdHold = () => btn(86070, 86071)

// Heading
export const setHdgHold = () => btn(86078, 86079)
export const setHdgSel = () => btn(86076, 86077)
export const setNav = () => btn(86090, 86091)

// Altitude
export const setSelAlt = () => btn(86082, 86083)
export const setProf = () => btn(86096, 86097)

export async function setAirspeedDial(targetKnots: number) {
  const target = Math.round(targetKnots)
  if (target < 100 || target > 350 || !Number.isFinite(target)) return

  try {
    let currentSpd = (await simvarGet("(L:md11_afs_spd)")) ?? 0
    let safetyBreak = 0

    while (Math.round(currentSpd) !== target && ++safetyBreak < 300) {
      const diff = target - currentSpd
      const absDiff = Math.abs(diff)
      const event = diff > 0 ? "86066 (>L:CEVENT)" : "86067 (>L:CEVENT)"

      await simvarSet(event)

      // Dynamic braking delay
      if (absDiff > 10) {
        await delay(50) // Fast slewing speed
      } else {
        await delay(250) // Aggressive slow braking zone to catch sim lag
      }

      currentSpd = (await simvarGet("(L:md11_afs_spd)")) ?? 0
    }
  } catch (error) {
    console.error("Error adjusting speed:", error)
  }
}

export async function setHeadingDial(targetDegrees: number) {
  if (!Number.isFinite(targetDegrees)) return
  const target = Math.round(((targetDegrees % 360) + 360) % 360)

  try {
    let currentHdg = (await simvarGet("(L:md11_afs_hdg)")) ?? 0
    let safetyBreak = 0

    while (Math.round(currentHdg) !== target && ++safetyBreak < 450) {
      const diff = ((target - currentHdg + 540) % 360) - 180
      const absDiff = Math.abs(diff)
      const event = diff > 0 ? "86074 (>L:CEVENT)" : "86075 (>L:CEVENT)"

      await simvarSet(event)

      // Dynamic braking delay
      if (absDiff > 10) {
        await delay(50) // Fast slewing speed
      } else {
        await delay(250) // Aggressive slow braking zone to catch sim lag
      }

      currentHdg = (await simvarGet("(L:md11_afs_hdg)")) ?? 0
    }
  } catch (error) {
    console.error("Error adjusting heading:", error)
  }
}

export async function setAltitudeDial(targetFeet: number) {
  const target = Math.round(targetFeet / 100) * 100
  if (target < 0 || target > 50000 || !Number.isFinite(target)) return

  const INC = "86080 (>L:CEVENT)"
  const DEC = "86081 (>L:CEVENT)"
  const stepSize = (alt: number) => (alt >= 10000 ? 500 : 100)
  const eventForDiff = (d: number) => (d > 0 ? INC : DEC)

  const click = async (evt: string) => {
    await simvarSet(evt)
    await delay(30)
  }

  const read = async () => (await simvarGet("(L:MD11_AFS_ALT)")) ?? 0

  try {
    let cur = await read()
    let diff = target - cur

    // === Phase 1 — Fast-slewing macro loop: burst-5 clicks while far from target ===
    while (Math.abs(diff) > stepSize(cur) * 10) {
      const ev = eventForDiff(diff)
      for (let i = 0; i < 5; i++) {
        await click(ev)
        cur = await read()
        if (Math.abs((diff = target - cur)) <= stepSize(cur) * 10) break
      }
      await delay(100)
      cur = await read()
      diff = target - cur
    }

    // === Phase 2 — Precise incremental loop: single clicks with dynamic braking ===
    let safetyBreak = 0
    while (Math.abs((diff = target - cur)) > 0 && ++safetyBreak < 450) {
      const absDiff = Math.abs(diff)
      const ev = eventForDiff(diff)
      await click(ev)

      // Dynamic braking delay — altitude spacing is 100 s, so braking starts at 1500 ft
      await delay(absDiff > 1500 ? 50 : 250)

      cur = await read()
    }
  } catch (error) {
    console.error("Error adjusting altitude:", error)
  }
}
