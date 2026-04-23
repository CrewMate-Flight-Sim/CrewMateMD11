import type { ChecklistItem } from "@/types/checklist"

export const WEIGHT_UNITS = new Set(["tons", "kilograms", "pounds", "kilograms balanced", "pounds balanced"])

/** Applies final display formatting: weight units → "xxx.x <unit>", feet → "xxxx feet" */
export function renderResponseToken(token: string): string {
  if (WEIGHT_UNITS.has(token)) return `xxx.x ${token}`
  if (token === "feet") return "xxxx feet"
  return token.replace("#.#", "x.x")
}

export function formatResponseToken(token: string): string {
  if (token === "#2") return "##"
  if (token === "#3") return "###"
  if (token === "#4") return "####"
  // Replace any embedded #N placeholders (e.g. "#4 set") with visual hashes
  return token.replace(/#4/g, "####").replace(/#3/g, "###").replace(/#2/g, "##")
}

export function getDisplayResponses(item: ChecklistItem): string[] {
  const base = (item.response ?? []).map(formatResponseToken)

  const extras: string[] = []

  // Merge, preserve order, remove duplicates
  const combined = [...extras, ...base]
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of combined) {
    const v = formatResponseToken(t)
    if (!seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  const filtered = out

  // Apply final display formatting (weight units, feet) so all consumers get ready-to-display strings
  return filtered.map(renderResponseToken)
}
