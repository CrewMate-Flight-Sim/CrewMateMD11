import { simvarSet } from "@/API/simvarApi"

export async function setStdBaro(position: number) {
  try {
    const expression1 = `${position} (>L:XMLVAR_Baro1_Mode)`
    const expression2 = `${position} (>L:XMLVAR_Baro2_Mode)`
    const expression3 = `${position} (>L:XMLVAR_Baro3_Mode)`
    await simvarSet(expression1)
    await simvarSet(expression2)
    await simvarSet(expression3)
  } catch (error) {
    console.error("[Baro] Error setting standard barometer:", error)
  }
}
