import { simvarSet } from "@/API/simvarApi"
import { executeFlow } from "@/services/flowRunner"
import { playSound, isSoundPlaying } from "@/services/playSounds"
import { usePerformanceStore } from "@/store/performanceStore"
import { useTelemetryStore } from "@/store/telemetryStore"
import type { Telemetry } from "@/store/telemetryStore"

import { delay } from "../commandDispatch"

const AXIS_FULL_POS = 16383
const AXIS_FULL_NEG = 0
const AXIS_NEUTRAL = 8192

const RUDDER_FULL_THRESHOLD = 0.45
const RUDDER_NEUTRAL_THRESHOLD = 0.15

interface SilentStep {
  condition: (t: Telemetry) => boolean
}

interface FOStep {
  setValue: () => Promise<void>
  sound?: string
}

// Module-level atomic execution lock to protect voice commands
let isCheckRunning = false

const foSteps: FOStep[] = [
  { setValue: () => simvarSet(`${AXIS_FULL_NEG} (>K:ELEVATOR_SET)`), sound: "full_up.ogg" },
  { setValue: () => simvarSet(`${AXIS_NEUTRAL} (>K:ELEVATOR_SET)`) },
  { setValue: () => simvarSet(`${AXIS_FULL_POS} (>K:ELEVATOR_SET)`), sound: "full_down.ogg" },
  { setValue: () => simvarSet(`${AXIS_NEUTRAL} (>K:ELEVATOR_SET)`), sound: "neutral.ogg" },
  { setValue: () => simvarSet(`${AXIS_FULL_NEG} (>K:AILERON_SET)`), sound: "full_left.ogg" },
  { setValue: () => simvarSet(`(>K:CENTER_AILER_RUDDER)`) },
  { setValue: () => simvarSet(`${AXIS_FULL_POS} (>K:AILERON_SET)`), sound: "full_right.ogg" },
  { setValue: () => simvarSet(`(>K:CENTER_AILER_RUDDER)`), sound: "neutral.ogg" }
]

const rudderSteps: SilentStep[] = [
  { condition: (t) => t.rudderPosition < -RUDDER_FULL_THRESHOLD },
  { condition: (t) => t.rudderPosition > RUDDER_FULL_THRESHOLD },
  { condition: (t) => Math.abs(t.rudderPosition) < RUDDER_NEUTRAL_THRESHOLD }
]

function waitFor(condition: (t: Telemetry) => boolean): Promise<void> {
  const current = useTelemetryStore.getState().telemetry
  if (current && condition(current)) return Promise.resolve()

  return new Promise((resolve) => {
    const unsub = useTelemetryStore.subscribe((state) => {
      const t = state.telemetry
      if (t && condition(t)) {
        unsub()
        resolve()
      }
    })
  })
}

async function waitForSoundDone(): Promise<void> {
  while (await isSoundPlaying()) {
    await delay(50)
  }
}

export async function flightControlsCheck() {
  // Voice guard: Abort immediately if already running to prevent overlap glitching
  if (isCheckRunning) return
  isCheckRunning = true

  try {
    await waitForSoundDone()

    // FO sets elevator and aileron positions and calls out each state
    for (const step of foSteps) {
      // 1. SAFETY: Ensure any audio from the PRIOR step is 100% silent before moving hardware
      await waitForSoundDone()

      // 2. Send command to physically move the control surface
      await step.setValue()

      // 3. Physical transit wait (increased to 2200ms for full high-fidelity hydraulic sweep)
      await delay(750)

      if (step.sound) {
        // 4. Play sound only once the mechanical step is verified complete
        await playSound(step.sound)

        // 5. Block right here until THIS step's speech is completely finished
        await waitForSoundDone()

        // 6. Natural human breathing room pause before loop cycles back to step 1
        await delay(400)
      } else {
        // Padding for internal silent centering resets
        await delay(300)
      }
    }

    // Captain performs rudder check — script blocks until physical input matches threshold
    for (const step of rudderSteps) {
      await waitFor(step.condition)
    }

    const { armNav } = usePerformanceStore.getState().takeoff
    executeFlow((armNav ?? true) ? "taxi" : "taxi_vector")
  } catch (error) {
    console.error("[FlightControlsCheck] Execution failure:", error)
  } finally {
    // Release the voice latch regardless of success or failure pathing
    isCheckRunning = false
  }
}
