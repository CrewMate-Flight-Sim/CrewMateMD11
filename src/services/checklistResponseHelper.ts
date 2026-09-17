import type { ChecklistItem } from "@/types/checklist"

export function renderResponseToken(token: string): string {
  if (token === "feet") return "xxxx feet"
  return token.replace("#.#", "x.x")
}

export function formatResponseToken(token: string): string {
  return token.replace(/#4/g, "####").replace(/#3/g, "###").replace(/#2/g, "##")
}

export function getDisplayResponses(item: ChecklistItem): string[] {
  const extras: string[] = []

  if (item.label?.includes("DH/BARO")) {
    extras.push("#3 feet set")
  }

  const base = item.response ?? []
  const combined = [...extras, ...base]

  const seen = new Set<string>()
  const out: string[] = []

  for (const rawToken of combined) {
    const formatted = formatResponseToken(rawToken)
    if (!seen.has(formatted)) {
      seen.add(formatted)
      out.push(formatted)
    }
  }

  // Check if our formatted numeric DH/MDA set example was added
  const hasNumericDHSet = out.some((s) => s.toLowerCase().includes("### feet set"))

  let filtered = out
  if (hasNumericDHSet) {
    // Hide the plain generic variations ("feet set", "feet", "set")
    filtered = filtered.filter((s) => {
      const lower = s.toLowerCase()
      return lower !== "feet set" && lower !== "feet" && lower !== "set"
    })
  }

  return filtered.map(renderResponseToken)
}
