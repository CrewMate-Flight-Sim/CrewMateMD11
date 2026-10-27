import { useEffect, useRef } from "react"

import { useTelemetryTick } from "@/hooks/useTelemetryTick"
import { playSound, isSoundPlaying } from "@/services/playSounds"
import { useGoAroundStore } from "@/store/goAroundStore"
import { usePerformanceStore } from "@/store/performanceStore"
import { useRtoStore } from "@/store/rtoStore"
import { useSettingsStore } from "@/store/settingsStore"
import { useTelemetryStore } from "@/store/telemetryStore"
import type { Telemetry } from "@/store/telemetryStore"

type LandingPhase = "idle" | "spoilers" | "reverser" | "decel"

interface CalloutState {
  calledThrustSet: boolean
  called80to: boolean
  called80ldg: boolean
  called60: boolean
  calledVr: boolean
  calledV1: boolean
  vrInhibit: boolean
  v1Inhibit: boolean
  positiveClimb: boolean
  tenThousandClimb: boolean
  tenThousandDescent: boolean
  transitionAltitude: boolean
  transitionLevel: boolean
  oneToGo: boolean
  wasAirborne: boolean
  phase: LandingPhase
  phaseStartTime: number | null
  readySince: number | null
  pauseMs: number
  done: boolean
}

interface PreviousValues {
  speed: number
  alt: number
  onGround: number
  fcpAlt: number
}

const crossedUp = (p: number, c: number, t: number) => p < t && c >= t
const crossedDown = (p: number, c: number, t: number) => p > t && c <= t
const TIMEOUTS = { SPOILER: 3000, REVERSER: 3000, DECEL: 10000 }
const CALL_PAUSE = { MIN: 500, MAX: 1200 }
const DISARM_MIN_IAS = 30
const STD_BARO_HPA = 1013.25
const STD_BARO_INHG = 29.92
// The captain altimeter readout is dashed (-999) when no value is set, so treat
// anything below 900 hPa / 26 inHg as unset (avoids false "standard" matches).
const isStandardBaro = (baro: number | undefined): boolean => {
  if (baro == null || baro < 0) return true
  return Math.abs(baro - STD_BARO_HPA) < 0.5 || Math.abs(baro - STD_BARO_INHG) < 0.05
}

const brakesApplied = (t: Telemetry) => (t.brakeLeftPosition ?? 0) > 0.1 || (t.brakeRightPosition ?? 0) > 0.1
const reverseSelected = (t: Telemetry) =>
  (t.engine1Reverse ?? 0) > 0.1 || (t.engine2Reverse ?? 0) > 0.1 || (t.engine3Reverse ?? 0) > 0.1

const randomPause = () => CALL_PAUSE.MIN + Math.random() * (CALL_PAUSE.MAX - CALL_PAUSE.MIN)

interface DisarmState {
  armed: boolean
  called: boolean
}

// Arming always clears the latch, so every landing or reject gets its own callout
const armDisarm = (d: DisarmState) => {
  d.armed = true
  d.called = false
}

const advancePhase = (ls: CalloutState, next: LandingPhase, now: number) => {
  ls.phase = next
  ls.phaseStartTime = now
  ls.readySince = null
  ls.pauseMs = randomPause()
}
const completeLanding = (ls: CalloutState) => {
  ls.phase = "idle"
  ls.phaseStartTime = null
  ls.readySince = null
  ls.done = true
}
const resetLanding = (ls: CalloutState) => {
  ls.phase = "idle"
  ls.phaseStartTime = null
  ls.readySince = null
  ls.done = false
}

const sawIndication = (ls: CalloutState, indication: boolean, now: number) => {
  if (!indication) {
    ls.readySince = null
    return false
  }
  ls.readySince ??= now
  return now - ls.readySince >= ls.pauseMs
}

// One callout per tick, so two of them never talk over each other
type Speak = (file: string) => boolean

type LandingPhaseTransition = (ls: CalloutState, now: number) => void

const createLandingPhaseHandler =
  (
    getIndication: (t: Telemetry) => boolean,
    okSound: string,
    timeoutSound: string,
    timeoutMs: number,
    transition: LandingPhaseTransition
  ) =>
  (ls: CalloutState, t: Telemetry, elapsed: number, now: number, speak: Speak) => {
    if (sawIndication(ls, getIndication(t), now)) {
      if (!speak(okSound)) return
      transition(ls, now)
      return
    }
    if (ls.readySince === null && elapsed >= timeoutMs) {
      if (!speak(timeoutSound)) return
      transition(ls, now)
    }
  }

const PHASE_HANDLERS: Record<
  Exclude<LandingPhase, "idle">,
  (ls: CalloutState, t: Telemetry, elapsed: number, now: number, speak: Speak) => void
> = {
  // Timeouts only fire while nothing was seen, so a late indication still in its pause isn't called missing
  spoilers: createLandingPhaseHandler(
    (t) => (t.spoilersHandlePosition ?? 0) > 0.1,
    "spoilers_dep.ogg",
    "no_spoilers.ogg",
    TIMEOUTS.SPOILER,
    (ls, now) => advancePhase(ls, "reverser", now)
  ),
  reverser: createLandingPhaseHandler(
    (t) => reverseSelected(t),
    "reverse_thr.ogg",
    "no_reverse.ogg",
    TIMEOUTS.REVERSER,
    (ls, now) => advancePhase(ls, "decel", now)
  ),
  decel: (ls, t, elapsed, now) => {
    if (sawIndication(ls, brakesApplied(t) && (t.ias ?? 0) > 40, now)) {
      completeLanding(ls)
    } else if (ls.readySince === null && elapsed >= TIMEOUTS.DECEL) {
      completeLanding(ls)
    }
  }
}

// ─── Rejected takeoff ────────────────────────────────────────────────
// "stop" on the ground above 40 kt: the FO calls spoilers, then reverse
// thrust. No decel call on a reject.

const RTO_ARM_MIN_IAS = 40
const RTO_END_IAS = 30

interface RtoState {
  active: boolean
  phase: "spoilers" | "reverser"
  phaseStartTime: number | null
}

const resetRto = (rto: RtoState) => {
  rto.active = false
  rto.phase = "spoilers"
  rto.phaseStartTime = null
}

function handleRto(rto: RtoState, t: Telemetry, elapsed: number, now: number, speak: Speak): void {
  if (rto.phase === "spoilers") {
    if ((t.spoilersHandlePosition ?? 0) > 0.1) {
      if (!speak("spoilers_dep.ogg")) return
      rto.phase = "reverser"
      rto.phaseStartTime = now
    } else if (elapsed >= TIMEOUTS.SPOILER) {
      if (!speak("no_spoilers.ogg")) return
      rto.phase = "reverser"
      rto.phaseStartTime = now
    }
    return
  }

  if (reverseSelected(t)) {
    if (!speak("reverse_thr.ogg")) return
    resetRto(rto)
  } else if (elapsed >= TIMEOUTS.REVERSER) {
    if (!speak("no_reverse.ogg")) return
    resetRto(rto)
  }
}

// ─── Approach deviation calls ────────────────────────────────────────
// FCOM "flight parameters, approach"; re-armed at most every 5 s so a value on the limit doesn't chatter

type DeviationCall = "sinkRate" | "bank"

const DEVIATION_MIN_RA = 50
const DEVIATION_MAX_RA = 1000
const DEVIATION_REARM_MS = 5000

const DEVIATION_SOUNDS: Record<DeviationCall, string> = {
  sinkRate: "sink_rate.ogg",
  bank: "bank.ogg"
}

function exceededDeviations(t: Telemetry): Record<DeviationCall, boolean> {
  return {
    sinkRate: t.vs < -1000,
    bank: Math.abs(t.bankDegrees ?? 0) > 10
  }
}

const newDeviationState = (): Record<DeviationCall, number | null> => ({
  sinkRate: null,
  bank: null
})

export function useCallouts() {
  const soundQueue = useRef<string[]>([])
  const prev = useRef<PreviousValues>({ speed: 0, alt: 0, onGround: 1, fcpAlt: 0 })
  const goAroundCount = useRef(useGoAroundStore.getState().count)

  const state = useRef<CalloutState>({
    calledThrustSet: false,
    called80to: false,
    called80ldg: false,
    called60: false,
    calledVr: false,
    calledV1: false,
    vrInhibit: false,
    v1Inhibit: false,
    positiveClimb: false,
    tenThousandClimb: false,
    tenThousandDescent: false,
    transitionAltitude: false,
    transitionLevel: false,
    oneToGo: false,
    wasAirborne: false,
    phase: "idle",
    phaseStartTime: null,
    readySince: null,
    pauseMs: CALL_PAUSE.MIN,
    done: false
  })

  const rto = useRef<RtoState>({ active: false, phase: "spoilers", phaseStartTime: null })
  const rtoCount = useRef(useRtoStore.getState().count)

  // The disarm callout is armed on touchdown or on a reject, and closes once the aircraft has stopped
  const disarm = useRef<DisarmState>({ armed: false, called: false })

  // When each deviation call last played, or null while it is armed
  const deviationCalledAt = useRef<Record<DeviationCall, number | null>>(newDeviationState())
  // Takeoff and go-around pitch and climb would trip the approach limits, so the calls wait until the next approach
  const deviationInhibited = useRef(true)
  // Set on a go-around and cleared once the climb away from the approach has started
  const goAroundClimbing = useRef(false)

  useEffect(
    () =>
      useGoAroundStore.subscribe((s) => {
        if (s.count !== goAroundCount.current) {
          goAroundCount.current = s.count
          state.current.positiveClimb = false
          deviationInhibited.current = true
          goAroundClimbing.current = true
        }
      }),
    []
  )

  useEffect(() => {
    return useRtoStore.subscribe((s) => {
      if (s.count === rtoCount.current) return
      rtoCount.current = s.count
      const t = useTelemetryStore.getState().telemetry
      // Only on the ground above 40 kt, so a stray "stop" at the gate or in the cruise does nothing
      if (!t || !t.onGround || t.ias <= RTO_ARM_MIN_IAS) return
      // A second "stop" while the reject is already running would restart the
      // sequence and repeat the callouts
      if (rto.current.active) return
      resetRto(rto.current)
      rto.current.active = true
      rto.current.phaseStartTime = Date.now()
      // The brakes go on during the reject, so the disarm callout is armed from here
      armDisarm(disarm.current)
    })
  }, [])

  const runCrossings = (telemetry: Telemetry, p: PreviousValues) => {
    const {
      takeoff: { transitionAltitude },
      landing: { transitionLevel }
    } = usePerformanceStore.getState()
    const t = telemetry
    const st = state.current
    const q = soundQueue.current

    const ias = t.ias ?? 0
    const alt = t.alt ?? 0
    const vs = t.vs ?? 0
    const v1 = t.v1 ?? 0
    const vr = t.vr ?? 0
    const onGround = !!t.onGround
    const fcpAlt = t.fcpAlt ?? 0
    const now = Date.now()

    if (fcpAlt !== p.fcpAlt) st.oneToGo = false

    // Transition State Transitions Edge Calculations
    if (!onGround && p.onGround) {
      Object.assign(st, {
        called80to: false,
        calledThrustSet: false,
        vrInhibit: false,
        v1Inhibit: false,
        calledV1: false,
        calledVr: false,
        positiveClimb: false,
        tenThousandClimb: false,
        transitionAltitude: false,
        oneToGo: false
      })
      // A new takeoff cycle re-arms the disarm callout for the next landing
      disarm.current.armed = false
      disarm.current.called = false
    } else if (onGround && !p.onGround) {
      Object.assign(st, {
        called80ldg: false,
        called60: false,
        vrInhibit: true,
        v1Inhibit: true,
        tenThousandDescent: false,
        transitionLevel: false,
        oneToGo: false
      })
    }

    if (onGround) {
      if (
        !st.calledThrustSet &&
        !st.called80to &&
        [t.engine1N1 ?? 0, t.engine2N1 ?? 0, t.engine3N1 ?? 0].every((n) => n >= 90)
      ) {
        st.calledThrustSet = true
        st.v1Inhibit = false // ← clear inhibits set by previous landing
        st.vrInhibit = false // ← clear inhibits set by previous landing
        q.push("thrust_set.ogg")
      }
      if (crossedUp(p.speed, ias, 80) && !st.called80to && st.calledThrustSet) {
        st.called80to = true
        q.push("80_knots_clamp.ogg")
      }
      if (v1 > 0 && !st.calledV1 && !st.v1Inhibit && crossedUp(p.speed, ias, v1)) {
        st.calledV1 = true
        q.push("v_one.ogg")
      }
      if (vr > 0 && !st.calledVr && !st.vrInhibit && st.calledV1 && crossedUp(p.speed, ias, vr)) {
        st.calledVr = true
        q.push("rotate.ogg")
      }
      if (crossedDown(p.speed, ias, 80) && !st.called80ldg) {
        st.called80ldg = true
        playSound("80_knots.ogg")
      }
      if (crossedDown(p.speed, ias, 60) && !st.called60) {
        st.called60 = true
        playSound("60_knots.ogg")
      }
      if (ias < 30) {
        if (st.done)
          Object.assign(st, {
            calledThrustSet: false,
            calledV1: false,
            calledVr: false,
            called80to: false,
            called60: false,
            called80ldg: false,
            vrInhibit: false,
            v1Inhibit: false
          })
        resetLanding(st)
      }
    } else {
      if (vs > 120 && (t.radioAlt ?? 0) > 30 && !st.positiveClimb) {
        st.positiveClimb = true
        playSound("positive_climb.ogg")
      }
      if (vs > 100 && !st.tenThousandClimb && crossedUp(p.alt, alt, 10000)) {
        st.tenThousandClimb = true
        st.tenThousandDescent = false
        playSound(transitionAltitude < 10000 ? "fl_100.ogg" : "ten_thousand.ogg")
      }
      if (vs < -100 && !st.tenThousandDescent && crossedDown(p.alt, alt, 10000)) {
        st.tenThousandDescent = true
        st.tenThousandClimb = false
        playSound(transitionLevel < 10000 ? "fl_100.ogg" : "ten_thousand.ogg")
      }
      if (fcpAlt > 0 && !st.oneToGo) {
        if (
          (vs > 100 && crossedUp(p.alt, alt, fcpAlt - 1000)) ||
          (vs < -100 && crossedDown(p.alt, alt, fcpAlt + 1000))
        ) {
          st.oneToGo = true
          playSound("one_to_go.ogg")
        }
      }
      if (!st.transitionAltitude && vs > 100 && transitionAltitude > 0 && crossedUp(p.alt, alt, transitionAltitude)) {
        st.transitionAltitude = true

        if (!isStandardBaro(t.cptBaro)) {
          playSound("transiton_altitude.ogg")
        }
      }
      if (!st.transitionLevel && transitionLevel > 0 && vs < -100 && crossedDown(p.alt, alt, transitionLevel)) {
        st.transitionLevel = true
        playSound("transiton_level.ogg")
      }
    }

    // Landing sequence state logic tree overrides
    // Height rather than a climb, so a flight started on approach still arms; a bounce stays below 100 ft
    if (!onGround && (t.radioAlt ?? 0) > 100) st.wasAirborne = true
    if (onGround && !st.done && st.phase === "idle") {
      if (st.wasAirborne) {
        advancePhase(st, "spoilers", now)
        st.wasAirborne = false
        armDisarm(disarm.current)
      } else if ((t.spoilersHandlePosition ?? 0) > 0.1 && !st.calledThrustSet && ias > 60) {
        advancePhase(st, "spoilers", now)
        armDisarm(disarm.current)
      }
    }
    if (!onGround && vs > 500) {
      if (st.phase !== "idle" || st.done) resetLanding(st)
      st.wasAirborne = false
    }
  }

  useEffect(() => {
    return useTelemetryStore.subscribe((snapshotState) => {
      const t = snapshotState.telemetry
      if (!t || t.isSlewActive) return
      const snapshot = { ...prev.current }
      prev.current = {
        speed: t.ias,
        alt: t.alt,
        onGround: t.onGround,
        fcpAlt: t.fcpAlt ?? 0
      }
      runCrossings(t, snapshot)
    })
  }, [])

  useTelemetryTick(async () => {
    if (await isSoundPlaying()) {
      // The FO speaks a moment after the last callout finishes, so the
      // indication pause counts from its end
      state.current.readySince = null
      return
    }
    const next = soundQueue.current.shift()
    if (next) {
      playSound(next)
      return
    }
    const t = useTelemetryStore.getState().telemetry
    // Slewed telemetry is not a real flight state, so no indication counts
    if (!t || t.isSlewActive) return
    const now = Date.now()

    // One callout per tick, so the RTO, the disarm, the deviation calls and the
    // landing sequence never talk over each other
    let calledThisTick = false
    const speak = (file: string): boolean => {
      if (calledThisTick) return false
      calledThisTick = true
      playSound(file)
      return true
    }

    // Rejected takeoff — its own sequence; the landing sequence is untouched
    if (rto.current.active) {
      if (!t.onGround || (t.ias ?? 0) < RTO_END_IAS) {
        resetRto(rto.current)
      } else {
        const elapsed = rto.current.phaseStartTime ? now - rto.current.phaseStartTime : 0
        handleRto(rto.current, t, elapsed, now, speak)
      }
    }

    // Autobrake disarm — the brakes are stamped while the ABS indication is on,
    // so the deceleration is manual and the autobrake is not helping
    const ab = disarm.current
    if (ab.armed) {
      if (!t.onGround || (t.ias ?? 0) < DISARM_MIN_IAS) {
        // The window closes once the aircraft has stopped; a new takeoff re-arms it
        ab.armed = false
      } else if (!ab.called && brakesApplied(t) && (t.absindic ?? 0) > 0.5) {
        // Only latch it once the sound went out, so a tick taken by another
        // callout retries it
        if (speak("autobrake_disarm.ogg")) ab.called = true
      }
    }

    // Approach deviation calls
    if (t.onGround) {
      deviationInhibited.current = true
      goAroundClimbing.current = false
    } else {
      if (goAroundClimbing.current && (t.vs ?? 0) > 0) {
        // The climb away from the approach has started, so the next descent re-arms the calls
        goAroundClimbing.current = false
      }
      if ((t.radioAlt ?? 0) > DEVIATION_MAX_RA) {
        deviationInhibited.current = false
      } else if (
        !goAroundClimbing.current &&
        (t.landingGear ?? 0) > 0.5 &&
        (t.vs ?? 0) < 0 &&
        (t.radioAlt ?? 0) >= DEVIATION_MIN_RA
      ) {
        // Gear down and descending on short final — an approach, even when the
        // app was started below the 1,000 ft window
        deviationInhibited.current = false
      }
    }

    const inDeviationWindow =
      useSettingsStore.getState().deviationCallsEnabled &&
      !deviationInhibited.current &&
      !t.onGround &&
      (t.landingGear ?? 0) > 0.5 &&
      (t.radioAlt ?? 0) >= DEVIATION_MIN_RA &&
      (t.radioAlt ?? 0) <= DEVIATION_MAX_RA

    if (inDeviationWindow) {
      const exceeded = exceededDeviations(t)
      const calledAt = deviationCalledAt.current
      const pending = (Object.keys(exceeded) as DeviationCall[]).filter((call) => {
        if (!exceeded[call]) {
          const at = calledAt[call]
          if (at !== null && now - at >= DEVIATION_REARM_MS) calledAt[call] = null
          return false
        }
        return calledAt[call] === null
      })

      // One call per tick so they never talk over each other or the other callouts
      if (pending.length > 0 && speak(DEVIATION_SOUNDS[pending[0]])) {
        calledAt[pending[0]] = now
      }
    } else {
      deviationCalledAt.current = newDeviationState()
    }

    const ls = state.current
    if (ls.phase === "idle") return
    const elapsed = ls.phaseStartTime ? now - ls.phaseStartTime : 0
    const handler = PHASE_HANDLERS[ls.phase as Exclude<LandingPhase, "idle">]
    if (typeof handler === "function") {
      handler(ls, t, elapsed, now, speak)
    } else {
      console.warn(`[useCallouts] Unknown landing phase: ${ls.phase}`)
      resetLanding(ls)
    }
  })
}
