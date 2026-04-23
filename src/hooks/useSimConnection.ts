import { invoke } from "@tauri-apps/api/core"
import { listen, UnlistenFn } from "@tauri-apps/api/event"
import { useEffect, useRef } from "react"

import { getAircraftTitle } from "@/API/simvarApi"
import { useTelemetryStore } from "@/store/telemetryStore"
import type { Telemetry } from "@/store/telemetryStore"

const simVars = [
  { key: "timeOfDay", expression: "(E:TIME OF DAY,Enum)" },
  { key: "ias", expression: "(A:AIRSPEED INDICATED,Knots)" },
  { key: "alt", expression: "(A:INDICATED ALTITUDE,Feet)" },
  { key: "radioAlt", expression: "(A:PLANE ALT ABOVE GROUND,Feet)" },
  { key: "pAlt", expression: "(A:PRESSURE ALTITUDE,Feet)" },
  { key: "vs", expression: "(A:VERTICAL SPEED,Feet per minute)" },
  { key: "onGround", expression: "(A:SIM ON GROUND,Bool)" },
  { key: "isSlewActive", expression: "(A:IS SLEW ACTIVE,Bool)" },
  { key: "engineN1_1", expression: "(L:md11_eng1_n1)" },
  { key: "engineN1_2", expression: "(L:md11_eng2_n1)" },
  { key: "engineN1_3", expression: "(L:md11_eng3_n1)" },
  { key: "throttleLever1", expression: "(A:GENERAL ENG THROTTLE LEVER POSITION:1,Number)" },
  { key: "throttleLever2", expression: "(A:GENERAL ENG THROTTLE LEVER POSITION:2,Number)" },
  { key: "throttleLever3", expression: "(A:GENERAL ENG THROTTLE LEVER POSITION:3,Number)" },
  { key: "landingGear", expression: "(L:MD11_MIP_GEAR_SW)" },
  { key: "brakeLeftPosition", expression: "(A:BRAKE LEFT POSITION,Number)" },
  { key: "parkingBrake", expression: "(L:MD11_THR_PARK_LVR)" },
  { key: "brakeRightPosition", expression: "(A:BRAKE RIGHT POSITION,Number)" },
  { key: "aileronPosition", expression: "(L:MD11_EXT_L_INB_AIL)" },
  { key: "elevatorPosition", expression: "(L:MD11_EXT_INBD_ELEV_L)" },
  { key: "rudderPosition", expression: "(A:RUDDER POSITION,Position)" },
  { key: "spoilersHandlePosition", expression: "(A:SPOILERS HANDLE POSITION,Position)" },
  { key: "efisQnhUnitSelectorLeft", expression: "(A:EFIS_QNH_UNIT_SELECTOR_LEFT, Bool)" },
  { key: "captAltimeterSettingMB", expression: "(A:KOHLSMAN SETTING MB:1, Millibars)" },
  { key: "captAltimeterSettingHG", expression: "(A:KOHLSMAN SETTING HG:1, inHg)" },
  { key: "foAltimeterSettingMB", expression: "(A:KOHLSMAN SETTING MB:2, Millibars)" },
  { key: "foAltimeterSettingHG", expression: "(A:KOHLSMAN SETTING HG:2, inHg)" },
  { key: "totalFuelQuantityWeight", expression: "(A:FUEL TOTAL QUANTITY WEIGHT, Pounds)" },
  { key: "flapsIndex", expression: "(L:MD11_FLAP_RNG)" },
  { key: "mixture1", expression: "(L:MD11_THR_L_FUEL_SW)" },
  { key: "mixture2", expression: "(L:MD11_THR_C_FUEL_SW)" },
  { key: "mixture3", expression: "(L:MD11_THR_R_FUEL_SW)" },
  { key: "fcp_alt", expression: "(L:md11_afs_alt)" },
  { key: "cptBaro", expression: "(L:md11_cap_altimeter)" },
  { key: "foBaro", expression: "(L:md11_fo_altimeter)" },
  { key: "v1", expression: "(L:md11_v1)" },
  { key: "vr", expression: "(L:md11_vr)" },
  { key: "eng1_reverse", expression: "(L:MD11_THR_L_REV_RNG)" },
  { key: "eng2_reverse", expression: "(L:MD11_THR_C_REV_RNG)" },
  { key: "eng3_reverse", expression: "(L:MD11_THR_R_REV_RNG)" },
  { key: "taxiLight", expression: "(L:MD11_OVHD_LTS_NOSE_SW)" },
  { key: "aice_eng1_lt", expression: "(L:MD11_OVHD_AICE_ENG1_ON_LT)" },
  { key: "aice_eng2_lt", expression: "(L:MD11_OVHD_AICE_ENG2_ON_LT)" },
  { key: "aice_eng3_lt", expression: "(L:MD11_OVHD_AICE_ENG3_ON_LT)" },
  { key: "aice_wing_lt", expression: "(L:MD11_OVHD_AICE_WING_ON_LT)" },
  { key: "aice_tail_lt", expression: "(L:MD11_OVHD_AICE_TAIL_ON_LT)" },
  { key: "aice_auto_opt", expression: "(L:MD11_OPT_AUTO_AICE)" },
  { key: "aice_sys_sel", expression: "(L:MD11_OVHD_AICE_SYSTEM_SEL_BT)" },
  { key: "apu_pwr_lt", expression: "(L:MD11_OVHD_ELEC_APU_PWR_ON_LT)" },
  { key: "autobrake_sw", expression: "(L:MD11_CTR_AUTOBRAKE_SW)" },
  { key: "auto_aice_opt", expression: "(L:MD11_OPT_AUTO_AICE)" },
  { key: "strobe_lt", expression: "(L:MD11_OVHD_LTS_HI_INT_BT)" },
  { key: "rwy_turnoff_l_bt", expression: "(L:MD11_OVHD_LTS_RWY_TURNOFF_L_BT)" },
  { key: "rwy_turnoff_r_bt", expression: "(L:MD11_OVHD_LTS_RWY_TURNOFF_R_BT)" },
  { key: "seat_belts_sw", expression: "(L:MD11_OVHD_LTS_SEAT_BELTS_SW)" },
  { key: "wiper_l_kb", expression: "(L:MD11_OVHD_L_WIPER_KB)" },
  { key: "wiper_r_kb", expression: "(L:MD11_OVHD_R_WIPER_KB)" }
]

const RETRY_INTERVAL_MS = 5000
const STREAM_INTERVAL_MS = 16

export function useSimConnection() {
  const retryRef = useRef<number | null>(null)

  useEffect(() => {
    const store = useTelemetryStore.getState()
    const unlisteners: UnlistenFn[] = []

    const startStream = async () => {
      useTelemetryStore.getState().setStatus("connecting")
      try {
        // Always stop first to ensure a clean reconnect when the flight reloads.
        await invoke("stop_telemetry_stream").catch(() => {})
        await invoke("start_telemetry_stream", {
          variables: simVars,
          intervalMs: STREAM_INTERVAL_MS
        })
      } catch {
        useTelemetryStore.getState().setStatus("error")
      }
    }

    const clearRetry = () => {
      if (retryRef.current !== null) {
        window.clearInterval(retryRef.current)
        retryRef.current = null
      }
    }

    const setupListeners = async () => {
      // 1. Flight State
      unlisteners.push(
        await listen<boolean>("sim-in-flight", (e) => {
          if (e.payload) {
            startStream()
            if (retryRef.current === null) {
              retryRef.current = window.setInterval(() => {
                if (useTelemetryStore.getState().status !== "connected") startStream()
              }, RETRY_INTERVAL_MS)
            }
          } else {
            clearRetry()
            invoke("stop_telemetry_stream").catch(() => {})
            store.setStatus("connecting")
          }
        })
      )

      // 2. Data
      unlisteners.push(
        await listen<Record<string, number>>("telemetry_data", (e) => {
          store.setTelemetry(e.payload as Telemetry)
          if (store.status !== "connected") store.setStatus("connected")
        })
      )

      // 3. Title
      unlisteners.push(
        await listen<string>("simconnect-aircraft-title", (e) => {
          if (e.payload) store.setAircraftTitle(e.payload.trim())
        })
      )
    }

    // Initial logic
    setupListeners()
    invoke<boolean>("get_in_cockpit").then((inSim) => {
      if (inSim) startStream()
    })
    getAircraftTitle().then((t) => t && store.setAircraftTitle(t))

    return () => {
      clearRetry()
      unlisteners.forEach((fn) => fn())
      invoke("stop_telemetry_stream").catch(() => {})
    }
  }, [])
}
