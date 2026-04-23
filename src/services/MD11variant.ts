import { useTelemetryStore } from "@/store/telemetryStore"

export type Md11Variant = "cargo" | "passenger"

/** Plain function — safe to call in services, runners, etc. */
export function getMd11Variant(): Md11Variant {
  const title = useTelemetryStore.getState().aircraftTitle
  return /MD-11F/i.test(title ?? "") ? "cargo" : "passenger"
}
