import type { ChecklistItem } from "@/types/checklist"

/** Applies final display formatting: weight units → "xxx.x <unit>", feet → "xxxx feet" */
export function renderResponseToken(token: string): string {
  return token === "feet" ? "xxxx feet" : token.replace("#.#", "x.x")
}

export function formatResponseToken(token: string): string {
  // Chain replacements directly; handles exact matches and embedded tokens uniformly
  return token.replace(/#4/g, "####").replace(/#3/g, "###").replace(/#2/g, "##")
}

export function getDisplayResponses(item: ChecklistItem): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  // For items expecting feet (minimums), push only ### and ####
  const hasFeet = (item.response ?? []).some((r) => r.toLowerCase().includes("feet"))
  if (hasFeet) {
    const extras = ["#3 feet set", "#4 feet set"]
    for (const token of extras) {
      const formatted = formatResponseToken(token)
      if (!seen.has(formatted)) {
        seen.add(formatted)
        out.push(renderResponseToken(formatted))
      }
    }
  }

  for (const token of item.response ?? []) {
    if (hasFeet && token.toLowerCase().includes("feet set")) {
      continue
    }
    const formatted = formatResponseToken(token)
    if (!seen.has(formatted)) {
      seen.add(formatted)
      out.push(renderResponseToken(formatted))
    }
  }

  return out
}
