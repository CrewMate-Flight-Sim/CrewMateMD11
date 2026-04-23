import beforeLanding from "@/data/checklists/10_before_landing.json"
import afterLanding from "@/data/checklists/11_after_landing.json"
import parking from "@/data/checklists/12_parking.json"
import leaveAircraft from "@/data/checklists/13_leaving_aircraft.json"
import cockpitPrep from "@/data/checklists/1_cockpit_prep.json"
import beforeStart from "@/data/checklists/2_before_start.json"
import afterStart from "@/data/checklists/3_after_start.json"
import taxi from "@/data/checklists/4_taxi.json"
import beforeTakeoff from "@/data/checklists/5_before_takeoff.json"
import afterTakeoffP1 from "@/data/checklists/6_after_takeoff_to_the_line.json"
import afterTakeoffP2 from "@/data/checklists/7_after_takeoff_below_the_line.json"
import des1 from "@/data/checklists/8_des_p1.json"
import des2 from "@/data/checklists/9_des_p2.json"
import type { Checklist } from "@/types/checklist"

export const allChecklists = [
  cockpitPrep,
  beforeStart,
  afterStart,
  taxi,
  beforeTakeoff,
  afterTakeoffP1,
  afterTakeoffP2,
  des1,
  des2,
  beforeLanding,
  afterLanding,
  parking,
  leaveAircraft
] as Checklist[]

export function getChecklistById(id: string): Checklist | undefined {
  return allChecklists.find((c) => c.id === id)
}
