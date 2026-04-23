import { simvarGet, simvarSet } from "@/API/simvarApi"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function readStableSeatBelts(): Promise<number> {
  let prev = -1
  let current = (await simvarGet("(L:MD11_OVHD_LTS_SEAT_BELTS_SW)")) ?? 0
  while (prev !== current) {
    prev = current
    await sleep(50)
    current = (await simvarGet("(L:MD11_OVHD_LTS_SEAT_BELTS_SW)")) ?? 0
  }
  return current
}

export async function setSeatBelts(position: number) {
  try {
    const currentPosition = await readStableSeatBelts()
    const steps = position - currentPosition

    if (steps === 0) return

    for (let i = 0; i < Math.abs(steps); i++) {
      await simvarSet(`${steps > 0 ? "90249" : "90248"} (>L:CEVENT)`)
      await sleep(50)
    }
  } catch (error) {
    console.error("Error setting seat belts:", error)
  }
}
