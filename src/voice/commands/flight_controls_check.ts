import { simvarSet } from "@/API/simvarApi"
import { executeFlow } from "@/services/flowRunner"
import { playSound, isSoundPlaying } from "@/services/playSounds"
import { useTelemetryStore } from "@/store/telemetryStore"
import type { Telemetry } from "@/store/telemetryStore"

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

const foSteps: FOStep[] = [
  {
    setValue: () => simvarSet(`${AXIS_FULL_NEG} (>K:ELEVATOR_SET)`),
    sound: "full_up.ogg"
  },
  {
    setValue: () => simvarSet(`${AXIS_NEUTRAL} (>K:ELEVATOR_SET)`)
  },
  {
    setValue: () => simvarSet(`${AXIS_FULL_POS} (>K:ELEVATOR_SET)`),
    sound: "full_down.ogg"
  },
  {
    setValue: () => simvarSet(`${AXIS_NEUTRAL} (>K:ELEVATOR_SET)`),
    sound: "neutral.ogg"
  },
  {
    setValue: () => simvarSet(`${AXIS_FULL_NEG} (>K:AILERON_SET)`),
    sound: "full_left.ogg"
  },
  {
    setValue: () => simvarSet(`(>K:CENTER_AILER_RUDDER)`)
  },
  {
    setValue: () => simvarSet(`${AXIS_FULL_POS} (>K:AILERON_SET)`),
    sound: "full_right.ogg"
  },
  {
    setValue: () => simvarSet(`(>K:CENTER_AILER_RUDDER)`),
    sound: "neutral.ogg"
  }
]

// Captain performs rudder check — wait for each position silently
const rudderSteps: SilentStep[] = [
  { condition: (t) => t.rudderPosition < -RUDDER_FULL_THRESHOLD },
  { condition: (t) => t.rudderPosition > RUDDER_FULL_THRESHOLD },
  { condition: (t) => Math.abs(t.rudderPosition) < RUDDER_NEUTRAL_THRESHOLD }
]

function waitFor(condition: (t: Telemetry) => boolean): Promise<void> {
  return new Promise((resolve) => {
    const current = useTelemetryStore.getState().telemetry
    if (current && condition(current)) {
      resolve()
      return
    }

    const unsub = useTelemetryStore.subscribe((state) => {
      const t = state.telemetry
      if (t && condition(t)) {
        unsub()
        resolve()
      }
    })
  })
}

function waitForSoundDone(): Promise<void> {
  return new Promise((resolve) => {
    const id = setInterval(async () => {
      if (!(await isSoundPlaying())) {
        clearInterval(id)
        resolve()
      }
    }, 50)
  })
}

export async function flightControlsCheck() {
  await waitForSoundDone()

  // FO sets elevator and aileron positions and calls out each state
  for (const step of foSteps) {
    await step.setValue()
    if (step.sound) {
      await new Promise((r) => setTimeout(r, 500)) // wait for surface to move
      await playSound(step.sound)
      await waitForSoundDone()
    } else {
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  // Captain performs rudder check — code waits for each position before continuing
  for (const step of rudderSteps) {
    await waitFor(step.condition)
  }

  executeFlow("taxi")
}
