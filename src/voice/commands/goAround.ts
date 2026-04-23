import { playSound } from "@/services/playSounds"
import { useGoAroundStore } from "@/store/goAroundStore"

export async function executeGoAround() {
  useGoAroundStore.getState().trigger()
  await playSound("check.ogg")
  await playSound("thrust_set.ogg")
}
