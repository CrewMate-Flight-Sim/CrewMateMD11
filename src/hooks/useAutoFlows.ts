import { useEffect, useRef, useCallback } from "react"

import { executeFlow } from "@/services/flowRunner"
import { useFlowStore } from "@/store/flowStore"
import { useGoAroundStore } from "@/store/goAroundStore"
import { useTelemetryStore } from "@/store/telemetryStore"

interface TriggeredFlags {
  afterStart: boolean
  afterTakeoff: boolean
  climbTenK: boolean
  des: boolean
  descTenK: boolean
  shutdownP1: boolean
  shutdownP2: boolean
}

interface PrevValues {
  onGround: number
  flapsIndex: number
  landingGear: number
  alt: number
  mixture1: number
  mixture2: number
  mixture3: number
  taxiLight: number
}

export function useAutoFlows() {
  const triggered = useRef<TriggeredFlags>({
    afterStart: false,
    afterTakeoff: false,
    climbTenK: false,
    des: false,
    descTenK: false,
    shutdownP1: false,
    shutdownP2: false
  })

  const prev = useRef<PrevValues>({
    onGround: 1,
    flapsIndex: 0,
    landingGear: 1,
    alt: 0,
    mixture1: 1,
    mixture2: 1,
    mixture3: 1,
    taxiLight: 0
  })

  const engineN1AboveThresholdSince = useRef<number | null>(null)
  const descentSince = useRef<number | null>(null)
  const phase = useRef<"ground" | "airborne">("ground")
  const primed = useRef(false)
  const taxiLightTurnedOff = useRef(false) // FIX 1: latch for taxi light edge

  const goAroundCount = useRef(useGoAroundStore.getState().count)
  useEffect(() => {
    return useGoAroundStore.subscribe((s) => {
      if (s.count !== goAroundCount.current) {
        goAroundCount.current = s.count
        triggered.current.afterTakeoff = false
      }
    })
  }, [])

  const tick = useCallback(() => {
    const t = useTelemetryStore.getState().telemetry
    if (!t || t.isSlewActive) return

    if (!primed.current) {
      primed.current = true
      prev.current.onGround = t.onGround
      prev.current.flapsIndex = t.flapsIndex ?? 0
      prev.current.landingGear = t.landingGear ?? 1
      prev.current.alt = t.alt ?? 0
      prev.current.mixture1 = t.mixture1 ?? 1
      prev.current.mixture2 = t.mixture2 ?? 1
      prev.current.mixture3 = t.mixture3 ?? 1
      prev.current.taxiLight = t.taxiLight ?? 0
      phase.current = t.onGround ? "ground" : "airborne"

      // FIX 2: use same threshold (23) as main loop to avoid spurious afterStart on relaunch
      if ((t.engineN1_2 ?? 0) > 23) {
        triggered.current.afterStart = true
        engineN1AboveThresholdSince.current = Date.now()
      }

      return
    }

    const fl = triggered.current
    const p = prev.current
    const isRunning = useFlowStore.getState().executionState === "running"
    const eng2N1 = t.engineN1_2 ?? 0

    // N1 threshold tracking
    if (eng2N1 > 23) {
      if (engineN1AboveThresholdSince.current === null) {
        engineN1AboveThresholdSince.current = Date.now()
      }
    } else {
      engineN1AboveThresholdSince.current = null
    }

    // Descent timer tracking
    if (!t.onGround && t.vs < -200 && t.alt > 15000) {
      if (descentSince.current === null) descentSince.current = Date.now()
    } else {
      descentSince.current = null
    }

    // FIX 1: latch taxi light off edge so parking brake can come after
    if (p.taxiLight !== 0 && (t.taxiLight ?? 0) === 0) {
      taxiLightTurnedOff.current = true
    }

    if (phase.current === "ground" && !t.onGround && t.vs > 200) {
      phase.current = "airborne"
      fl.afterStart = false
    }

    if (phase.current === "airborne" && t.onGround && t.ias < 80) {
      phase.current = "ground"
      taxiLightTurnedOff.current = false // reset latch on landing
      fl.afterTakeoff = false
      fl.climbTenK = false
      fl.des = false
      fl.descTenK = false
      fl.shutdownP1 = false
      fl.shutdownP2 = false
    }

    if (!isRunning) {
      if (
        !fl.afterStart &&
        t.onGround &&
        engineN1AboveThresholdSince.current !== null &&
        Date.now() - engineN1AboveThresholdSince.current >= 4000
      ) {
        fl.afterStart = true
        executeFlow("after_start")
      } else if (!fl.afterTakeoff && !t.onGround && p.flapsIndex > 0 && t.flapsIndex === 0) {
        fl.afterTakeoff = true
        executeFlow("after_takeoff")
      } else if (!fl.climbTenK && !t.onGround && t.vs > 100 && p.alt < 10000 && t.alt >= 10000) {
        fl.climbTenK = true
        executeFlow("climb_ten_thousand_flow")
      } else if (!fl.des && !t.onGround && descentSince.current !== null && Date.now() - descentSince.current >= 5000) {
        fl.des = true
        executeFlow("des")
      } else if (!fl.descTenK && !t.onGround && t.vs < -100 && p.alt > 10000 && t.alt <= 10000) {
        fl.descTenK = true
        executeFlow("desc_ten_thousand_flow")
      } else if (!fl.shutdownP1 && t.onGround && t.parkingBrake === 1 && taxiLightTurnedOff.current) {
        // FIX 1: use latched flag instead of same-frame edge detection
        fl.shutdownP1 = true
        taxiLightTurnedOff.current = false
        executeFlow("shutdownP1")
      } else if (
        !fl.shutdownP2 &&
        t.onGround &&
        (p.mixture1 === 1 || p.mixture2 === 1 || p.mixture3 === 1) &&
        t.mixture1 === 0 &&
        t.mixture2 === 0 &&
        t.mixture3 === 0
      ) {
        fl.shutdownP2 = true
        executeFlow("shutdownP2")
      }
    }

    p.taxiLight = t.taxiLight ?? 0
    p.onGround = t.onGround
    p.flapsIndex = t.flapsIndex ?? 0
    p.landingGear = t.landingGear ?? 1
    p.alt = t.alt ?? 0
    p.mixture1 = t.mixture1 ?? 1
    p.mixture2 = t.mixture2 ?? 1
    p.mixture3 = t.mixture3 ?? 1
  }, [])

  useEffect(() => {
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [tick])
}
