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

  for (const token of item.response ?? []) {
    const formatted = formatResponseToken(token)
    if (!seen.has(formatted)) {
      seen.add(formatted)
      out.push(renderResponseToken(formatted))
    }
  }

  return out
}
