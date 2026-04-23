import { simvarGet, simvarSet } from "@/API/simvarApi"
import { playSound } from "@/services/playSounds"
import { useTelemetryStore } from "@/store/telemetryStore"

const wipersSpeedLimitMD11 = 230 // knots

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function setWipers(position: number) {
  try {
    const { telemetry } = useTelemetryStore.getState()
    const currentSpeed = telemetry?.ias ?? 0

    if (position !== 0 && currentSpeed > wipersSpeedLimitMD11) {
      playSound("check_speed.ogg")
      return
    }

    const currentLeftPosition = (await simvarGet("(L:MD11_OVHD_L_WIPER_KB)")) ?? 0
    const currentRightPosition = (await simvarGet("(L:MD11_OVHD_R_WIPER_KB)")) ?? 0

    const leftSteps = position - currentLeftPosition
    const rightSteps = position - currentRightPosition

    for (let i = 0; i < Math.abs(leftSteps); i++) {
      await simvarSet(`${leftSteps > 0 ? "90376" : "90375"} (>L:CEVENT)`)
      await sleep(50)
    }

    for (let i = 0; i < Math.abs(rightSteps); i++) {
      await simvarSet(`${rightSteps > 0 ? "90383" : "90382"} (>L:CEVENT)`)
      await sleep(50)
    }

    playSound("check.ogg")
  } catch (error) {
    console.error("Error setting MD-11 wipers:", error)
  }
}
