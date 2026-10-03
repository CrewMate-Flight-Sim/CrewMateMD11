import { invoke } from "@tauri-apps/api/core"

export async function simvarSet(variableString: string): Promise<void> {
  return invoke<void>("simvar_set", { variableString })
}

export async function simvarGet(variableString: string): Promise<number | null> {
  return invoke<number | null>("simvar_get", { variableString })
}

// A failed write means the FO's action didn't happen, never worth crashing a command; returns whether it worked
export async function setLvar(value: number, name: string, label: string): Promise<boolean> {
  try {
    await simvarSet(`${value} (>L:${name})`)
    return true
  } catch (error) {
    console.error(`[SimVar] Failed to set ${label} (L:${name}):`, error)
    return false
  }
}

export async function getAircraftTitle(): Promise<string | null> {
  return invoke<string | null>("get_aircraft_title")
}
