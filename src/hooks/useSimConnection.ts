import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { useEffect, useRef } from "react"

import { getAircraftTitle } from "@/API/simvarApi"
import { useTelemetryStore } from "@/store/telemetryStore"
import type { Telemetry } from "@/store/telemetryStore"

const SIM_VARS = [
  { key: "timeOfDay", expression: "(E:TIME OF DAY,Enum)" },
  { key: "ias", expression: "(A:AIRSPEED INDICATED,Knots)" },
  { key: "alt", expression: "(A:INDICATED ALTITUDE,Feet)" },
  { key: "radioAlt", expression: "(A:PLANE ALT ABOVE GROUND,Feet)" },
  { key: "pAlt", expression: "(A:PRESSURE ALTITUDE,Feet)" },
  { key: "vs", expression: "(A:VERTICAL SPEED,Feet per minute)" },
  { key: "onGround", expression: "(A:SIM ON GROUND,Bool)" },
  { key: "isSlewActive", expression: "(A:IS SLEW ACTIVE,Bool)" },
  { key: "engine1N1", expression: "(L:md11_eng1_n1)" },
  { key: "engine2N1", expression: "(L:md11_eng2_n1)" },
  { key: "engine3N1", expression: "(L:md11_eng3_n1)" },
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
  { key: "spoilersHandlePosition", expression: "(L:MD11_SPDBRK_RNG)" },
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
  { key: "fcpAlt", expression: "(L:md11_afs_alt)" },
  { key: "cptBaro", expression: "(L:md11_cap_altimeter)" },
  { key: "foBaro", expression: "(L:md11_fo_altimeter)" },
  { key: "v1", expression: "(L:md11_v1)" },
  { key: "vr", expression: "(L:md11_vr)" },
  { key: "engine1Reverse", expression: "(L:MD11_THR_L_REV_RNG)" },
  { key: "engine2Reverse", expression: "(L:MD11_THR_C_REV_RNG)" },
  { key: "engine3Reverse", expression: "(L:MD11_THR_R_REV_RNG)" },
  { key: "taxiLight", expression: "(L:MD11_OVHD_LTS_NOSE_SW)" },
  { key: "antiIceEngine1Light", expression: "(L:MD11_OVHD_AICE_ENG1_ON_LT)" },
  { key: "antiIceEngine2Light", expression: "(L:MD11_OVHD_AICE_ENG2_ON_LT)" },
  { key: "antiIceEngine3Light", expression: "(L:MD11_OVHD_AICE_ENG3_ON_LT)" },
  { key: "antiIceWingLight", expression: "(L:MD11_OVHD_AICE_WING_ON_LT)" },
  { key: "antiIceTailLight", expression: "(L:MD11_OVHD_AICE_TAIL_ON_LT)" },
  { key: "autoAntiIceOption", expression: "(L:MD11_OPT_AUTO_AICE)" },
  { key: "antiIceSystemSelect", expression: "(L:MD11_OVHD_AICE_SYSTEM_SEL_BT)" },
  { key: "apuPowerLight", expression: "(L:MD11_OVHD_ELEC_APU_PWR_ON_LT)" },
  { key: "autobrakeSwitch", expression: "(L:MD11_CTR_AUTOBRAKE_SW)" },
  { key: "strobeLightsButton", expression: "(L:MD11_OVHD_LTS_HI_INT_BT)" },
  { key: "runwayTurnoffLeftButton", expression: "(L:MD11_OVHD_LTS_RWY_TURNOFF_L_BT)" },
  { key: "runwayTurnoffRightButton", expression: "(L:MD11_OVHD_LTS_RWY_TURNOFF_R_BT)" },
  { key: "seatBeltsSwitch", expression: "(L:MD11_OVHD_LTS_SEAT_BELTS_SW)" },
  { key: "leftWiperKnob", expression: "(L:MD11_OVHD_L_WIPER_KB)" },
  { key: "rightWiperKnob", expression: "(L:MD11_OVHD_R_WIPER_KB)" }
]

const RETRY_INTERVAL_MS = 5000
const STREAM_INTERVAL_MS = 16

export function useSimConnection() {
  const retryRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const startStream = async () => {
      useTelemetryStore.getState().setStatus("connecting")
      try {
        // Always stop first to ensure a clean reconnect when the flight reloads.
        await invoke("stop_telemetry_stream").catch(() => {})
        await invoke("start_telemetry_stream", {
          variables: SIM_VARS,
          intervalMs: STREAM_INTERVAL_MS
        })
      } catch {
        useTelemetryStore.getState().setStatus("error")
      }
    }

    const stopStream = () => {
      if (retryRef.current) {
        clearInterval(retryRef.current)
        retryRef.current = null
      }
      invoke("stop_telemetry_stream").catch(() => {})
      useTelemetryStore.getState().setStatus("connecting")
    }

    // Retry logic: only active while a flight is loaded
    const startRetry = () => {
      if (retryRef.current) clearInterval(retryRef.current)
      retryRef.current = setInterval(() => {
        const current = useTelemetryStore.getState().status
        if (current !== "connected") {
          void startStream()
        }
      }, RETRY_INTERVAL_MS)
    }

    let unlistenFlightState: (() => void) | null = null
    const setupFlightStateListener = async () => {
      unlistenFlightState = await listen<boolean>("sim-in-flight", (event) => {
        if (event.payload) {
          // Flight loaded — restart the stream so LVARs register with correct slots
          void startStream()
          startRetry()
        } else {
          stopStream()
        }
      })

      // After the listener is registered, query whether we're already in the cockpit.
      // This handles the app being opened while already in a loaded flight — the Rust
      // side emits with a 300ms delay now, but this is a belt-and-suspenders fallback.
      const alreadyInCockpit = await invoke<boolean>("get_in_cockpit").catch(() => false)
      if (alreadyInCockpit) {
        void startStream()
        startRetry()
      }
    }
    void setupFlightStateListener()

    let unlistenTelemetry: (() => void) | null = null
    const setupTelemetryListener = async () => {
      unlistenTelemetry = await listen<Record<string, number>>("telemetry_data", (event) => {
        const s = useTelemetryStore.getState()
        s.setTelemetry(event.payload as Telemetry)
        if (s.status !== "connected") {
          s.setStatus("connected")
        }
      })
    }
    void setupTelemetryListener()

    let unlistenTitle: (() => void) | null = null
    const setupTitleListener = async () => {
      unlistenTitle = await listen<string>("simconnect-aircraft-title", (event) => {
        const title = typeof event.payload === "string" ? event.payload.trim() : ""
        if (title) {
          useTelemetryStore.getState().setAircraftTitle(title)
        }
      })
    }
    void setupTitleListener()

    getAircraftTitle()
      .then((cached) => {
        if (cached) {
          useTelemetryStore.getState().setAircraftTitle(cached)
        }
      })
      .catch(() => {})

    return () => {
      if (retryRef.current) {
        clearInterval(retryRef.current)
        retryRef.current = null
      }
      if (unlistenFlightState) unlistenFlightState()
      if (unlistenTelemetry) unlistenTelemetry()
      if (unlistenTitle) unlistenTitle()

      invoke("stop_telemetry_stream").catch(() => {})
    }
  }, [])
}
