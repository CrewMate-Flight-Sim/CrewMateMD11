import { useEffect, useRef, useCallback } from "react"

import { playSound, isSoundPlaying } from "@/services/playSounds"
import { useGoAroundStore } from "@/store/goAroundStore"
import { usePerformanceStore } from "@/store/performanceStore"
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
  done: boolean
}

interface PreviousValues {
  speed: number
  alt: number
  radioAlt: number
  onGround: number
  cabinIsReady: number
  fcpAlt: number
}

const crossedUp = (p: number, c: number, t: number) => p < t && c >= t
const crossedDown = (p: number, c: number, t: number) => p > t && c <= t
const TIMEOUTS = { SPOILER: 3000, REVERSER: 3000, DECEL: 10000 }

const advancePhase = (ls: CalloutState, next: LandingPhase, now: number) => {
  ls.phase = next
  ls.phaseStartTime = now
}
const completeLanding = (ls: CalloutState) => {
  ls.phase = "idle"
  ls.phaseStartTime = null
  ls.done = true
}
const resetLanding = (ls: CalloutState) => {
  ls.phase = "idle"
  ls.phaseStartTime = null
  ls.done = false
}

const phaseHandlers: Record<
  Exclude<LandingPhase, "idle">,
  (ls: CalloutState, t: Record<string, number>, elapsed: number, now: number) => void
> = {
  spoilers: (ls, t, elapsed, now) => {
    if ((t.spoilersHandlePosition ?? 0) > 0.1) {
      playSound("spoilers_dep.ogg")
      advancePhase(ls, "reverser", now)
    } else if (elapsed >= TIMEOUTS.SPOILER) {
      playSound("no_spoilers.ogg")
      advancePhase(ls, "reverser", now)
    }
  },
  reverser: (ls, t, elapsed, now) => {
    if ((t.eng1_reverse ?? 0) > 0.1 || (t.eng2_reverse ?? 0) > 0.1 || (t.eng3_reverse ?? 0) > 0.1) {
      playSound("reverse_thr.ogg")
      advancePhase(ls, "decel", now)
    } else if (elapsed >= TIMEOUTS.REVERSER) {
      playSound("no_reverse.ogg")
      advancePhase(ls, "decel", now)
    }
  },
  decel: (ls, t, elapsed) => {
    if (
      (((t.brakeLeftPosition ?? 0) > 0.1 || (t.brakeRightPosition ?? 0) > 0.1) && (t.ias ?? 0) > 40) ||
      elapsed >= TIMEOUTS.DECEL
    ) {
      completeLanding(ls)
    }
  }
}

export function useCallouts() {
  const soundQueue = useRef<string[]>([])
  const prev = useRef<PreviousValues>({ speed: 0, alt: 0, radioAlt: 0, onGround: 1, cabinIsReady: 0, fcpAlt: 0 })
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
    done: false
  })

  useEffect(
    () =>
      useGoAroundStore.subscribe((s) => {
        if (s.count !== goAroundCount.current) {
          goAroundCount.current = s.count
          state.current.positiveClimb = false
        }
      }),
    []
  )

  const runCrossings = useCallback((telemetry: Telemetry, p: PreviousValues) => {
    const {
      takeoff: { transitionAltitude },
      landing: { transitionLevel }
    } = usePerformanceStore.getState()
    const t = telemetry as unknown as Record<string, number>
    const st = state.current
    const q = soundQueue.current

    const ias = t.ias ?? 0
    const alt = t.alt ?? 0
    const vs = t.vs ?? 0
    const v1 = t.v1 ?? 0
    const vr = t.vr ?? 0
    const onGround = !!t.onGround
    const fcpAlt = t.fcp_alt ?? 0
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
        [t.engineN1_1 ?? 0, t.engineN1_2 ?? 0, t.engineN1_3 ?? 0].every((n) => n >= 90)
      ) {
        st.calledThrustSet = true
        q.push("thrust_set.ogg")
      }
      if (crossedUp(p.speed, ias, 80) && !st.called80to && st.calledThrustSet) {
        st.called80to = true
        q.push("80_knots_clamp.ogg")
      }
      if (v1 > 0 && !st.calledV1 && crossedUp(p.speed, ias, v1)) {
        st.calledV1 = true
        q.push("v_one.ogg")
      }
      if (vr > 0 && !st.calledVr && st.calledV1 && crossedUp(p.speed, ias, vr)) {
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
        playSound(transitionAltitude < 10000 ? "fl_100.ogg" : "ten_thousand.ogg")
      }
      if (vs < -100 && !st.tenThousandDescent && crossedDown(p.alt, alt, 10000)) {
        st.tenThousandDescent = true
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
      if (!st.transitionAltitude && transitionAltitude > 0 && crossedUp(p.alt, alt, transitionAltitude)) {
        st.transitionAltitude = true
        playSound("transiton_altitude.ogg")
      }
      if (!st.transitionLevel && transitionLevel > 0 && crossedDown(p.alt, alt, transitionLevel)) {
        st.transitionLevel = true
        playSound("transiton_level.ogg")
      }
    }

    // Landing sequence state logic tree overrides
    if (!onGround && vs > 200) st.wasAirborne = true
    if (onGround && !st.done && st.phase === "idle") {
      if (st.wasAirborne) {
        advancePhase(st, "spoilers", now)
        st.wasAirborne = false
      } else if ((t.spoilersHandlePosition ?? 0) > 0.1 && ias > 60) {
        advancePhase(st, "spoilers", now)
      }
    }
    if (!onGround && vs > 500) {
      if (st.phase !== "idle" || st.done) resetLanding(st)
      st.wasAirborne = false
    }
  }, [])

  useEffect(() => {
    return useTelemetryStore.subscribe((snapshotState) => {
      const t = snapshotState.telemetry
      if (!t || t.isSlewActive) return
      const snapshot = { ...prev.current }
      prev.current = {
        speed: t.ias,
        alt: t.alt,
        radioAlt: t.radioAlt,
        onGround: t.onGround,
        cabinIsReady: snapshot.cabinIsReady,
        fcpAlt: t.fcp_alt ?? 0
      }
      runCrossings(t, snapshot)
    })
  }, [runCrossings])

  useEffect(() => {
    const id = setInterval(async () => {
      if (await isSoundPlaying()) return
      const next = soundQueue.current.shift()
      if (next) {
        playSound(next)
        return
      }
      const ls = state.current
      if (ls.phase === "idle") return
      const telemetryState = useTelemetryStore.getState().telemetry
      if (!telemetryState) return
      const now = Date.now()
      const elapsed = ls.phaseStartTime ? now - ls.phaseStartTime : 0
      const handler = phaseHandlers[ls.phase as Exclude<LandingPhase, "idle">]
      if (typeof handler === "function") {
        handler(ls, telemetryState as unknown as Record<string, number>, elapsed, now)
      } else {
        console.warn(`[useCallouts] Unknown landing phase: ${ls.phase}`)
        resetLanding(ls)
      }
    }, 100)
    return () => clearInterval(id)
  }, [])
}
