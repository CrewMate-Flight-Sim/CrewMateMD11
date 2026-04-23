import { simvarGet, simvarSet } from "@/API/simvarApi"
import { getFlowById, resolveFlow } from "@/services/flowLoader"
import { playSound, isSoundPlaying, playSoundSequence } from "@/services/playSounds"
import { useCabinReadyTimerStore } from "@/store/cabinReadyTimerStore"
import { useFlowStore } from "@/store/flowStore"
import { usePerformanceStore } from "@/store/performanceStore"
import { useSettingsStore } from "@/store/settingsStore"
import { useVoiceHintProgressStore } from "@/store/voiceHintProgressStore"
import type { Flow, FlowStep, FlowConditionValue, FlowConditionOperator, FlowCondition } from "@/types/flow"

// Constants
const STEP_DELAY = { MIN: 500, MAX: 1500 }
const SIMVAR = { READ_RETRIES: 5, READ_RETRY_DELAY: 150, WRITE_SETTLE: 500, REPEAT_RETRY_DELAY: 500 }
const STEP_VERIFY = { RETRIES: 5, DELAY: 300, SOUND_AFTER_DELAY: 1000 }
const POST_LANDING_TIMER_MINUTES = 3
const FUZZY_EPS = 0.5
const TRIM_EPS = 0.1
const BLOCKED_FLOWS = new Set(["before_takeoff", "shutdownP1", "shutdownP2"])

// Utilities
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const getRandomStepDelay = () => Math.random() * (STEP_DELAY.MAX - STEP_DELAY.MIN) + STEP_DELAY.MIN
const fuzzyEquals = (a: number, b: number, eps = FUZZY_EPS) => Math.abs(a - b) < eps
const toNumber = (v: number | string) => (typeof v === "string" ? parseFloat(v) : v)
const waitForSoundFinished = async () => {
  while (await isSoundPlaying()) await sleep(100)
}

// SimVar I/O
async function readSimvar(expression: string): Promise<number | null> {
  for (let attempt = 0; attempt < SIMVAR.READ_RETRIES; attempt++) {
    try {
      const value = await simvarGet(expression)
      if (value !== null) return value
    } catch (err) {
      console.warn(`[FlowRunner] Failed to read "${expression}":`, err)
      return null
    }
    await sleep(SIMVAR.READ_RETRY_DELAY)
  }
  return null
}

async function writeSimvar(expression: string): Promise<void> {
  try {
    await simvarSet(expression)
  } catch (err) {
    console.error(`[FlowRunner] Failed to write "${expression}":`, err)
    throw err
  }
}

// Condition evaluation
function resolveFlowOption(path: string): unknown {
  const { takeoff, landing } = usePerformanceStore.getState()
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
      { takeoff, landing }
    )
}

function optionMatchesExpected(actual: unknown, expected: FlowConditionValue): boolean {
  if (typeof actual === "number" && typeof expected === "number") return fuzzyEquals(actual, expected)
  const a = Number(actual),
    e = Number(expected)
  return !Number.isNaN(a) && !Number.isNaN(e) ? fuzzyEquals(a, e) : String(actual) === String(expected)
}

function simvarMatchesExpected(actual: number | null, expected: FlowConditionValue, eps = FUZZY_EPS): boolean {
  if ((typeof expected !== "number" && typeof expected !== "string") || actual === null) return false
  return fuzzyEquals(actual, toNumber(expected), eps)
}

async function evaluateSingleCondition(condition: {
  read?: string
  option?: string
  one_of: FlowConditionValue[]
}): Promise<boolean> {
  if (condition.option !== undefined) {
    const val = resolveFlowOption(condition.option)
    if (val === undefined) {
      console.warn(`[FlowRunner] Step condition option not found: "${condition.option}"`)
      return false
    }
    return condition.one_of.some((e) => optionMatchesExpected(val, e))
  }
  if (condition.read !== undefined) {
    const val = await readSimvar(condition.read)
    if (val === null) {
      console.warn(`[FlowRunner] Step condition read failed for "${condition.read}"`)
      return false
    }
    return condition.one_of.some((e) => simvarMatchesExpected(val, e))
  }
  return false
}

async function evaluateCondition(condition: FlowCondition): Promise<boolean> {
  if ("read" in condition || "option" in condition) return evaluateSingleCondition(condition)
  if ("conditions" in condition) {
    const { conditions, operator = "and" } = condition as {
      conditions: FlowCondition[]
      operator?: FlowConditionOperator
    }
    if (!conditions.length) return true
    const results = await Promise.all(conditions.map(evaluateCondition))
    return operator === "and" ? results.every(Boolean) : results.some(Boolean)
  }
  return false
}

const shouldExecuteStep = (step: FlowStep) => (step.only_if ? evaluateCondition(step.only_if) : Promise.resolve(true))

// Step satisfaction checks
const stepEps = (step: FlowStep) => (step.trim_on ? TRIM_EPS : FUZZY_EPS)

function stepAlreadySatisfied(current: number | null, step: FlowStep): boolean {
  if (current === null) return false
  return step.expect_min !== undefined
    ? current >= toNumber(step.expect_min)
    : simvarMatchesExpected(current, step.expect, stepEps(step))
}

function stepVerificationPassed(value: number | null, step: FlowStep): boolean {
  return stepAlreadySatisfied(value, step)
}

// Post-landing timer
class PostLandingTimer {
  private expiresAt: number | null = null
  private timeoutId: ReturnType<typeof setTimeout> | null = null

  get isActive() {
    return this.expiresAt !== null && Date.now() < this.expiresAt
  }

  clear(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId as unknown as number)
      this.timeoutId = null
    }
    this.expiresAt = null
  }

  start(minutes: number): void {
    this.clear()
    const delayMs = Math.max(1, Math.floor(minutes)) * 60_000
    this.expiresAt = Date.now() + delayMs
    this.timeoutId = setTimeout(async () => {
      this.expiresAt = null
      this.timeoutId = null
      try {
        await playSound("3_minutes.ogg")
      } catch (err) {
        console.error("[FlowRunner] Failed to play post-landing expiry announcement:", err)
      }
    }, delayMs)
  }
}

// Flow runner
class FlowRunner {
  private abortController: AbortController | null = null
  readonly postLandingTimer = new PostLandingTimer()

  abort(): void {
    this.abortController?.abort()
    this.abortController = null
    useFlowStore.getState().setExecutionState("aborted")
  }

  async execute(flowId: string): Promise<void> {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    const store = useFlowStore.getState()
    const rawFlow = getFlowById(flowId)
    if (!rawFlow) {
      store.setError(`Flow "${flowId}" not found`)
      return
    }
    const preconditionError = await this.checkPreconditions(flowId)
    if (preconditionError) {
      store.setError(preconditionError)
      return
    }
    const flow: Flow = await resolveFlow(rawFlow)
    store.setFlow(flow)
    if (flow.id === "after_landing" && useSettingsStore.getState().postLandingShutdownEnabled)
      this.postLandingTimer.start(POST_LANDING_TIMER_MINUTES)
    this.abortController = new AbortController()
    const { signal } = this.abortController
    try {
      await this.playFlowStartSound(flow, signal)
      await this.runSteps(flow, signal)
      useFlowStore.getState().setExecutionState("completed")
      this.onFlowCompleted(flow)
      await this.playFlowEndSound(flow)
    } catch (err) {
      if (signal.aborted) useFlowStore.getState().setExecutionState("aborted")
      else useFlowStore.getState().setError(err instanceof Error ? err.message : String(err))
    } finally {
      this.abortController = null
    }
  }

  private async checkPreconditions(flowId: string): Promise<string | null> {
    if (useCabinReadyTimerStore.getState().isRunning && BLOCKED_FLOWS.has(flowId)) {
      playSound("cabin_not_secure.ogg")
      return "Cannot start before takeoff flow - cabin ready timer is running"
    }
    if (this.postLandingTimer.isActive && BLOCKED_FLOWS.has(flowId)) {
      playSound("3_minutes_negative.ogg")
      return `Cannot start ${flowId} flow - post-landing timer is still running`
    }
    return null
  }

  private async runSteps(flow: Flow, signal: AbortSignal): Promise<void> {
    const { setStepIndex, setStepStatus } = useFlowStore.getState()
    const lastIdx = flow.steps.length - 1

    for (let i = 0; i <= lastIdx; i++) {
      this.checkAbort(signal)
      const step = flow.steps[i]
      setStepIndex(i)
      setStepStatus(i, "executing")

      if (!(await shouldExecuteStep(step))) {
        setStepStatus(i, "skipped")
        if (i < lastIdx && !step.skip_delay) await this.abortableSleep(getRandomStepDelay(), signal)
        continue
      }

      await this.executeStep(step, i, flow, signal)
      if (i < lastIdx && !step.skip_delay) await this.abortableSleep(getRandomStepDelay(), signal)
    }
  }

  private async setTrim(signal: AbortSignal, read: string, target: number): Promise<void> {
    const cur = await readSimvar(read)
    if (cur === null || Math.abs(cur - target) < TRIM_EPS) return

    const up = cur < target
    const cmds = up ? ["77842", "77843"] : ["77840", "77841"]

    await writeSimvar(`${cmds[0]} (>L:CEVENT)`)
    this.checkAbort(signal)

    while (true) {
      this.checkAbort(signal)
      await sleep(50)

      const val = await readSimvar(read)
      if (val === null) continue

      if (up ? val >= target : val <= target) {
        await writeSimvar(`${cmds[1]} (>L:CEVENT)`)
        await sleep(200)
        this.checkAbort(signal)

        const settled = await readSimvar(read)
        if (settled !== null && Math.abs(settled - target) > TRIM_EPS) {
          await sleep(100)
          await this.setTrim(signal, read, target)
        }
        return
      }
    }
  }

  private async executeStep(step: FlowStep, index: number, flow: Flow, signal: AbortSignal): Promise<void> {
    const { setStepStatus } = useFlowStore.getState()
    if (step.hyd_test) {
      await this.playHydTest()
      await waitForSoundFinished() // nothing touches the simvar until this clears
    }

    if (index > 0 && flow.steps[index - 1]?.skip_delay) {
      await this.abortableSleep(250, signal)
    }

    if (step.trim_on) {
      setStepStatus(index, "executing")
      const tgt =
        step.expect !== undefined
          ? toNumber(step.expect)
          : (((usePerformanceStore.getState().takeoff.trim ?? 0) + 1) / 16.5) * 100
      await this.setTrim(signal, step.read, tgt)
      return setStepStatus(index, "done")
    }

    const currentValue = await readSimvar(step.read)
    this.checkAbort(signal)

    console.log(
      `[FlowRunner] Step "${step.label}": read=${currentValue}, ${step.expect_min !== undefined ? `expect_min=${step.expect_min}` : `expect=${step.expect}`}`
    )

    if (stepAlreadySatisfied(currentValue, step)) {
      if (step.wait_ms) await this.abortableSleep(step.wait_ms, signal)
      setStepStatus(index, "skipped")
      return
    }

    await this.writeStep(step, signal)
    await this.handlePostWrite(step, signal)

    if (!step.repeat_on) {
      await this.verifyAndFinish(step, index, signal)
    } else {
      setStepStatus(index, "done")
    }
  }

  private async writeStep(step: FlowStep, signal: AbortSignal): Promise<void> {
    if (!step.on) throw new Error(`[FlowRunner] Missing step.on for step "${step.label}"`)
    if (step.repeat_on) {
      await this.writeUntilSatisfied(step, signal)
    } else {
      await writeSimvar(step.on)
      this.checkAbort(signal)
    }
  }

  private async writeUntilSatisfied(step: FlowStep, signal: AbortSignal): Promise<void> {
    if (!step.on) throw new Error(`[FlowRunner] Missing step.on for repeated step "${step.label}"`)
    while (true) {
      this.checkAbort(signal)
      const before = await readSimvar(step.read)
      if (before !== null && stepVerificationPassed(before, step)) break

      await writeSimvar(step.on)
      this.checkAbort(signal)

      // 🔄 Rust handles the 500ms block collecting loop natively now
      const after =
        before !== null
          ? await simvarGet(step.read)
          : await this.abortableSleep(SIMVAR.WRITE_SETTLE, signal).then(() => readSimvar(step.read))

      this.checkAbort(signal)
      if (after !== null && stepVerificationPassed(after, step)) break
      await this.abortableSleep(SIMVAR.REPEAT_RETRY_DELAY, signal)
    }
  }

  private async playSyncSound(soundFile: string, signal?: AbortSignal): Promise<void> {
    await waitForSoundFinished()
    await playSound(soundFile)
    await waitForSoundFinished()
    if (signal) this.checkAbort(signal)
  }

  private async handlePostWrite(step: FlowStep, signal: AbortSignal): Promise<void> {
    if (step.sound_on_execute) await this.playSyncSound(step.sound_on_execute, signal)
    if (step.wait_ms) await this.abortableSleep(step.wait_ms, signal)
  }

  private async verifyAndFinish(step: FlowStep, index: number, signal: AbortSignal): Promise<void> {
    const { setStepStatus } = useFlowStore.getState()
    setStepStatus(index, "verifying")
    let verified = false

    for (let attempt = 0; attempt < STEP_VERIFY.RETRIES; attempt++) {
      this.checkAbort(signal)
      if (!step.skip_delay) await sleep(STEP_VERIFY.DELAY)
      if (stepVerificationPassed(await readSimvar(step.read), step)) {
        verified = true
        break
      }
    }

    if (!verified) {
      const target = step.expect_min !== undefined ? `>= ${step.expect_min}` : String(step.expect)
      console.warn(`[FlowRunner] Step "${step.label}" verification failed (expected ${target})`)
      setStepStatus(index, "failed")
      return
    }

    setStepStatus(index, "done")
    if (step.sound_after_execute) {
      if (!step.skip_delay) await this.abortableSleep(STEP_VERIFY.SOUND_AFTER_DELAY, signal)
      await this.playSyncSound(step.sound_after_execute, signal)
    }
  }

  private async playFlowStartSound(flow: Flow, signal: AbortSignal): Promise<void> {
    if (flow.sound_start) await this.playSyncSound(flow.sound_start, signal)
  }

  private async playFlowEndSound(flow: Flow): Promise<void> {
    if (flow.sound_end) await this.playSyncSound(flow.sound_end)
  }

  private async playHydTest(): Promise<void> {
    const { soundPack, geSoundPack } = useSettingsStore.getState()
    await waitForSoundFinished()
    await playSoundSequence([
      { filename: "ground_fd.ogg", pack: soundPack },
      { filename: "go_ahead.ogg", pack: geSoundPack },
      { filename: "hyd_test.ogg", pack: soundPack },
      { filename: "roger.ogg", pack: geSoundPack }
    ])
    await sleep(200)
    await waitForSoundFinished()
  }

  private onFlowCompleted(flow: Flow): void {
    const voiceHints = useVoiceHintProgressStore.getState()
    voiceHints.recordFlowCompleted(flow.id)
    if (flow.id === "shutdown") voiceHints.resetForColdGround()
  }

  private checkAbort(signal: AbortSignal): void {
    if (signal.aborted) throw new Error("Flow aborted")
  }

  private async abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
    for (let elapsed = 0; elapsed < ms; elapsed += 100) {
      this.checkAbort(signal)
      await sleep(Math.min(100, ms - elapsed))
    }
  }
}

const runner = new FlowRunner()
export const executeFlow = (flowId: string): Promise<void> => runner.execute(flowId)
export const abortFlow = (): void => runner.abort()
export const isPostLandingTimerActive = (): boolean => runner.postLandingTimer.isActive
