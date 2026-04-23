import { useEffect, useRef, useCallback } from "react"

import { playSound, isSoundPlaying } from "@/services/playSounds"
import { useGoAroundStore } from "@/store/goAroundStore"
import { usePassingAltitudeStore } from "@/store/passingAltitudeStore"
import { usePerformanceStore } from "@/store/performanceStore"
import { useTelemetryStore } from "@/store/telemetryStore"
import type { Telemetry } from "@/store/telemetryStore"

type LandingPhase = "idle" | "spoilers" | "reverser" | "decel"

interface SpeedCalloutFlags {
  calledThrustSet: boolean
  called80to: boolean
  called80ldg: boolean
  called60: boolean
  calledVr: boolean
  calledV1: boolean
  vrInhibit: boolean
  v1Inhibit: boolean
}

interface AltitudeCalloutFlags {
  positiveClimb: boolean
  tenThousandClimb: boolean
  tenThousandDescent: boolean
  transitionAltitude: boolean
  transitionLevel: boolean
  oneToGo: boolean
}

interface LandingSequenceState {
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
  takeoffN1: number
  fcpAlt: number
}

const crossedUp = (prev: number, curr: number, threshold: number) => prev < threshold && curr >= threshold

const crossedDown = (prev: number, curr: number, threshold: number) => prev > threshold && curr <= threshold

const waitForSoundToStop = async (timeoutMs = 20000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await isSoundPlaying())) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

const waitForVrSpeed = async (vr: number, timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ias = useTelemetryStore.getState().telemetry?.ias ?? 0
    if (ias >= vr) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return false
}

/**
 * Build audio sequence for "standard crosschecked, passing FL XXX"
 * @param targetAlt Target altitude in feet
 * @returns Array of audio filenames to play in sequence
 */
export const buildPassingAltitudeSequence = (targetAlt: number): string[] => {
  const sequence: string[] = ["standard_cross_checked.ogg", "passing_flight_level.ogg"]

  const flightLevel = Math.round(targetAlt / 100)
  //  FL050, FL100, FL250, etc.
  const flString = flightLevel.toString().padStart(3, "0")

  // digit files
  for (const digit of flString) {
    sequence.push(`${digit}.ogg`)
  }

  return sequence
}

const advancePhase = (ls: LandingSequenceState, next: LandingPhase, now: number) => {
  ls.phase = next
  ls.phaseStartTime = now
}

const completeLanding = (ls: LandingSequenceState) => {
  ls.phase = "idle"
  ls.phaseStartTime = null
  ls.done = true
}

const resetLanding = (ls: LandingSequenceState) => {
  ls.phase = "idle"
  ls.phaseStartTime = null
  ls.done = false
}

// ─── Landing phase handlers ──────────────────────────────────────────────────

const SPOILER_TIMEOUT = 3000
const REVERSER_TIMEOUT = 3000
const DECEL_TIMEOUT = 10000

function handleSpoilersPhase(ls: LandingSequenceState, t: Telemetry, elapsed: number, now: number) {
  if (t.spoilersHandlePosition > 0.1) {
    playSound("spoilers_dep.ogg")
    advancePhase(ls, "reverser", now)
  } else if (elapsed >= SPOILER_TIMEOUT) {
    playSound("no_spoilers.ogg")
    advancePhase(ls, "reverser", now)
  }
}

function handleReverserPhase(ls: LandingSequenceState, t: Telemetry, elapsed: number, now: number) {
  if (t.eng1_reverse > 0.1 || t.eng2_reverse > 0.1 || t.eng3_reverse > 0.1) {
    playSound("reverse_thr.ogg")
    advancePhase(ls, "decel", now)
  } else if (elapsed >= REVERSER_TIMEOUT) {
    playSound("no_reverse.ogg")
    advancePhase(ls, "decel", now)
  }
}

function handleDecelPhase(ls: LandingSequenceState, t: Telemetry, elapsed: number) {
  const brakesApplied = t.brakeLeftPosition > 0.1 || t.brakeRightPosition > 0.1
  if (brakesApplied && t.ias > 40) {
    completeLanding(ls)
  } else if (elapsed >= DECEL_TIMEOUT) {
    completeLanding(ls)
  }
}

const phaseHandlers: Record<
  Exclude<LandingPhase, "idle">,
  (ls: LandingSequenceState, t: Telemetry, elapsed: number, now: number) => void
> = {
  spoilers: handleSpoilersPhase,
  reverser: handleReverserPhase,
  decel: handleDecelPhase
}

export function useCallouts() {
  const speed = useRef<SpeedCalloutFlags>({
    calledThrustSet: false,
    called80to: false,
    called80ldg: false,
    called60: false,
    calledVr: false,
    calledV1: false,
    vrInhibit: false,
    v1Inhibit: false
  })

  const altitude = useRef<AltitudeCalloutFlags>({
    positiveClimb: false,
    tenThousandClimb: false,
    tenThousandDescent: false,
    transitionAltitude: false,
    transitionLevel: false,
    oneToGo: false
  })

  const landing = useRef<LandingSequenceState>({
    wasAirborne: false,
    phase: "idle",
    phaseStartTime: null,
    done: false
  })

  const prev = useRef<PreviousValues>({
    speed: 0,
    alt: 0,
    radioAlt: 0,
    onGround: 1,
    cabinIsReady: 0,
    takeoffN1: 0,
    fcpAlt: 0
  })

  const thrustSetPrimed = useRef(false)
  const ticking = useRef(false)

  // Prevents V1/VR sequence re-entering while the async queue is running
  const v1VrQueued = useRef(false)

  // Re-arm positive-climb callout on go-around
  const goAroundCount = useRef(useGoAroundStore.getState().count)
  useEffect(() => {
    return useGoAroundStore.subscribe((s) => {
      if (s.count !== goAroundCount.current) {
        goAroundCount.current = s.count
        altitude.current.positiveClimb = false
      }
    })
  }, [])

  const tick = useCallback(async () => {
    if (ticking.current) return
    ticking.current = true

    try {
      const t = useTelemetryStore.getState().telemetry
      if (!t || t.isSlewActive) return

      const perf = usePerformanceStore.getState()
      const transitionAltitude = perf.takeoff.transitionAltitude
      const transitionLevel = perf.landing.transitionLevel

      const sp = speed.current
      const al = altitude.current
      const ls = landing.current
      const p = prev.current
      const v1 = t.v1 ?? 0
      const vr = t.vr ?? 0
      const now = Date.now()
      const takeoffN1 = Math.min(t.engineN1_1 ?? 0, t.engineN1_2 ?? 0)
      const fcpAlt = t.fcp_alt ?? 0

      if (!thrustSetPrimed.current) {
        thrustSetPrimed.current = true
        p.takeoffN1 = takeoffN1
      }

      // Re-arm one-to-go when FCP altitude changes
      if (fcpAlt !== p.fcpAlt) {
        al.oneToGo = false
      }

      // Takeoff / landing edge detection
      if (!t.onGround && p.onGround) {
        sp.called80to = false
        sp.calledThrustSet = false
        sp.vrInhibit = true
        sp.v1Inhibit = true
        al.positiveClimb = false
        al.tenThousandClimb = false
        al.transitionAltitude = false
        al.oneToGo = false
      }

      if (t.onGround && !p.onGround) {
        sp.called80ldg = false
        sp.called60 = false
        sp.vrInhibit = true
        sp.v1Inhibit = true
        al.tenThousandDescent = false
        al.transitionLevel = false
        al.oneToGo = false
      }

      // Prevent re-entry while async sequence is running
      if (v1VrQueued.current) return

      // ── V1 / VR queue ──────────────────────────────────────────────────────
      // Uses crossing detection + async queue for reliability
      if (t.onGround && !sp.v1Inhibit && v1 > 0 && !sp.calledV1 && crossedUp(p.speed, t.ias, v1)) {
        sp.calledV1 = true
        sp.v1Inhibit = true
        v1VrQueued.current = true
        ;(async () => {
          try {
            try {
              await playSound("v_one.ogg")
            } catch (e) {
              console.warn("V1 sound failed, continuing", e)
            }
            const vrReachedPromise = vr > 0 ? waitForVrSpeed(vr) : Promise.resolve(false)
            await waitForSoundToStop(20000)
            if (vr > 0 && (await vrReachedPromise)) await playSound("rotate.ogg")
          } finally {
            v1VrQueued.current = false
          }
        })()
      }

      // 80 knots callout (departure)
      if (t.onGround && t.ias >= 80 && !sp.called80to) {
        await playSound("80_knots_clamp.ogg")
        sp.called80to = true
      }

      // 80 knots callout (landing)
      if (t.onGround && crossedDown(p.speed, t.ias, 80) && !sp.called80ldg) {
        playSound("80_knots.ogg")
        sp.called80ldg = true
      }

      if (t.onGround && crossedDown(p.speed, t.ias, 60) && !sp.called60) {
        playSound("60_knots.ogg")
        sp.called60 = true
      }

      // Thrust set callout logic
      // Awaited so it finishes before the next tick can fire the 80kt callout
      if (t.onGround && !sp.calledThrustSet && !sp.called80to) {
        const eng1 = t.engineN1_1 ?? 0
        const eng2 = t.engineN1_2 ?? 0
        const eng3 = t.engineN1_3 ?? 0
        if (eng1 >= 90 && eng2 >= 90 && eng3 >= 90) {
          sp.calledThrustSet = true
          await playSound("thrust_set.ogg")
        }
      }

      // Positive climb
      if (!t.onGround && t.vs > 120 && t.radioAlt > 30 && !al.positiveClimb) {
        playSound("positive_climb.ogg")
        al.positiveClimb = true
      }

      // Ten thousand feet
      if (!t.onGround && t.vs > 100 && !al.tenThousandClimb && crossedUp(p.alt, t.alt, 10000)) {
        playSound(transitionAltitude < 10000 ? "fl_100.ogg" : "ten_thousand.ogg")
        al.tenThousandClimb = true
      }

      if (!t.onGround && t.vs < -100 && !al.tenThousandDescent && crossedDown(p.alt, t.alt, 10000)) {
        playSound(transitionLevel < 10000 ? "fl_100.ogg" : "ten_thousand.ogg")
        al.tenThousandDescent = true
      }

      // One to go
      if (!t.onGround && t.vs > 100 && !al.oneToGo && fcpAlt > 0 && crossedUp(p.alt, t.alt, fcpAlt - 1000)) {
        playSound("one_to_go.ogg")
        al.oneToGo = true
      }

      if (!t.onGround && t.vs < -100 && !al.oneToGo && fcpAlt > 0 && crossedDown(p.alt, t.alt, fcpAlt + 1000)) {
        playSound("one_to_go.ogg")
        al.oneToGo = true
      }

      // Transition altitude / level
      if (
        !t.onGround &&
        t.vs > 100 &&
        !al.transitionAltitude &&
        transitionAltitude > 0 &&
        crossedUp(p.alt, t.alt, transitionAltitude)
      ) {
        playSound("transiton_altitude.ogg")
        al.transitionAltitude = true
      }

      if (
        !t.onGround &&
        t.vs < -100 &&
        !al.transitionLevel &&
        transitionLevel > 0 &&
        crossedDown(p.alt, t.alt, transitionLevel)
      ) {
        playSound("transiton_level.ogg")
        al.transitionLevel = true
      }

      // Passing altitude "now" callout
      const passingAltStore = usePassingAltitudeStore.getState()
      if (passingAltStore.targetAltitude !== null && !passingAltStore.hasCalled) {
        const altReached = t.alt >= passingAltStore.targetAltitude
        const pAltReached = t.pAlt >= passingAltStore.targetAltitude

        if (altReached || pAltReached) {
          playSound("now_at.ogg")
          passingAltStore.markCalled()
          setTimeout(() => {
            passingAltStore.reset()
          }, 500)
        }
      }

      // Re-arm after a completed landing when taxiing below 30 knots
      if (t.onGround && t.ias < 30 && ls.done) {
        sp.calledThrustSet = false
        sp.calledV1 = false
        sp.calledVr = false
        sp.called80to = false
        sp.called60 = false
        sp.called80ldg = false
        sp.vrInhibit = false
        sp.v1Inhibit = false
        thrustSetPrimed.current = false
        v1VrQueued.current = false
        usePassingAltitudeStore.getState().reset()
      }

      // Landing sequence

      // Track sustained airborne (vs > 200 filters ground bounces)
      if (!t.onGround && t.vs > 200) {
        ls.wasAirborne = true
      }

      // Arm: landing (was airborne → now on ground)
      if (t.onGround && ls.wasAirborne && ls.phase === "idle" && !ls.done) {
        advancePhase(ls, "spoilers", now)
        ls.wasAirborne = false
      }

      // Arm: RTO (never airborne, spoilers deployed at speed)
      if (
        t.onGround &&
        !ls.wasAirborne &&
        ls.phase === "idle" &&
        !ls.done &&
        t.spoilersHandlePosition > 0.1 &&
        t.ias > 60
      ) {
        advancePhase(ls, "spoilers", now)
      }

      // Reset on sustained climb-away
      if (!t.onGround && t.vs > 500) {
        if (ls.phase !== "idle" || ls.done) {
          usePassingAltitudeStore.getState().reset()
        }
        resetLanding(ls)
        ls.wasAirborne = false
      }

      // Reset on taxi
      if (t.onGround && t.ias < 30) {
        resetLanding(ls)
      }

      // Process landing phases (skip if idle or audio still playing)
      if (ls.phase !== "idle" && !(await isSoundPlaying())) {
        const elapsed = ls.phaseStartTime ? now - ls.phaseStartTime : 0
        const handler = (
          phaseHandlers as Record<
            string,
            (ls: LandingSequenceState, t: Telemetry, elapsed: number, now: number) => void
          >
        )[ls.phase]
        if (typeof handler === "function") {
          handler(ls, t, elapsed, now)
        } else {
          console.warn(`[useCallouts] Unknown landing phase: ${ls.phase}`)
          resetLanding(ls)
        }
      }

      // Update previous values
      p.speed = t.ias
      p.alt = t.alt
      p.radioAlt = t.radioAlt
      p.onGround = t.onGround
      p.takeoffN1 = takeoffN1
      p.fcpAlt = fcpAlt
    } finally {
      ticking.current = false
    }
  }, [])

  useEffect(() => {
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [tick])
}
