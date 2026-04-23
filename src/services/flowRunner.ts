import { simvarGet, simvarSet } from "@/API/simvarApi"
import { getFlowById, resolveFlow } from "@/services/flowLoader"
import { playSound, isSoundPlaying, playSoundSequence } from "@/services/playSounds"
import { useCabinReadyTimerStore } from "@/store/cabinReadyTimerStore"
import { useFlowStore } from "@/store/flowStore"
import { usePerformanceStore } from "@/store/performanceStore"
import { useSettingsStore } from "@/store/settingsStore"
import { useVoiceHintProgressStore } from "@/store/voiceHintProgressStore"
import type { Flow, FlowStep, FlowConditionValue, FlowConditionOperator, FlowCondition } from "@/types/flow"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEP_DELAY_MIN_MS = 500
const STEP_DELAY_MAX_MS = 1500
const STEP_DELAY_RANGE_MS = STEP_DELAY_MAX_MS - STEP_DELAY_MIN_MS
const SIMVAR_READ_RETRIES = 5
const SIMVAR_READ_RETRY_DELAY_MS = 150
const SIMVAR_WRITE_SETTLE_MS = 300
const SIMVAR_REPEAT_RETRY_DELAY_MS = 500
const STEP_VERIFY_RETRIES = 5
const STEP_VERIFY_DELAY_MS = 300
const STEP_SOUND_AFTER_DELAY_MS = 1000
const POST_LANDING_TIMER_MINUTES = 5
const FUZZY_EQUALS_EPSILON = 0.5
const TRIM_FUZZY_EQUALS_EPSILON = 0.1
const BLOCKED_FLOWS = new Set(["before_takeoff"])

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const getRandomStepDelay = () => Math.random() * STEP_DELAY_RANGE_MS + STEP_DELAY_MIN_MS
const fuzzyEquals = (a: number, b: number, epsilon = FUZZY_EQUALS_EPSILON) => Math.abs(a - b) < epsilon
const toNumber = (value: number | string) => typeof value === "string" ? parseFloat(value) : value
const waitForSoundFinished = async () => { while (await isSoundPlaying()) await sleep(100) }

// ---------------------------------------------------------------------------
// SimVar I/O
// ---------------------------------------------------------------------------

async function readSimvar(expression: string): Promise<number | null> {
  for (let attempt = 0; attempt < SIMVAR_READ_RETRIES; attempt++) {
    try {
      const value = await simvarGet(expression)
      if (value !== null) return value
    } catch (err) {
      console.warn(`[FlowRunner] Failed to read "${expression}":`, err)
      return null
    }
    await sleep(SIMVAR_READ_RETRY_DELAY_MS)
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

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

function resolveFlowOption(path: string): unknown {
  const { takeoff, landing } = usePerformanceStore.getState()
  return path.split(".").reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== "object") return undefined
    return (acc as Record<string, unknown>)[key]
  }, { takeoff, landing })
}

function optionMatchesExpected(actual: unknown, expected: FlowConditionValue): boolean {
  if (typeof actual === "number" && typeof expected === "number") return fuzzyEquals(actual, expected)
  const a = Number(actual), e = Number(expected)
  return (!Number.isNaN(a) && !Number.isNaN(e)) ? fuzzyEquals(a, e) : String(actual) === String(expected)
}

function simvarMatchesExpected(actual: number | null, expected: FlowConditionValue, epsilon = FUZZY_EQUALS_EPSILON): boolean {
  if (typeof expected !== "number" && typeof expected !== "string") return false
  return actual !== null && fuzzyEquals(actual, toNumber(expected), epsilon)
}

async function evaluateSingleCondition(condition: { read?: string; option?: string; one_of: FlowConditionValue[] }): Promise<boolean> {
  if ("option" in condition && condition.option !== undefined) {
    const optionValue = resolveFlowOption(condition.option)
    if (optionValue === undefined) { console.warn(`[FlowRunner] Step condition option not found: "${condition.option}"`); return false }
    return condition.one_of.some((e) => optionMatchesExpected(optionValue, e))
  }
  if (condition.read !== undefined) {
    const val = await readSimvar(condition.read)
    if (val === null) { console.warn(`[FlowRunner] Step condition read failed for "${condition.read}"`); return false }
    return condition.one_of.some((e) => simvarMatchesExpected(val, e))
  }
  return false
}

async function evaluateCondition(condition: FlowCondition): Promise<boolean> {
  if ("read" in condition || "option" in condition) return evaluateSingleCondition(condition)
  if ("conditions" in condition) {
    const { conditions, operator = "and" } = condition as { conditions: FlowCondition[]; operator?: FlowConditionOperator }
    if (!conditions.length) return true
    const results = await Promise.all(conditions.map((c) => evaluateCondition(c)))
    return operator === "and" ? results.every(Boolean) : results.some(Boolean)
  }
  return false
}

const shouldExecuteStep = async (step: FlowStep) => step.only_if ? evaluateCondition(step.only_if) : true

// ---------------------------------------------------------------------------
// Step satisfaction checks
// ---------------------------------------------------------------------------

function stepAlreadySatisfied(currentValue: number | null, step: FlowStep): boolean {
  if (currentValue === null) return false
  if (step.expect_min !== undefined) return currentValue >= toNumber(step.expect_min)
  return simvarMatchesExpected(currentValue, step.expect, step.trim_on ? TRIM_FUZZY_EQUALS_EPSILON : FUZZY_EQUALS_EPSILON)
}

function stepVerificationPassed(value: number | null, step: FlowStep): boolean {
  if (value === null) return false
  if (step.expect_min !== undefined) return value >= toNumber(step.expect_min)
  return simvarMatchesExpected(value, step.expect, step.trim_on ? TRIM_FUZZY_EQUALS_EPSILON : FUZZY_EQUALS_EPSILON)
}

// ---------------------------------------------------------------------------
// Post-landing timer
// ---------------------------------------------------------------------------

class PostLandingTimer {
  private expiresAt: number | null = null
  private timeoutId: ReturnType<typeof setTimeout> | null = null

  get isActive() { return this.expiresAt !== null && Date.now() < this.expiresAt }

  clear(): void {
    if (this.timeoutId !== null) { clearTimeout(this.timeoutId as unknown as number); this.timeoutId = null }
    this.expiresAt = null
  }

  start(minutes: number): void {
    this.clear()
    const delayMs = Math.max(1, Math.floor(minutes)) * 60 * 1000
    this.expiresAt = Date.now() + delayMs
    this.timeoutId = setTimeout(async () => {
      this.expiresAt = null
      this.timeoutId = null
      try { await playSound("five_minutes.ogg") }
      catch (err) { console.error("[FlowRunner] Failed to play post-landing expiry announcement:", err) }
    }, delayMs)
  }
}

// ---------------------------------------------------------------------------
// Flow runner
// ---------------------------------------------------------------------------

class FlowRunner {
  private abortController: AbortController | null = null
  private readonly postLandingTimer = new PostLandingTimer()

  // ── Public API ────────────────────────────────────────────────────────────

  abort(): void {
    this.abortController?.abort()
    this.abortController = null
    useFlowStore.getState().setExecutionState("aborted")
  }

  async execute(flowId: string): Promise<void> {
    if (this.abortController) { this.abortController.abort(); this.abortController = null }

    const store = useFlowStore.getState()
    const rawFlow = getFlowById(flowId)
    if (!rawFlow) { store.setError(`Flow "${flowId}" not found`); return }

    const preconditionError = await this.checkPreconditions(flowId)
    if (preconditionError) { store.setError(preconditionError); return }

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
      if (signal.aborted) {
        useFlowStore.getState().setExecutionState("aborted")
      } else {
        useFlowStore.getState().setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      this.abortController = null
    }
  }

  // ── Precondition checks ───────────────────────────────────────────────────

  private async checkPreconditions(flowId: string): Promise<string | null> {
    const cabinTimer = useCabinReadyTimerStore.getState()
    if (cabinTimer.isRunning && BLOCKED_FLOWS.has(flowId)) {
      playSound("cabin_not_secure.ogg")
      return "Cannot start before takeoff flow - cabin ready timer is running"
    }
    return null
  }

  // ── Step iteration ────────────────────────────────────────────────────────

  private async runSteps(flow: Flow, signal: AbortSignal): Promise<void> {
    for (let i = 0; i < flow.steps.length; i++) {
      this.checkAbort(signal)
      const step = flow.steps[i]
      const { setStepIndex, setStepStatus } = useFlowStore.getState()
      setStepIndex(i)
      setStepStatus(i, "executing")

      if (!(await shouldExecuteStep(step))) {
        setStepStatus(i, "skipped")
        if (i < flow.steps.length - 1 && !step.skip_delay) await this.abortableSleep(getRandomStepDelay(), signal)
        continue
      }

      await this.executeStep(step, i, flow, signal)
      if (i < flow.steps.length - 1 && !step.skip_delay) await this.abortableSleep(getRandomStepDelay(), signal)
    }
  }

  // ── Trim ──────────────────────────────────────────────────────────────────

  private async setTrim(signal: AbortSignal, read: string, target: number): Promise<void> {
    const current = await readSimvar(read)
    if (current === null || Math.abs(current - target) < 0.2) return

    const goingUp = current < target
    await writeSimvar(goingUp ? "77842 (>L:CEVENT)" : "77840 (>L:CEVENT)")
    this.checkAbort(signal)

    while (true) {
      this.checkAbort(signal)
      await sleep(50)
      const value = await readSimvar(read)
      if (value === null) continue
      if (Math.abs(value - target) < 0.2) break
      if ((goingUp && value > target) || (!goingUp && value < target)) {
        await writeSimvar(goingUp ? "77843 (>L:CEVENT)" : "77841 (>L:CEVENT)")
        this.checkAbort(signal)
        await this.setTrim(signal, read, target)
        return
      }
    }

    await writeSimvar(goingUp ? "77843 (>L:CEVENT)" : "77841 (>L:CEVENT)")
    this.checkAbort(signal)
  }

  // ── Single step execution ─────────────────────────────────────────────────

  private async executeStep(step: FlowStep, index: number, flow: Flow, signal: AbortSignal): Promise<void> {
    const { setStepStatus } = useFlowStore.getState()

    if (step.hyd_test) await this.playHydTest()

    const prevStep = flow.steps[index - 1]
    if (index > 0 && prevStep?.skip_delay) await this.abortableSleep(250, signal)

    if (step.trim_on) {
      setStepStatus(index, "executing")
      const target = step.expect !== undefined
        ? toNumber(step.expect)
        : (((usePerformanceStore.getState().takeoff.trim ?? 0) + 1.0) / 16.5) * 100
      await this.setTrim(signal, step.read, target)
      setStepStatus(index, "done")
      return
    }

    const currentValue = await readSimvar(step.read)
    this.checkAbort(signal)
    console.log(`[FlowRunner] Step "${step.label}": read=${currentValue}, ` +
      (step.expect_min !== undefined ? `expect_min=${step.expect_min}` : `expect=${step.expect}`))

    if (stepAlreadySatisfied(currentValue, step)) {
      if (step.wait_ms) await this.abortableSleep(step.wait_ms, signal)
      setStepStatus(index, "skipped")
      return
    }

    await this.writeStep(step, signal)
    await this.handlePostWrite(step, signal)
    await this.verifyAndFinish(step, index, signal)
  }

  // ── Write phase ───────────────────────────────────────────────────────────

  private async writeStep(step: FlowStep, signal: AbortSignal): Promise<void> {
    if (!step.on) throw new Error(`[FlowRunner] Missing step.on for step "${step.label}"`)
    step.repeat_on ? await this.writeUntilSatisfied(step, signal) : (await writeSimvar(step.on), this.checkAbort(signal))
  }

  private async writeUntilSatisfied(step: FlowStep, signal: AbortSignal): Promise<void> {
    if (!step.on) throw new Error(`[FlowRunner] Missing step.on for repeated step "${step.label}"`)
    while (true) {
      this.checkAbort(signal)
      await writeSimvar(step.on)
      this.checkAbort(signal)
      await this.abortableSleep(SIMVAR_WRITE_SETTLE_MS, signal)
      const current = await readSimvar(step.read)
      this.checkAbort(signal)
      if (stepVerificationPassed(current, step)) break
      await this.abortableSleep(SIMVAR_REPEAT_RETRY_DELAY_MS, signal)
    }
  }

  // ── Post-write phase ──────────────────────────────────────────────────────

  private async handlePostWrite(step: FlowStep, signal: AbortSignal): Promise<void> {
    if (step.sound_on_execute) {
      await waitForSoundFinished()
      await playSound(step.sound_on_execute)
      await waitForSoundFinished()
      this.checkAbort(signal)
    }
    if (step.wait_ms) await this.abortableSleep(step.wait_ms, signal)
  }

  // ── Verify phase ──────────────────────────────────────────────────────────

  private async verifyAndFinish(step: FlowStep, index: number, signal: AbortSignal): Promise<void> {
    const { setStepStatus } = useFlowStore.getState()
    setStepStatus(index, "verifying")

    let verified = false
    for (let attempt = 0; attempt < STEP_VERIFY_RETRIES; attempt++) {
      this.checkAbort(signal)
      if (!step.skip_delay) await sleep(STEP_VERIFY_DELAY_MS)
      if (stepVerificationPassed(await readSimvar(step.read), step)) { verified = true; break }
    }

    if (!verified) {
      const target = step.expect_min !== undefined ? `>= ${step.expect_min}` : String(step.expect)
      console.warn(`[FlowRunner] Step "${step.label}" verification failed (expected ${target})`)
      setStepStatus(index, "failed")
      return
    }

    setStepStatus(index, "done")
    if (step.sound_after_execute) {
      if (!step.skip_delay) await this.abortableSleep(STEP_SOUND_AFTER_DELAY_MS, signal)
      await waitForSoundFinished()
      await playSound(step.sound_after_execute)
      await waitForSoundFinished()
      this.checkAbort(signal)
    }
  }

  // ── Sound helpers ─────────────────────────────────────────────────────────

  private async playFlowStartSound(flow: Flow, signal: AbortSignal): Promise<void> {
    if (!flow.sound_start) return
    await waitForSoundFinished()
    await playSound(flow.sound_start)
    await waitForSoundFinished()
    this.checkAbort(signal)
  }

  private async playFlowEndSound(flow: Flow): Promise<void> {
    if (!flow.sound_end) return
    await waitForSoundFinished()
    await playSound(flow.sound_end)
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
    await waitForSoundFinished()
  }

  // ── Flow completion side-effects ──────────────────────────────────────────

  private onFlowCompleted(flow: Flow): void {
    const voiceHints = useVoiceHintProgressStore.getState()
    voiceHints.recordFlowCompleted(flow.id)
    if (flow.id === "shutdown") voiceHints.resetForColdGround()
  }

  // ── Abort / sleep helpers ─────────────────────────────────────────────────

  private checkAbort(signal: AbortSignal): void {
    if (signal.aborted) throw new Error("Flow aborted")
  }

  private async abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
    let elapsed = 0
    while (elapsed < ms) {
      this.checkAbort(signal)
      const chunk = Math.min(100, ms - elapsed)
      await sleep(chunk)
      elapsed += chunk
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton + public API
// ---------------------------------------------------------------------------

const runner = new FlowRunner()
export const executeFlow = (flowId: string): Promise<void> => runner.execute(flowId)
export const abortFlow = (): void => runner.abort()