import { simvarGet, simvarSet } from "@/API/simvarApi"
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
async function setAntiIceToggle(position: number, readVar: string, cevent: number) {
  const current = (await simvarGet(`(${readVar})`)) ?? 0
  if (current === position) return
  await simvarSet(`${cevent} (>L:CEVENT)`)
  await sleep(50)
}

export async function setEngAntiIce(position: number) {
  try {
    await setAntiIceToggle(position, "L:MD11_OVHD_AICE_ENG1_BT", 90414)
    await setAntiIceToggle(position, "L:MD11_OVHD_AICE_ENG2_BT", 90416)
    await setAntiIceToggle(position, "L:MD11_OVHD_AICE_ENG3_BT", 90418)
  } catch (error) {
    console.error("Error setting MD-11 engine anti-ice:", error)
  }
}

export async function setAirfoilAntiIce(position: number) {
  try {
    await setAntiIceToggle(position, "L:MD11_OVHD_AICE_WING_BT", 90420)
    await setAntiIceToggle(position, "L:MD11_OVHD_AICE_TAIL_BT", 90422)
  } catch (error) {
    console.error("Error setting MD-11 airfoil anti-ice:", error)
  }
}
