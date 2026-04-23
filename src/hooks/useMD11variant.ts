import { useTelemetryStore } from "@/store/telemetryStore"

export type Md11Variant = "cargo" | "passenger"

/** React hook — use inside components/hooks only */
export function useMd11Variant(): Md11Variant {
  const title = useTelemetryStore((s) => s.aircraftTitle)
  return /MD-11F/i.test(title ?? "") ? "cargo" : "passenger"
}

/** Plain function — safe to call in services, runners, etc. */
export function getMd11Variant(): Md11Variant {
  const title = useTelemetryStore.getState().aircraftTitle
  return /MD-11F/i.test(title ?? "") ? "cargo" : "passenger"
}
