import { simvarGet } from "@/API/simvarApi"
import climbTenK from "@/data/flows/10_climb_above_10k.json"
import des from "@/data/flows/11_des.json"
import descTenK from "@/data/flows/12_des_below_10k.json"
import afterLanding from "@/data/flows/13_after_landing.json"
import shutdownP1 from "@/data/flows/14_shutdownP1.json"
import shutdownP2 from "@/data/flows/15_shutdownP2.json"
import foCockpitPrep1 from "@/data/flows/1_fo_cockpit_prep1.json"
import foCockpitPrep2 from "@/data/flows/2_fo_cockpit_prep2.json"
import finalCockpitPrep from "@/data/flows/3_final_cockpit_prep.json"
import beforeStart from "@/data/flows/4_before_start.json"
import afterStart from "@/data/flows/5_after_start.json"
import taxiP1 from "@/data/flows/6_clear_left.json"
import taxiP2 from "@/data/flows/7_taxi.json"
import beforeTakeoff from "@/data/flows/8_before_takeoff.json"
import afterTakeoff from "@/data/flows/9_after_takeoff.json"
import { usePerformanceStore } from "@/store/performanceStore"
import type { Flow, FlowStep, FlowCondition } from "@/types/flow"

export const allFlows: Flow[] = [
  foCockpitPrep1,
  foCockpitPrep2,
  finalCockpitPrep,
  beforeStart,
  afterStart,
  taxiP1,
  taxiP2,
  beforeTakeoff,
  afterTakeoff,
  climbTenK,
  des,
  descTenK,
  afterLanding,
  shutdownP1,
  shutdownP2
] as Flow[]

export function getFlowById(id: string): Flow | undefined {
  return allFlows.find((f) => f.id === id)
}

export const vars: Record<string, string> = {}
export async function getTemplateVars(): Promise<Record<string, string>> {
  const { takeoff, landing } = usePerformanceStore.getState()

  let efbFlapDegree: number = 15
  for (let i = 0; i < 5; i++) {
    const val = await simvarGet("(L:md11_efb_flaps)")
    if (val !== null) {
      efbFlapDegree = val
      break
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  const MD11_FLAPS_MAP: Record<number, number> = {
    10: 0,
    11: 6,
    12: 13,
    13: 20,
    14: 26,
    15: 33,
    16: 40,
    17: 46,
    18: 53,
    19: 60,
    20: 66,
    21: 73,
    22: 79,
    23: 86,
    24: 93,
    25: 99
  }
  function resolveFlaps(flaps: number): number {
    return MD11_FLAPS_MAP[flaps] ?? 33
  }
  const trim = takeoff.trim ?? 0
  vars["trim"] = String(((trim + 1.0) / 16.5) * 100)
  vars["flaps"] = String(resolveFlaps(Number(efbFlapDegree)))
  vars["flapsefb"] = String(efbFlapDegree)

  const antiIce = takeoff.antiIce ?? "off"
  const engAntiIce = antiIce === "oneng" || antiIce === "onengfoil"
  const airfoilAntiIce = antiIce === "onengfoil"

  vars["anti_ice_eng1_cmd"] = engAntiIce ? "90414 (>L:CEVENT)" : "90414 (>L:CEVENT)"
  vars["anti_ice_eng2_cmd"] = engAntiIce ? "90416 (>L:CEVENT)" : "90416 (>L:CEVENT)"
  vars["anti_ice_eng3_cmd"] = engAntiIce ? "90418 (>L:CEVENT)" : "90418 (>L:CEVENT)"
  vars["anti_ice_wing_cmd"] = airfoilAntiIce ? "90420 (>L:CEVENT)" : "90420 (>L:CEVENT)"
  vars["anti_ice_tail_cmd"] = airfoilAntiIce ? "90422 (>L:CEVENT)" : "90422 (>L:CEVENT)"
  vars["anti_ice_eng1_expect"] = engAntiIce ? "1 (L:MD11_OVHD_AICE_ENG1_BT)" : "0 (L:MD11_OVHD_AICE_ENG1_BT)"
  vars["anti_ice_eng2_expect"] = engAntiIce ? "1 (L:MD11_OVHD_AICE_ENG2_BT)" : "0 (L:MD11_OVHD_AICE_ENG2_BT)"
  vars["anti_ice_eng3_expect"] = engAntiIce ? "1 (L:MD11_OVHD_AICE_ENG3_BT)" : "0 (L:MD11_OVHD_AICE_ENG3_BT)"
  vars["anti_ice_wing_expect"] = airfoilAntiIce ? "1 (L:MD11_OVHD_AICE_WING_BT)" : "0 (L:MD11_OVHD_AICE_WING_BT)"
  vars["anti_ice_tail_expect"] = airfoilAntiIce ? "1 (L:MD11_OVHD_AICE_TAIL_BT)" : "0 (L:MD11_OVHD_AICE_TAIL_BT)"

  // Landing flaps conditional on anti-ice setting
  const landingAntiIce = landing.antiIce ?? "off"
  const landingAntiIceActive = landingAntiIce === "oneng" || landingAntiIce === "onengfoil"
  vars["flaps_cleanup"] = landingAntiIceActive ? "70" : "0"

  return vars
}

function resolveString(str: string | undefined, vars: Record<string, string>): string | undefined {
  return str?.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match)
}

function resolveCondition(condition: FlowCondition, vars: Record<string, string>): FlowCondition {
  if ("read" in condition) {
    return {
      ...condition,
      read: resolveString(condition.read, vars) ?? condition.read
    }
  }
  if ("option" in condition) {
    return {
      ...condition,
      option: resolveString(condition.option, vars) ?? condition.option
    }
  }
  if ("conditions" in condition) {
    return {
      ...condition,
      conditions: condition.conditions.map((c: FlowCondition) => resolveCondition(c, vars))
    }
  }
  return condition
}

export async function resolveStep(step: FlowStep, vars?: Record<string, string>): Promise<FlowStep> {
  const templateVars = vars ?? (await getTemplateVars())
  const resolvedOnlyIf = step.only_if ? resolveCondition(step.only_if, templateVars) : undefined

  return {
    ...step,
    label: resolveString(step.label, templateVars) ?? step.label,
    read: resolveString(step.read, templateVars) ?? step.read,
    on: step.on !== undefined ? resolveString(step.on, templateVars) : undefined,
    expect:
      typeof step.expect === "string" ? parseFloat(resolveString(step.expect, templateVars) ?? "") || 0 : step.expect,
    only_if: resolvedOnlyIf
  }
}

export async function resolveFlow(flow: Flow): Promise<Flow> {
  const vars = await getTemplateVars()
  return {
    ...flow,
    steps: await Promise.all(flow.steps.map((s) => resolveStep(s, vars)))
  }
}
