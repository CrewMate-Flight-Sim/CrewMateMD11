import { useEffect, useRef, useCallback } from "react"

import { executeFlow, isPostLandingTimerActive } from "@/services/flowRunner"
import { useFlowStore } from "@/store/flowStore"
import { useGoAroundStore } from "@/store/goAroundStore"
import { useTelemetryStore } from "@/store/telemetryStore"

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
  const triggered = useRef({
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
  const state = useRef({ phase: "ground" as "ground" | "airborne", primed: false, taxiLightTurnedOff: false })

  const goAroundCount = useRef(useGoAroundStore.getState().count)

  useEffect(
    () =>
      useGoAroundStore.subscribe((s) => {
        if (s.count !== goAroundCount.current) {
          goAroundCount.current = s.count
          triggered.current.afterTakeoff = false
        }
      }),
    []
  )

  const tick = useCallback(() => {
    const t = useTelemetryStore.getState().telemetry
    if (!t || t.isSlewActive) return

    const st = state.current
    const p = prev.current
    const fl = triggered.current

    if (!st.primed) {
      st.primed = true
      p.onGround = t.onGround
      p.flapsIndex = t.flapsIndex ?? 0
      p.landingGear = t.landingGear ?? 1
      p.alt = t.alt ?? 0
      p.mixture1 = t.mixture1 ?? 1
      p.mixture2 = t.mixture2 ?? 1
      p.mixture3 = t.mixture3 ?? 1
      p.taxiLight = t.taxiLight ?? 0
      st.phase = t.onGround ? "ground" : "airborne"

      if ((t.engineN1_2 ?? 0) > 23) {
        fl.afterStart = true
        engineN1AboveThresholdSince.current = Date.now()
      }
      return
    }

    const eng2N1 = t.engineN1_2 ?? 0
    const now = Date.now()

    engineN1AboveThresholdSince.current = eng2N1 > 23 ? (engineN1AboveThresholdSince.current ?? now) : null
    descentSince.current = !t.onGround && t.vs < -1000 && t.alt > 15000 ? (descentSince.current ?? now) : null

    if (p.taxiLight !== 0 && (t.taxiLight ?? 0) === 0) st.taxiLightTurnedOff = true

    if (st.phase === "ground" && !t.onGround && t.vs > 200) {
      st.phase = "airborne"
    } else if (st.phase === "airborne" && t.onGround && t.ias < 80) {
      st.phase = "ground"
      st.taxiLightTurnedOff = false
      fl.afterTakeoff = fl.climbTenK = fl.des = fl.descTenK = fl.shutdownP1 = fl.shutdownP2 = false
    }

    if (useFlowStore.getState().executionState !== "running") {
      if (
        !fl.afterStart &&
        t.onGround &&
        engineN1AboveThresholdSince.current !== null &&
        now - engineN1AboveThresholdSince.current >= 4000
      ) {
        fl.afterStart = true
        executeFlow("after_start")
      } else if (!fl.afterTakeoff && !t.onGround && p.flapsIndex > 0 && t.flapsIndex === 0) {
        fl.afterTakeoff = true
        executeFlow("after_takeoff")
      } else if (!fl.climbTenK && !t.onGround && t.vs > 100 && p.alt < 10000 && (t.alt ?? 0) >= 10000) {
        fl.climbTenK = true
        executeFlow("climb_ten_thousand_flow")
      } else if (!fl.des && !t.onGround && descentSince.current !== null && now - descentSince.current >= 5000) {
        fl.des = true
        executeFlow("des")
      } else if (!fl.descTenK && !t.onGround && t.vs < -100 && p.alt > 10000 && (t.alt ?? 0) <= 10000) {
        fl.descTenK = true
        executeFlow("desc_ten_thousand_flow")
      } else if (
        !fl.shutdownP1 &&
        t.onGround &&
        t.parkingBrake === 1 &&
        st.taxiLightTurnedOff &&
        !isPostLandingTimerActive()
      ) {
        fl.shutdownP1 = true
        st.taxiLightTurnedOff = false
        executeFlow("shutdownP1")
      } else if (
        !fl.shutdownP2 &&
        t.onGround &&
        (p.mixture1 === 1 || p.mixture2 === 1 || p.mixture3 === 1) &&
        !t.mixture1 &&
        !t.mixture2 &&
        !t.mixture3
      ) {
        fl.afterStart = false
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
