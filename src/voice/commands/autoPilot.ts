import { simvarGet, simvarSet } from "@/API/simvarApi"
import { delay } from "@/lib/utils"

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

// TFDI's scroll acceleration (measured): from the 5th click of a streak, clicks under ~500ms apart move 3 steps
const ACCEL_FREE_CLICKS = 4
const ACCEL_STEP = 3
const ACCEL_RESET_MS = 600
const SLEW_CLICK_MS = 60
const READBACK_POLL_MS = 20
const READBACK_TIMEOUT_MS = 500
const MAX_KNOB_CLICKS = 400

interface Knob {
  lvar: string
  inc: number
  dec: number
  // Signed number of clicks from current to target
  stepsTo: (current: number) => number
}

// The first read of an LVar the app hasn't registered yet comes back null
async function readKnob(lvar: string): Promise<number | null> {
  for (let i = 0; i < 10; i++) {
    const v = await simvarGet(`(L:${lvar})`)
    if (v !== null) return v
    await delay(50)
  }
  return null
}

async function waitForKnobChange(lvar: string, before: number): Promise<number> {
  const start = Date.now()
  let v = before
  while (v === before && Date.now() - start < READBACK_TIMEOUT_MS) {
    await delay(READBACK_POLL_MS)
    v = (await simvarGet(`(L:${lvar})`)) ?? before
  }
  return v
}

// Slews fast while far, then lets the acceleration reset and lands with confirmed single clicks, so it can't hunt
async function turnKnob(knob: Knob): Promise<boolean> {
  let current = await readKnob(knob.lvar)
  if (current === null) return false
  let streak = 0

  for (let clicks = 0; clicks < MAX_KNOB_CLICKS; clicks++) {
    const steps = knob.stepsTo(current)
    if (steps === 0) return true

    const far = Math.abs(steps) > ACCEL_STEP * 2
    if (!far && streak >= ACCEL_FREE_CLICKS) {
      await delay(ACCEL_RESET_MS)
      streak = 0
      current = (await readKnob(knob.lvar)) ?? current
      continue
    }

    await simvarSet(`${steps > 0 ? knob.inc : knob.dec} (>L:CEVENT)`)
    streak++
    if (far) {
      await delay(SLEW_CLICK_MS)
      current = (await simvarGet(`(L:${knob.lvar})`)) ?? current
    } else {
      current = await waitForKnobChange(knob.lvar, current)
    }
  }
  return false
}

export async function setAirspeedDial(targetKnots: number) {
  const target = Math.round(targetKnots)
  if (target < 100 || target > 350 || !Number.isFinite(target)) return

  try {
    await turnKnob({ lvar: "md11_afs_spd", inc: 86066, dec: 86067, stepsTo: (cur) => target - Math.round(cur) })
  } catch (error) {
    console.error("[AutoPilot] Error adjusting speed:", error)
  }
}

export async function setHeadingDial(targetDegrees: number) {
  if (!Number.isFinite(targetDegrees)) return
  const target = Math.round(((targetDegrees % 360) + 360) % 360)

  try {
    await turnKnob({
      lvar: "md11_afs_hdg",
      inc: 86074,
      dec: 86075,
      stepsTo: (cur) => ((target - Math.round(cur) + 540) % 360) - 180
    })
  } catch (error) {
    console.error("[AutoPilot] Error adjusting heading:", error)
  }
}

export async function setAltitudeDial(targetFeet: number) {
  const target = Math.round(targetFeet / 100) * 100
  if (target < 0 || target > 50000 || !Number.isFinite(target)) return

  // One click is 100 ft below 10,000 ft and 500 ft above
  const stepSize = (alt: number) => (alt >= 10000 ? 500 : 100)

  try {
    await turnKnob({
      lvar: "MD11_AFS_ALT",
      inc: 86080,
      dec: 86081,
      stepsTo: (cur) => Math.round((target - cur) / stepSize(cur))
    })
  } catch (error) {
    console.error("[AutoPilot] Error adjusting altitude:", error)
  }
}
