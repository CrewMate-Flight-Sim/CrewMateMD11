import { simvarGet } from "@/API/simvarApi"
import { abortChecklist, executeChecklist } from "@/services/checklistRunner"
import { executeFlow } from "@/services/flowRunner"
import { playSound, playSoundSequence } from "@/services/playSounds"
import { useGroundEngineerStore } from "@/store/groundEngineerStore"
import { usePerformanceStore } from "@/store/performanceStore"
import { usePreflightTimerStore } from "@/store/preflightTimerStore"
import { useSettingsStore } from "@/store/settingsStore"

import { setEngAntiIce, setAirfoilAntiIce, setAntiIceSystemMode } from "./commands/anti_ice"
import { StartAPU } from "./commands/apu"
import { setAutobrakeDial } from "./commands/autobrake"
import {
  setAirspeedDial,
  setAltitudeDial,
  setAPPR,
  setAutoPilot,
  setAltHld,
  setFOFlightDirector,
  setHeadingDial,
  setSelSpeed,
  setSelAlt,
  setHdgSel,
  setHdgHold,
  setNav,
  setProf,
  setSpdHold
} from "./commands/autoPilot"
import { setStdBaro } from "./commands/baro"
import { shutdownE2 } from "./commands/engine"
import { setFlaps } from "./commands/flaps"
import { flightControlsCheck } from "./commands/flight_controls_check"
import { setGearHandle } from "./commands/gear"
import { executeGoAround } from "./commands/goAround"
import { disconnectAllGround, setASU, setGPU } from "./commands/groundServices"
import { setStrobeLights, setNoseLights, setRwyTOFF } from "./commands/lights"
import { setSeatBelts } from "./commands/seat_belts"
import { setWipers } from "./commands/wipers"

// ─── Utilities ──────────────────────────────────────────────────────────────
export const checklistAbortCommands = new Set(["checklist_cancel"])
export const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const randomDelay = (min: number, max: number) => delay(min + Math.random() * (max - min))

const isInvalidMD11Alt = (alt: number): boolean => {
  return alt > 10000 ? alt % 500 !== 0 : alt % 100 !== 0
}
/**
 * Reusable polling helper for SimVars with a safety timeout.
 */
async function waitForSimVar(lvar: string, target: number, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const current = await simvarGet(`(L:${lvar})`)

    if (typeof current === "number" && Math.abs(current - target) < 0.1) {
      return true
    }
    await delay(100)
  }
  return false
}

const getNumericPayload = (payload: Record<string, unknown>, ...keys: string[]): number | null => {
  for (const key of keys) {
    const raw = payload[key]
    if (raw == null) continue
    const val = typeof raw === "number" ? raw : Number(String(raw).trim())
    if (!Number.isNaN(val)) return val
  }
  return null
}

const getStringPayload = (payload: Record<string, unknown>, ...keys: string[]): string | undefined => {
  for (const key of keys) {
    const raw = payload[key]
    if (typeof raw === "string") return raw
  }
  return undefined
}

const gePack = () => useSettingsStore.getState().geSoundPack

/**
 * Consolidates the Ground Engineer logic for GPU, ASU, and Disconnects.
 */
async function runGroundAction(
  action: () => Promise<void>,
  sound: string,
  delayRange: [number, number] = [3000, 8000]
) {
  const store = useGroundEngineerStore.getState()
  if (!store.isActive) return

  store.deactivate()
  await randomDelay(delayRange[0], delayRange[1])
  await action()
  await playSound(sound, { pack: gePack() })
}

// ─── Discrete command map ─────────────────────────────────────────────────────

export const discreteCommandMap: Record<string, () => void | Promise<void>> = {
  // Gear & Flaps
  gear_up: () => setGearHandle(0),
  gear_down: () => setGearHandle(1),
  slats_ret: () => setFlaps(0),
  slats_ext_zero: () => setFlaps(1),
  flaps_15: () => setFlaps(2),
  flaps_28: () => setFlaps(3),
  flaps_35: () => setFlaps(4),
  flaps_50: () => setFlaps(5),
  go_around_flaps: () => executeGoAround(),

  // Systems
  autobrake_off: () => {
    playSound("check.ogg")
    setAutobrakeDial(1)
  },
  autobrake_min: () => {
    playSound("check.ogg")
    setAutobrakeDial(2)
  },
  autobrake_med: () => {
    playSound("check.ogg")
    setAutobrakeDial(3)
  },
  autobrake_max: () => {
    playSound("check.ogg")
    setAutobrakeDial(4)
  },
  shutdown_e2: () => shutdownE2(),
  apu_start: () => {
    playSound("check.ogg")
    StartAPU()
  },
  set_standard: () => setStdBaro(1),

  // Lights
  taxi_lights_on: () => {
    playSound("check.ogg")
    setNoseLights(1)
  },
  taxi_lights_off: () => {
    playSound("check.ogg")
    setNoseLights(0)
  },
  strobe_lights_on: () => {
    playSound("check.ogg")
    setStrobeLights(1)
  },
  strobe_lights_off: () => {
    playSound("check.ogg")
    setStrobeLights(0)
  },
  turning_into_stand: async () => {
    playSound("check.ogg")
    setNoseLights(0)
    await delay(500)
    setRwyTOFF(0)
  },

  // Autopilot Toggles
  flight_director_on: () => {
    playSound("check.ogg")
    setFOFlightDirector()
  },
  flight_director_off: () => {
    playSound("check.ogg")
    setFOFlightDirector()
  },
  autopilot_engage: () => {
    playSound("afs.ogg")
    setAutoPilot()
  },

  // FCP Knobs
  pull_heading: () => {
    playSound("check.ogg")
    setHdgSel()
  },
  push_heading: () => {
    playSound("check.ogg")
    setHdgHold()
  },
  manage_nav: () => {
    playSound("check.ogg")
    setNav()
  },
  pull_altitude: () => {
    playSound("check.ogg")
    setSelAlt()
  },
  pull_speed: () => {
    playSound("check.ogg")
    setSelSpeed()
  },
  push_to_level_off: () => {
    playSound("check.ogg")
    setAltHld()
  },
  arm_approach: () => {
    playSound("check.ogg")
    setAPPR()
  },
  engage_prof: () => {
    playSound("check.ogg")
    setProf()
  },
  push_speed: () => {
    playSound("check.ogg")
    setSpdHold()
  },

  // Anti-ice logic with mode-switch protection
  anti_ice_auto: () => {
    playSound("check.ogg")
    setAntiIceSystemMode(0)
  },
  engine_anti_ice_on: async () => {
    playSound("check.ogg")
    await setAntiIceSystemMode(1)
    await delay(250)
    await setEngAntiIce(1)
  },
  engine_anti_ice_off: () => {
    playSound("check.ogg")
    setEngAntiIce(0)
  },
  foil_anti_ice_on: async () => {
    playSound("check.ogg")
    await setAntiIceSystemMode(1)
    await delay(250)
    await setAirfoilAntiIce(1)
  },
  foil_anti_ice_off: () => {
    playSound("check.ogg")
    setAirfoilAntiIce(0)
  },

  // Cabin
  seat_belts_on: () => {
    playSound("check.ogg")
    setSeatBelts(2)
  },
  seat_belts_auto: () => {
    playSound("check.ogg")
    setSeatBelts(1)
  },
  seat_belts_off: () => {
    playSound("check.ogg")
    setSeatBelts(0)
  },
  wipers_off: () => setWipers(0),
  wipers_int: () => setWipers(1),
  wipers_slow: () => setWipers(2),
  wipers_fast: () => setWipers(3),

  // Procedures
  flight_controls_check: () => flightControlsCheck(),
  prepare_aircraft: () => usePreflightTimerStore.getState().start(),
  engine_start_1: () => playSound("check.ogg"),
  engine_start_2: () => playSound("check.ogg"),
  engine_start_3: () => playSound("check.ogg"),
  clear_left: () => executeFlow("clear_left"),
  runway_entry_procedure: () => executeFlow("before_takeoff"),
  before_start_procedure: () => executeFlow("before_start"),
  clean_up: () => executeFlow("after_landing"),

  // Checklists
  checklist_cockpit_prep: () => executeChecklist("cockpit_prep"),
  checklist_before_start: () => executeChecklist("before_start"),
  checklist_after_start: () => executeChecklist("after_start"),
  checklist_taxi: () => executeChecklist("taxi"),
  checklist_before_takeoff: () => executeChecklist("before_takeoff"),
  checklist_after_takeoffP1: () => executeChecklist("after_takeoff_to_the_line"),
  checklist_after_takeoffP2: () => executeChecklist("after_takeoff_below_the_line"),
  checklist_desapprP1: () => executeChecklist("des_P1"),
  checklist_desapprP2: () => executeChecklist("des_P2"),
  checklist_before_landing: () => executeChecklist("before_landing"),
  checklist_after_landing: () => executeChecklist("after_landing"),
  checklist_parking: () => executeChecklist("parking"),
  checklist_cancel: () => abortChecklist(),
  continue: () => playSound("check.ogg"),

  // Ground Services using the new helper
  ground_call: async () => {
    await randomDelay(2000, 6000)
    await playSound("go_ahead.ogg", { pack: gePack() })
    useGroundEngineerStore.getState().activate()
  },
  connect_gpu: () => runGroundAction(() => setGPU(true), "gpu_on.ogg"),
  disconnect_gpu: () => runGroundAction(() => setGPU(false), "gpu_off.ogg"),
  connect_asu: () => runGroundAction(() => setASU(true), "asu_on.ogg"),
  disconnect_asu: () => runGroundAction(() => setASU(false), "asu_off.ogg"),
  disconnect_all_ground: () => runGroundAction(disconnectAllGround, "all_off.ogg", [5000, 12000])
}

// ─── Optimized Dispatcher ───────────────────────────────────────────────────

export async function dispatchFoCommand(
  commandType: string,
  payload: Record<string, unknown>,
  rawText?: string
): Promise<boolean> {
  const value = getNumericPayload(payload, "value", "cval")

  // 1. Check if the user actually voiced the execution command
  // We check both the incoming payload text property and an optional rawText parameter
  const rawUtterance = ((payload.text as string) || rawText || "").toLowerCase()
  const shouldExecute = rawUtterance.endsWith("select")

  switch (commandType) {
    case "discrete": {
      const cmd = payload.command as string | undefined
      if (!cmd) return false
      const handler = discreteCommandMap[cmd]
      if (handler) await handler()
      return true
    }

    case "heading": {
      if (value === null) return false
      await setHeadingDial(value)
      await waitForSimVar("md11_afs_hdg", value)

      // 2. ONLY pull the knob if the word "select" was heard!
      if (shouldExecute) {
        setHdgSel()
      }

      playSound("check.ogg")
      return true
    }

    case "fma_callout": {
      playSound("check.ogg")
      return true
    }

    case "altitude": {
      const fl = getNumericPayload(payload, "flightLevel")
      const targetAlt = fl != null ? fl * 100 : value

      if (targetAlt === null) return false

      if (isInvalidMD11Alt(targetAlt)) {
        console.warn(`[AFS] Rejected invalid voice altitude: ${targetAlt}`)
        playSound("are_you_sure.ogg")
        return false
      }

      await setAltitudeDial(targetAlt)
      const settled = await waitForSimVar("md11_afs_alt", targetAlt, 8000)

      if (settled) {
        playSound("check.ogg")
      }

      return settled
    }

    case "speed": {
      if (value === null) return false
      await setAirspeedDial(value)
      await waitForSimVar("md11_afs_spd", value)

      // 4. ONLY pull the speed knob if "select" was heard!
      if (shouldExecute) {
        setSelSpeed()
      }

      playSound("check.ogg")
      return true
    }

    case "missed_approach_altitude": {
      const altFromStore = usePerformanceStore.getState().landing?.["missedAltitude"]
      const fl = getNumericPayload(payload, "flightLevel")
      const isAuto = getStringPayload(payload, "mode", "value", "cval")?.toLowerCase() === "auto"

      const targetAlt = isAuto ? altFromStore : fl != null ? fl * 100 : (value ?? altFromStore)

      if (targetAlt == null) return false

      if (isInvalidMD11Alt(targetAlt)) {
        playSound("are_you_sure.ogg")
        return false
      }

      await setAltitudeDial(targetAlt)

      const settled = await waitForSimVar("md11_afs_alt", targetAlt, 5000)
      if (!settled) return false

      const leading = Math.floor(targetAlt / 1000).toString()
      await playSoundSequence(["missed_approach.ogg", `${leading}.ogg`, "thousand.ogg", "feet_set.ogg"])

      return true
    }

    default:
      return false
  }
}
