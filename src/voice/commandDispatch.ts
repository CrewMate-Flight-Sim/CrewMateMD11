import { simvarGet } from "@/API/simvarApi"
import { buildPassingAltitudeSequence } from "@/hooks/useCallouts"
import { abortChecklist, executeChecklist } from "@/services/checklistRunner"
import { executeFlow } from "@/services/flowRunner"
import { playSound, playSoundSequence } from "@/services/playSounds"
import { useGroundEngineerStore } from "@/store/groundEngineerStore"
import { usePassingAltitudeStore } from "@/store/passingAltitudeStore"
import { usePerformanceStore } from "@/store/performanceStore"
import { usePreflightTimerStore } from "@/store/preflightTimerStore"
import { useSettingsStore } from "@/store/settingsStore"
import { useTelemetryStore } from "@/store/telemetryStore"

import { setEngAntiIce, setAirfoilAntiIce } from "./commands/anti_ice"
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
  setHdgHold,
  setHdgSel,
  setNav,
  setProf,
  setSpdHold
} from "./commands/autoPilot"
import { setStdBaro } from "./commands/baro"
import { setFlaps } from "./commands/flaps"
import { flightControlsCheck } from "./commands/flight_controls_check"
import { setGearHandle } from "./commands/gear"
import { executeGoAround } from "./commands/goAround"
import { disconnectAllGround, setASU, setGPU } from "./commands/groundServices"
import { setStrobeLights, setNoseLights, setRwyTOFF } from "./commands/lights"
import { setSeatBelts } from "./commands/seat_belts"
import { setWipers } from "./commands/wipers"

export const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const randomDelay = (min: number, max: number) => delay(min + Math.random() * (max - min))

const getNumericPayload = (payload: Record<string, unknown>, ...keys: string[]): number | null => {
  for (const key of keys) {
    const raw = payload[key]
    if (raw == null) continue
    if (typeof raw === "number") return raw
    if (typeof raw === "string") {
      const value = Number(raw.trim())
      if (!Number.isNaN(value)) return value
    }
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

const isAutoMode = (payload: Record<string, unknown>) => {
  const mode = getStringPayload(payload, "mode", "value", "cval")
  return mode?.toLowerCase() === "auto"
}

const gePack = () => useSettingsStore.getState().geSoundPack

// Commands that are allowed to fire even while a checklist is running.
export const checklistAbortCommands = new Set(["checklist_cancel"])

// ─── Discrete command map ─────────────────────────────────────────────────────

export const discreteCommandMap: Record<string, () => void | Promise<void>> = {
  // ── Gear ──────────────────────────────────────────────────────────────────
  gear_up: () => setGearHandle(0),
  gear_down: () => setGearHandle(1),

  // ── Flaps ─────────────────────────────────────────────────────────────────
  slats_ret: () => setFlaps(0), // Lever to UP/RET (0)
  slats_ext_zero: () => setFlaps(1), // Lever to 0/EXT (20)
  flaps_15: () => setFlaps(2), // Lever to DAF-15 (46.91)
  flaps_28: () => setFlaps(3), // Lever to 28 (70)
  flaps_35: () => setFlaps(4), // Lever to 35 (85)
  flaps_50: () => setFlaps(5), // Lever to 50 (100)
  go_around_flaps: () => executeGoAround(),

  // Abrk
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

  // ── Lights ────────────────────────────────────────────────────────────────
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
    await delay(100)
    setRwyTOFF(0)
  },

  // ── Flight director ────────────────────────────────────────────────
  flight_director_on: () => {
    playSound("check.ogg")
    setFOFlightDirector()
  },
  flight_director_off: () => {
    playSound("check.ogg")
    setFOFlightDirector()
  },
  // ── Autopilot  ──────────────────────────────────────────────
  autopilot_engage: () => {
    playSound("afs.ogg")
    setAutoPilot()
  },

  // ── FCP knob commands ──────────────────────────────
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

  // ── Baro ──────────────────────────────────────────────────────────────────
  set_standard: () => {
    const t = useTelemetryStore.getState().telemetry
    const passingAlt = usePassingAltitudeStore.getState()

    setStdBaro(1)

    // Only trigger passing altitude callout if:
    // - Airborne
    // - Climbing (VS > 100 fpm)
    // - Not already tracking a passing altitude
    if (t && !t.onGround && t.vs > 100 && !passingAlt.isTracking()) {
      const targetAlt = t.pAlt + t.vs * (9 / 60)

      // Play "standard crosschecked, passing FL XXX" sequence
      const sequence = buildPassingAltitudeSequence(targetAlt)
      playSoundSequence(sequence)

      // Store target for "now" callout detection
      passingAlt.setTarget(targetAlt)
    }
  },

  // ── APU ───────────────────────────────────────────────────────────────────
  apu_start: () => {
    playSound("check.ogg")
    StartAPU()
  },

  shutdown_e2: () => {
    playSound("check.ogg")
  },

  // ── Anti-ice ──────────────────────────────────────────────────────────────
  engine_anti_ice_on: () => {
    playSound("check.ogg")
    setEngAntiIce(1)
  },
  engine_anti_ice_off: () => {
    playSound("check.ogg")
    setEngAntiIce(0)
  },
  foil_anti_ice_on: () => {
    playSound("check.ogg")
    setAirfoilAntiIce(1)
  },
  foil_anti_ice_off: () => {
    playSound("check.ogg")
    setAirfoilAntiIce(0)
  },

  // ── Seat belts ────────────────────────────────────────────────────────────
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

  // ── Wipers ────────────────────────────────────────────────────────────────
  wipers_off: () => setWipers(0),
  wipers_int: () => setWipers(1),
  wipers_slow: () => setWipers(2),
  wipers_fast: () => setWipers(3),

  // ── Flight controls ───────────────────────────────────────────────────────
  flight_controls_check: async () => {
    await flightControlsCheck()
  },

  // ── Preflight timer ───────────────────────────────────────────────────────
  prepare_aircraft: () => usePreflightTimerStore.getState().start(),

  // ── Engine start ──────────────────────────────────────────────────────────
  engine_start_3: async () => {
    await playSound("check.ogg")
  },
  engine_start_1: async () => {
    await playSound("check.ogg")
  },
  engine_start_2: async () => {
    await playSound("check.ogg")
  },

  // ── Flows ─────────────────────────────────────────────────────────────────
  clear_left: () => executeFlow("clear_left"),
  runway_entry_procedure: () => executeFlow("before_takeoff"),
  before_start_procedure: () => executeFlow("before_start"),
  clean_up: () => executeFlow("after_landing"),

  // ── Checklists ────────────────────────────────────────────────────────────
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

  // ── RTO / Continue  ─────────────────────────────────────
  //abort_takeoff: () => playSound("check.ogg"),
  continue: () => playSound("check.ogg"),

  // ── Ground engineer ───────────────────────────────────────────────────────
  ground_call: async () => {
    await randomDelay(2000, 6000)
    await playSound("go_ahead.ogg", { pack: gePack() })
    useGroundEngineerStore.getState().activate()
  },
  connect_gpu: async () => {
    if (!useGroundEngineerStore.getState().isActive) return
    useGroundEngineerStore.getState().deactivate()
    await randomDelay(3000, 8000)
    await setGPU(true)
    await playSound("gpu_on.ogg", { pack: gePack() })
  },
  disconnect_gpu: async () => {
    if (!useGroundEngineerStore.getState().isActive) return
    useGroundEngineerStore.getState().deactivate()
    await randomDelay(3000, 8000)
    await setGPU(false)
    await playSound("gpu_off.ogg", { pack: gePack() })
  },
  connect_asu: async () => {
    if (!useGroundEngineerStore.getState().isActive) return
    useGroundEngineerStore.getState().deactivate()
    await randomDelay(3000, 8000)
    await setASU(true)
    await playSound("asu_on.ogg", { pack: gePack() })
  },
  disconnect_asu: async () => {
    if (!useGroundEngineerStore.getState().isActive) return
    useGroundEngineerStore.getState().deactivate()
    await randomDelay(3000, 8000)
    await setASU(false)
    await playSound("asu_off.ogg", { pack: gePack() })
  },
  disconnect_all_ground: async () => {
    if (!useGroundEngineerStore.getState().isActive) return
    useGroundEngineerStore.getState().deactivate()
    await randomDelay(5000, 12000)
    await disconnectAllGround()
    await playSound("gpu_off.ogg", { pack: gePack() })
  }
}

// ─── FO command dispatcher (heading, altitude, speed, fma) ────────

export async function dispatchFoCommand(commandType: string, payload: Record<string, unknown>): Promise<boolean> {
  switch (commandType) {
    case "discrete": {
      const cmd = payload.command as string | undefined
      if (!cmd) return false
      const handler = discreteCommandMap[cmd]
      if (handler) await handler()
      return true
    }

    case "heading": {
      const value = getNumericPayload(payload, "value", "cval")
      if (value == null) return false

      setHeadingDial(value)

      await new Promise<void>((resolve) => {
        const check = setInterval(async () => {
          const current = await simvarGet("(L:md11_afs_hdg)")
          if (current === value) {
            clearInterval(check)
            resolve()
          }
        }, 50)
      })

      setHdgSel()
      return true
    }

    case "altitude": {
      const flightLevel = getNumericPayload(payload, "flightLevel")
      const value = getNumericPayload(payload, "value", "cval")
      const feet = flightLevel != null ? flightLevel * 100 : value
      if (feet == null) return false

      const isAbove10k = feet > 10000
      const isInvalid = isAbove10k ? feet % 500 !== 0 : feet % 100 !== 0

      if (isInvalid) {
        console.warn(`MD11: ${feet}ft is not a valid increment.`)
        playSound("are_you_sure.ogg")
        return false
      }

      playSound("check.ogg")
      setAltitudeDial(feet)
      return true
    }

    case "speed": {
      const value = getNumericPayload(payload, "value", "cval")
      if (value == null) return false

      setAirspeedDial(value)

      await new Promise<void>((resolve) => {
        const check = setInterval(async () => {
          const current = await simvarGet("(L:md11_afs_spd)")
          if (current === value) {
            clearInterval(check)
            resolve()
          }
        }, 50)
      })

      setSelSpeed()
      return true
    }

    case "fma_callout": {
      playSound("check.ogg")
      return true
    }

    case "missed_approach_altitude": {
      if (isAutoMode(payload)) {
        const alt = usePerformanceStore.getState().landing?.["missedAltitude"]
        if (alt != null) {
          const isAbove10k = alt > 10000
          const isInvalid = isAbove10k ? alt % 500 !== 0 : alt % 100 !== 0

          if (isInvalid) {
            console.warn(`MD11: ${alt}ft is not a valid increment.`)
            playSound("are_you_sure.ogg")
            return false
          }

          setAltitudeDial(alt)
          playSound("missed_approach_set.ogg")
        }
      } else {
        const flightLevel = getNumericPayload(payload, "flightLevel")
        const altValue = flightLevel != null ? flightLevel * 100 : getNumericPayload(payload, "value", "cval")

        if (altValue != null) {
          const isAbove10k = altValue > 10000
          const isInvalid = isAbove10k ? altValue % 500 !== 0 : altValue % 100 !== 0

          if (isInvalid) {
            console.warn(`MD11: ${altValue}ft is not a valid increment.`)
            playSound("are_you_sure.ogg")
            return false
          }

          const leadingNumber = Math.floor(altValue / 1000).toString()
          setAltitudeDial(altValue)
          playSoundSequence(["missed_approach.ogg", `${leadingNumber}.ogg`, "thousand.ogg", "feet_set.ogg"])
        }
      }
      return true
    }

    default:
      return false
  }
}
