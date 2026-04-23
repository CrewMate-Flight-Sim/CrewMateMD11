import { simvarSet, simvarGet } from "@/API/simvarApi"
import { playSound } from "@/services/playSounds"
import { useTelemetryStore } from "@/store/telemetryStore"

const gearLowerSpeedLimit = 260 // knots
let spoilerArmingDelay: number | null = null

export async function setGearHandle(position: number) {
  try {
    const { telemetry } = useTelemetryStore.getState()
    const currentSpeed = telemetry?.ias ?? 0
    const onGround = telemetry?.onGround ?? 1

    if (position === 1 && currentSpeed > gearLowerSpeedLimit) {
      // Speed too high to lower gear
      return
    }

    if (position === 0 && onGround) {
      console.warn("Gear retraction inhibited: Aircraft on ground")
      return
    }

    const eventName = position === 1 ? "GEAR_DOWN" : "GEAR_UP"
    const commandExpression = `(>K:${eventName})`

    if (position === 1 && !onGround) {
      // Arm spoilers 5 seconds after gear down is ordered, in air or on ground
      if (spoilerArmingDelay) {
        clearTimeout(spoilerArmingDelay)
      }
      spoilerArmingDelay = window.setTimeout(async () => {
        const currentSpoilerHandle = (await simvarGet("(L:MD11_SPDBRK_HANDLE)")) ?? 0
        if (currentSpoilerHandle < 0.5) {
          await simvarSet("77829 (>L:CEVENT)")
        }
      }, 5000)
      await simvarSet(commandExpression)
      playSound("gear_down.ogg")
    } else {
      await simvarSet(commandExpression)
      playSound("gear_up.ogg")
    }
  } catch (error) {
    console.error("Error sending gear key event:", error)
  }
}
