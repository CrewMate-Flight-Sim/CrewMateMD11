export type FlowConditionValue = number | string | boolean

export type FlowConditionOperator = "and" | "or"

export type FlowCondition =
  | { read: string; one_of: FlowConditionValue[] }
  | { option: string; one_of: FlowConditionValue[] }
  | { conditions: FlowCondition[]; operator?: FlowConditionOperator }

export interface FlowStep {
  label: string
  read: string
  on?: string
  expect: number | string
  expect_min: number | string
  wait_ms?: number
  skip_delay?: boolean
  hyd_test?: boolean
  trim_on?: boolean
  sound_on_execute?: string
  sound_after_execute?: string
  repeat_on?: boolean
  only_if?: FlowCondition
}

export interface Flow {
  id: string
  name: string
  steps: FlowStep[]
  sound_start?: string
  sound_end?: string
}

export type StepStatus = "pending" | "executing" | "verifying" | "done" | "skipped" | "failed"

export type FlowExecutionState = "idle" | "running" | "completed" | "error" | "aborted"
