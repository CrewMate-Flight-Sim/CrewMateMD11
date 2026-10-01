import { setLvar } from "@/API/simvarApi"

export async function setGPU(on: boolean) {
  await setLvar(on ? 1 : 0, "md11_ext_gpu", "GPU")
}

export async function setASU(on: boolean) {
  await setLvar(on ? 1 : 0, "md11_ext_asu", "ASU")
}

export async function disconnectAllGround() {
  await setGPU(false)
  await setASU(false)
}
