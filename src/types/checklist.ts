export type ChecklistStepStatus = "pending" | "active" | "complete" | "failed"
export type ChecklistExecutionState = "idle" | "running" | "completed" | "error" | "aborted"

export interface Condition {
  responses?: string[]
  store?: { path: string; equals: string }
  always?: true
}

export interface Check {
  type: "simvar" | "store" | "any" | "flaps_to"
  var?: string
  expected?: number | boolean | string | { store: string }
  store?: string
  equals?: string
  groups?: Check[][]
  target_var?: string
  dial_var?: string
  tolerance?: number
}

export interface ValidationRule {
  when: Condition
  checks?: Check[]
  incorrect?: string
  copilot_response?: string
}

export interface ChecklistItem {
  label: string
  challenge?: string
  response?: string[]
  incorrect?: string
  copilot_response?: string
  flaps_confirmation?: boolean
  trim_confirmation?: boolean
  fo_only_response?: boolean
  abrk_confirmation?: boolean
  cargo_skip?: true
  delay_ms?: number
  validations?: ValidationRule[]
}

export interface Checklist {
  id: string
  name: string
  items: ChecklistItem[]
  completion: string
  mode?: "silent"
}
