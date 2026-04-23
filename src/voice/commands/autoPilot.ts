import { simvarGet, simvarSet } from "@/API/simvarApi"
import { playSound } from "@/services/playSounds"

import { delay } from "../commandDispatch"

// Autopilot commands
export async function setAutoPilot() {
  try {
    await simvarSet(`86094 (>L:CEVENT)`)
    await delay(100)
    await simvarSet(`86095 (>L:CEVENT)`)
  } catch (error) {
    console.error("Error toggling autoflight:", error)
  }
}

export async function setAltHld() {
  try {
    await simvarSet("86084 (>L:CEVENT)")
    await delay(50)
    await simvarSet("86085 (>L:CEVENT)")
  } catch (error) {
    console.error("Error setting alt hold:", error)
  }
}

export async function setAPPR() {
  try {
    await simvarSet(`86092 (>L:CEVENT)`)
    await delay(100)
    await simvarSet(`86093 (>L:CEVENT)`)
  } catch (error) {
    console.error("Error toggling APPR/LAND:", error)
  }
}

// Flight director commands
export async function setFOFlightDirector() {
  try {
    await simvarSet(`95498 (>L:CEVENT)`)
  } catch (error) {
    console.error("Error setting flight director:", error)
  }
}

// Speed commands
export async function setAirspeedDial(targetKnots: number) {
  if (isNaN(targetKnots) || targetKnots < 100 || targetKnots > 350) return
  const target = Math.round(targetKnots)

  try {
    let currentSpd = (await simvarGet("(L:md11_afs_spd)")) ?? 0
    let safetyBreak = 0

    while (Math.round(currentSpd) !== target && safetyBreak < 300) {
      const diff = target - currentSpd
      const absDiff = Math.abs(diff)
      const event = diff > 0 ? "86066 (>L:CEVENT)" : "86067 (>L:CEVENT)"

      await simvarSet(event)

      // Braking: Slow down within 5 knots to prevent ±1 overshoot
      const waitTime = absDiff <= 5 ? 150 : 40
      await delay(waitTime)

      currentSpd = (await simvarGet("(L:md11_afs_spd)")) ?? 0
      safetyBreak++
    }

    playSound("check.ogg")
  } catch (error) {
    console.error("Error adjusting speed:", error)
  }
}

export async function setSelSpeed() {
  try {
    await simvarSet("86068 (>L:CEVENT)")
    await delay(50)
    await simvarSet("86069 (>L:CEVENT)")
  } catch (error) {
    console.error("Error setting selected speed:", error)
  }
}

export async function setSpdHold() {
  try {
    await simvarSet("86070 (>L:CEVENT)")
    await delay(50)
    await simvarSet("86071 (>L:CEVENT)")
  } catch (error) {
    console.error("Error setting selected speed:", error)
  }
}

// Heading commands
export async function setHeadingDial(targetDegrees: number) {
  if (isNaN(targetDegrees)) return
  const target = Math.round(((targetDegrees % 360) + 360) % 360)

  try {
    let currentHdg = (await simvarGet("(L:md11_afs_hdg)")) ?? 0
    let safetyBreak = 0

    while (Math.round(currentHdg) !== target && safetyBreak < 450) {
      // Calculate shortest turn direction
      const diff = ((target - currentHdg + 540) % 360) - 180
      const absDiff = Math.abs(diff)
      const event = diff > 0 ? "86074 (>L:CEVENT)" : "86075 (>L:CEVENT)"

      await simvarSet(event)

      // Braking: Slow down within 5 degrees
      const waitTime = absDiff <= 5 ? 150 : 40
      await delay(waitTime)

      currentHdg = (await simvarGet("(L:md11_afs_hdg)")) ?? 0
      safetyBreak++
    }

    playSound("check.ogg")
  } catch (error) {
    console.error("Error adjusting heading:", error)
  }
}

export async function setHdgHold() {
  try {
    await simvarSet("86078 (>L:CEVENT)")
    await delay(50)
    await simvarSet("86079 (>L:CEVENT)")
  } catch (error) {
    console.error("Error setting MD-11 heading hold:", error)
  }
}

export async function setHdgSel() {
  try {
    await simvarSet("86076 (>L:CEVENT)")
    await delay(50)
    await simvarSet("86077 (>L:CEVENT)")
  } catch (error) {
    console.error("Error setting MD-11 heading sel:", error)
  }
}

export async function setNav() {
  try {
    await simvarSet("86090 (>L:CEVENT)")
    await delay(50)
    await simvarSet("86091 (>L:CEVENT)")
  } catch (error) {
    console.error("Error setting nav:", error)
  }
}
// Altitude commands
export async function setAltitudeDial(targetFeet: number) {
  if (isNaN(targetFeet) || targetFeet < 0 || targetFeet > 50000) return
  const target = Math.round(targetFeet / 100) * 100

  try {
    let currentAlt = (await simvarGet("(L:md11_afs_alt)")) ?? 0
    let safetyBreak = 0

    // Use 50ft tolerance for altitude rounding
    while (Math.abs(currentAlt - target) > 50 && safetyBreak < 600) {
      const diff = target - currentAlt
      const absDiff = Math.abs(diff)
      const event = diff > 0 ? "86080 (>L:CEVENT)" : "86081 (>L:CEVENT)"

      await simvarSet(event)

      // Braking: Slow down within 500ft
      const waitTime = absDiff <= 500 ? 150 : 50
      await delay(waitTime)

      currentAlt = (await simvarGet("(L:md11_afs_alt)")) ?? 0
      safetyBreak++
    }

    playSound("check.ogg")
  } catch (error) {
    console.error("Error adjusting altitude:", error)
  }
}

export async function setSelAlt() {
  try {
    await simvarSet("86082 (>L:CEVENT)")
    await delay(50)
    await simvarSet("86083 (>L:CEVENT)")
  } catch (error) {
    console.error("Error setting selected alt:", error)
  }
}

export async function setProf() {
  try {
    await simvarSet("86096 (>L:CEVENT)")
    await delay(50)
    await simvarSet("86097 (>L:CEVENT)")
  } catch (error) {
    console.error("Error setting prof:", error)
  }
}
