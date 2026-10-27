import { usePerformanceStore } from "@/store/performanceStore"
import type { Telemetry } from "@/store/telemetryStore"

export type VoiceHintPhase = {
  id: string
  title: string
  phrases: string[]
}

const N1_IDLE_MAX = 15
const TAXI_MAX_IAS = 45
const LINEUP_MAX_IAS = 60

export type ResolveVoiceHintsArgs = {
  telemetry: Telemetry | null
  lastCompletedChecklistId: string | null
  lastCompletedFlowId: string | null
  voiceChecklistRunning: boolean
  preflightTimerRunning: boolean
}

export function resolveVoiceHints(args: ResolveVoiceHintsArgs): VoiceHintPhase | null {
  const {
    telemetry,
    lastCompletedChecklistId: lastCl,
    lastCompletedFlowId: lastFl,
    voiceChecklistRunning,
    preflightTimerRunning
  } = args

  if (voiceChecklistRunning || !telemetry) return null

  // Fast, zero-overhead value mapping via type casting
  const t = telemetry as unknown as Record<string, number>
  const ias = t.ias ?? 0
  const vs = t.vs ?? 0
  const alt = t.alt ?? 0
  const flapsIndex = t.flapsIndex ?? 0
  const landingGear = t.landingGear ?? 0
  const ground = (t.onGround ?? 0) > 0.5

  const engOff =
    (t.mixture1 ?? 1) < 0.5 &&
    (t.mixture2 ?? 1) < 0.5 &&
    (t.mixture3 ?? 1) < 0.5 &&
    (t.engine1N1 ?? 0) < N1_IDLE_MAX &&
    (t.engine2N1 ?? 0) < N1_IDLE_MAX &&
    (t.engine3N1 ?? 0) < N1_IDLE_MAX

  const seatBelts = (t.seatBeltsSwitch ?? 0) > 1

  // ── AIRBORNE PHASES ──────────────────────────────────────────────────────────
  if (!ground) {
    const descending = vs < -300
    const perfTA = usePerformanceStore.getState().takeoff.transitionAltitude || 5000
    const perfTL = usePerformanceStore.getState().landing.transitionLevel || 5000

    const inDescentContext = descending || lastFl?.startsWith("des_") || lastCl?.startsWith("des_")

    if (!inDescentContext) {
      const aboveTA = alt > perfTA
      const above10k = alt > 10000

      // Initial climb while flaps still out
      if (flapsIndex > 0) {
        return {
          id: "initial_climb",
          title: "Initial climb",
          phrases: ["gear up", "flaps up", "slats retract", "autoflight"]
        }
      }

      // To the line — flow done, flaps clean, still below TA
      if (flapsIndex === 0 && !aboveTA && lastFl === "after_takeoff" && lastCl !== "after_takeoff_to_the_line") {
        return {
          id: "after_takeoff_to_line",
          title: "After takeoff climb",
          phrases: ["after takeoff checklist to the line"]
        }
      }

      // Below the line — above TA
      if (aboveTA) {
        const phrases: string[] = []
        if (lastCl !== "after_takeoff_below_the_line")
          phrases.push("set standard", "after takeoff checklist below the line")
        if (above10k) {
          if (seatBelts) phrases.push("seatbelts auto")
          if (lastCl === "after_takeoff_below_the_line") phrases.push("you have control", "i have control")
        }
        return {
          id: "after_takeoff_below_line",
          title: "After takeoff climb",
          phrases
        }
      }

      if (above10k) {
        const phrases: string[] = []
        if (seatBelts) phrases.push("seatbelts auto")
        if (lastCl === "after_takeoff_below_the_line") phrases.push("you have control", "i have control")
        return {
          id: "climb_cruise",
          title: "Climb / cruise",
          phrases
        }
      }
    } else {
      if (alt > perfTL && lastCl !== "des_P1")
        return {
          id: "descent_high",
          title: "Descent / Approach",
          phrases: ["descent approach checklist through seat belts"]
        }

      if (alt > perfTL && lastCl === "des_P1")
        return {
          id: "descent_high2",
          title: "Descent / Approach",
          phrases: []
        }

      // Below 10k approach - priority for config
      if (alt < 10000 && landingGear !== 25) {
        const phrases = ["slats extend", "flaps X", "gear down"]
        if (lastCl !== "des_P2") phrases.unshift("complete descent approach checklist")
        return { id: "approach_low", title: "Approach", phrases }
      }

      if (alt <= perfTL && lastCl !== "des_P2" && lastFl !== "des_ten_thousand_flow") {
        return { id: "descent_low", title: "Approach", phrases: ["complete descent approach checklist"] }
      }

      if (lastFl === "des_ten_thousand_flow" && landingGear !== 25) {
        const phrases = ["slats extend", "flaps X", "gear down"]
        if (lastCl !== "des_P2") phrases.unshift("complete descent approach checklist")
        return { id: "approach_low", title: "Approach", phrases }
      }

      if (landingGear === 25)
        return {
          id: "short_final",
          title: "Short final",
          phrases: ["flaps X", "autobrake X", "Before landing checklist", "go around", "continue"]
        }
    }
    return null
  }

  // ── GROUND PHASES ────────────────────────────────────────────────────────────
  const slowGround = ias <= LINEUP_MAX_IAS
  const normalTaxi = ias <= TAXI_MAX_IAS

  // Rule processing tree array
  const GROUND_RULES = [
    {
      cond: lastFl === "des_ten_thousand_flow" && normalTaxi,
      id: "after_landing1",
      title: "After landing 1",
      phrases: ["okay to clean up"]
    },
    {
      cond: lastFl === "after_landing" && lastCl !== "after_landing" && normalTaxi,
      id: "after_landing_hints",
      title: "After landing",
      phrases: ["shutdown engine 2", "after landing checklist", "turning into stand"]
    },
    {
      cond: lastCl === "after_landing" && lastFl === "after_landing" && normalTaxi,
      id: "after_landing_hints3",
      title: "After landing",
      phrases: ["shutdown engine 2", "turning into stand"]
    },
    {
      cond: lastCl === "before_takeoff" && slowGround,
      id: "takeoff",
      title: "Takeoff",
      phrases: ["autoflight", "stop"]
    },
    {
      cond: lastFl === "before_takeoff" && slowGround,
      id: "call_lineup_checklist",
      title: "Before takeoff checklist",
      phrases: ["before takeoff checklist"]
    },
    {
      cond: lastCl === "taxi" && slowGround,
      id: "after_taxi",
      title: "Line up",
      phrases: ["runway entry procedure", "clear to line up"]
    },
    {
      cond: (lastFl === "taxi" || lastFl === "taxi_vector") && normalTaxi,
      id: "pre_taxi",
      title: "Taxi checklist",
      phrases: ["taxi checklist"]
    },
    {
      cond: lastFl === "clear_left" && normalTaxi,
      id: "post_clear_left",
      title: "Taxi",
      phrases: ["flight controls check"]
    },
    { cond: lastCl === "after_start" && normalTaxi, id: "taxi_phase", title: "Taxi", phrases: ["clear left"] },
    {
      cond: lastFl === "after_start" && lastCl !== "after_start" && normalTaxi,
      id: "after_start_running",
      title: "After start",
      phrases: ["after start checklist"]
    },
    {
      cond: lastCl === "before_start" && lastFl !== "after_start" && normalTaxi,
      id: "engine_start",
      title: "Engine start",
      phrases: ["starting engine X"]
    },
    {
      cond: lastFl === "before_start" && lastCl !== "before_start" && normalTaxi,
      id: "call_before_start_checklist",
      title: "Ready for before start checklist",
      phrases: ["before start checklist"]
    },
    {
      cond: lastCl === "cockpit_prep",
      id: "post_cockpit_prep",
      title: "Before start proc",
      phrases: ["before start procedure", "start the apu", "start apu"]
    }
  ]

  for (const rule of GROUND_RULES) {
    if (rule.cond) return { id: rule.id, title: rule.title, phrases: rule.phrases }
  }

  // ── ENGINES OFF COLD FALLBACKS ────────────────────────────────────────────────
  if (engOff) {
    if (lastFl === "shutdownP2" && lastCl !== "parking")
      return { id: "parking_phase", title: "Parking", phrases: ["parking checklist"] }
    if (preflightTimerRunning)
      return { id: "prep_timeline", title: "Prepare", phrases: ["cockpit preparation checklist"] }
    return {
      id: "prep",
      title: "Prepare",
      phrases: ["lets prepare the aircraft", "lets prepare the flight", "lets set up the aircraft"]
    }
  }

  return null
}
