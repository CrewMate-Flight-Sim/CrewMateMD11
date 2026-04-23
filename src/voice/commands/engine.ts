import { simvarSet } from "@/API/simvarApi"
import { isPostLandingTimerActive } from "@/services/flowRunner"
import { playSound } from "@/services/playSounds"

export async function shutdownE2(): Promise<void> {
  if (isPostLandingTimerActive()) {
    await playSound("3_minutes_negative.ogg")
    throw new Error("Cannot shut down engine 2 - post-landing timer is still running")
  }

  // 1. Play verbal "check" confirmation first
  await playSound("check.ogg")

  // 2. Execute the engine 2 fuel cutoff event immediately after
  await simvarSet("77835 (>L:CEVENT)")
}
