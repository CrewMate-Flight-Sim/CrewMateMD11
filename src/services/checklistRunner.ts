import { listen } from "@tauri-apps/api/event"

import { simvarGet } from "@/API/simvarApi"
import { getChecklistById } from "@/services/checklistLoader"
import { isSoundPlaying, playSound, playSoundSequence } from "@/services/playSounds"
import { useCabinReadyTimerStore } from "@/store/cabinReadyTimerStore"
import { useChecklistStore } from "@/store/checklistStore"
import { usePerformanceStore } from "@/store/performanceStore"
import { useSettingsStore } from "@/store/settingsStore"
import { useVoiceHintProgressStore } from "@/store/voiceHintProgressStore"
import type { Check, ChecklistItem, ValidationRule } from "@/types/checklist"

import { vars, getTemplateVars, resolveFlapsDialPercent } from "./flowLoader"
import { getMd11Variant } from "./MD11variant"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIMVAR = { READ_RETRIES: 5, READ_RETRY_DELAY: 150 }
const BLOCKED_CHECKLISTS = new Set(["taxi", "before_takeoff"])

const AUTO_CHECK_RETRY_DELAY = 2000
const FO_ONLY_POLL_DELAY = 200

const AUTOBRAKE_FILES: Record<number, string> = { 2: "min.ogg", 3: "med.ogg", 4: "max.ogg" }

const NUMBER_WORD_PATTERN = `(?:zero|one|two|three|four|five|six|seven|eight|nine|niner|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)`
const NUMBER_WORDS_RE = new RegExp(`\\b${NUMBER_WORD_PATTERN}(?:[\\s-]+${NUMBER_WORD_PATTERN}){0,3}\\b`, "i")
const NUMBER_TOKEN_PATTERNS: Record<string, RegExp> = { "#2": /\b\d{2}\b/, "#3": /\b\d{3}\b/, "#4": /\b\d{4}\b/ }

const FLAP_WORDS = [
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "twenty_one",
  "twenty_two",
  "twenty_three",
  "twenty_four",
  "twenty_five"
] as const
const DISCRETE_FLAP_COMMAND_TO_VALUE: Record<string, number> = Object.fromEntries(
  FLAP_WORDS.map((w, i) => [`flaps_${w}`, i + 10])
)

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// Small debounce before polling, then waits out any sound already playing.
async function waitForSoundFinished(signal?: AbortSignal): Promise<void> {
  await sleep(50)
  while (await isSoundPlaying()) {
    if (signal?.aborted) return
    await sleep(100)
  }
}

async function playSyncSound(soundFile: string): Promise<void> {
  await waitForSoundFinished()
  await playSound(soundFile)
  await waitForSoundFinished()
}

function checkAbort(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("Checklist aborted")
}

// ---------------------------------------------------------------------------
// Speech input
// ---------------------------------------------------------------------------

type SpeechRecognizedPayload = {
  type?: string
  text?: string
  commandType?: string
  payload?: Record<string, unknown>
}
type SpeechInput = { text: string; commandType?: string; payload?: Record<string, unknown> }

async function waitForSpeechInput(signal: AbortSignal): Promise<SpeechInput | null> {
  if (signal.aborted) return null

  return new Promise<SpeechInput | null>((resolve) => {
    let unlistenFn: (() => void) | null = null
    let resolved = false

    const done = (value: SpeechInput | null) => {
      if (resolved) return
      resolved = true
      unlistenFn?.()
      resolve(value)
    }

    signal.addEventListener("abort", () => done(null), { once: true })

    listen<SpeechRecognizedPayload>("speech_recognized", (event) => {
      if (event.payload?.type === "speech_unrecognized") return
      const text = event.payload?.text?.trim().toLowerCase()
      if (text) done({ text, commandType: event.payload?.commandType, payload: event.payload?.payload })
    }).then((fn) => {
      unlistenFn = fn
      if (signal.aborted) done(null)
    })
  })
}

function matchesResponse(spoken: string, response: string): boolean {
  if (response === "*") return true
  const input = spoken.toLowerCase()
  for (const token of response.toLowerCase().split(/\s+/)) {
    const numPattern = NUMBER_TOKEN_PATTERNS[token]
    if (numPattern) {
      if (!numPattern.test(spoken) && (token !== "#2" || !NUMBER_WORDS_RE.test(input))) return false
    } else if (!new RegExp(`\\b${token}\\b`).test(input)) {
      return false
    }
  }
  return true
}

function matchesAnyResponse(spoken: string, responses: string[]): boolean {
  return responses.some((r) => matchesResponse(spoken, r))
}

function getSpokenFlapSetting(spoken: string, command?: string): number | null {
  if (command && DISCRETE_FLAP_COMMAND_TO_VALUE[command] !== undefined) {
    return DISCRETE_FLAP_COMMAND_TO_VALUE[command]
  }
  const digits = spoken
    .toLowerCase()
    .trim()
    .replace(/-/g, " ")
    .match(/\b(1\d|2[0-5])\b/)
  return digits ? Number(digits[1]) : null
}

// ---------------------------------------------------------------------------
// SimVar / store readers
// ---------------------------------------------------------------------------

function getStoreValue(storePath: string): string | undefined {
  const state = usePerformanceStore.getState() as unknown as Record<string, Record<string, string>>
  const [section, key] = storePath.split(".")
  return state[section]?.[key]
}

async function readSimVar(expression: string): Promise<number | null> {
  for (let attempt = 0; attempt < SIMVAR.READ_RETRIES; attempt++) {
    try {
      const value = await simvarGet(expression)
      if (value !== null) return value
    } catch (err) {
      console.warn(`[ChecklistRunner] Failed to read simvar "${expression}":`, err)
      return null
    }
    await sleep(SIMVAR.READ_RETRY_DELAY)
  }
  return null
}

// ---------------------------------------------------------------------------
// Check evaluation
// ---------------------------------------------------------------------------

async function runChecks(checks: Check[], signal: AbortSignal): Promise<boolean> {
  for (const check of checks) {
    let pass = false

    if (check.type === "any" && check.groups) {
      for (const group of check.groups) {
        if (await runChecks(group, signal)) {
          pass = true
          break
        }
      }
    }

    if (check.type === "simvar" && check.var) {
      const raw = await readSimVar(check.var)
      checkAbort(signal)

      let expected: number | null = null
      const expType = typeof check.expected

      if (expType === "boolean") {
        expected = check.expected ? 1 : 0
      } else if (expType === "number") {
        expected = check.expected as number
      } else if (expType === "string") {
        const n = parseFloat((check.expected as string).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ""))
        expected = isNaN(n) ? null : n
      } else if (expType === "object" && check.expected !== null) {
        const storeRaw = getStoreValue((check.expected as { store: string }).store)
        if (storeRaw !== undefined) {
          const n = parseFloat(storeRaw)
          expected = isNaN(n) ? null : n
        }
      }

      if (raw !== null && expected !== null) {
        pass = expType === "boolean" ? (raw > 0.5 ? 1 : 0) === expected : Math.abs(raw - expected) < 0.5
      }
    }

    if (check.type === "store" && check.store) {
      pass = getStoreValue(check.store) === check.equals
    }

    if (check.type === "flaps_to") {
      const targetRaw = await readSimVar(check.target_var ?? "(L:md11_efb_flaps)")
      const dialRaw = await readSimVar(check.dial_var ?? "(L:MD11_DIALAFLAP_WHEEL_RNG)")
      checkAbort(signal)
      if (targetRaw !== null && dialRaw !== null) {
        const expectedDial = resolveFlapsDialPercent(targetRaw)
        pass = expectedDial !== null && Math.abs(dialRaw - expectedDial) <= (check.tolerance ?? 2)
      }
    }

    if (!pass) return false
  }

  return true
}

async function findPassingRule(
  validations: ValidationRule[],
  spoken: string,
  signal: AbortSignal
): Promise<ValidationRule | null> {
  // Find the rule whose response token best (longest) matches spoken
  let bestMatch: ValidationRule | undefined
  let bestLen = -1

  for (const rule of validations) {
    for (const token of rule.when.responses ?? []) {
      if (matchesResponse(spoken, token) && token.length > bestLen) {
        bestLen = token.length
        bestMatch = rule
      }
    }
  }

  // If a response-based rule matched, only check that one
  if (bestMatch) {
    const ok = await runChecks(bestMatch.checks ?? [], signal)
    return ok ? bestMatch : null
  }

  // No response matched — try always/store rules in order (handles silent mode
  // and items with no response-based validations)
  for (const rule of validations) {
    const w = rule.when
    const conditionMet = (w.store && getStoreValue(w.store.path) === w.store.equals) || w.always === true
    if (!conditionMet) continue

    const ok = await runChecks(rule.checks ?? [], signal)
    if (ok) return rule
  }

  return null
}

// ---------------------------------------------------------------------------
// Checklist runner
// ---------------------------------------------------------------------------

class ChecklistRunner {
  private abortController: AbortController | null = null

  // ── Public API ────────────────────────────────────────────────────────────

  abort(): void {
    this.abortController?.abort()
    this.abortController = null
  }

  async execute(checklistId: string): Promise<void> {
    const cargo = getMd11Variant() === "cargo"

    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }

    const store = useChecklistStore.getState()
    const checklist = getChecklistById(checklistId)
    if (!checklist) {
      store.setError(`Checklist "${checklistId}" not found`)
      return
    }

    await getTemplateVars()

    const preconditionError = this.checkPreconditions(checklistId)
    if (preconditionError) {
      playSound("cabin_not_secure.ogg")
      store.setError(preconditionError)
      return
    }

    store.setChecklist(checklist)

    this.abortController = new AbortController()
    const { signal } = this.abortController

    try {
      await this.runItems(checklist.items, signal)

      await playSyncSound(checklist.completion)

      store.setExecutionState("completed")
      this.onChecklistCompleted(checklist.id, cargo)
    } catch (err) {
      const message = String(err)
      if (message.includes("aborted")) {
        store.setExecutionState("aborted")
      } else {
        store.setError(message)
      }
    } finally {
      this.abortController = null
    }
  }

  // ── Precondition checks ───────────────────────────────────────────────────

  private checkPreconditions(checklistId: string): string | null {
    const cabinTimer = useCabinReadyTimerStore.getState()
    if (cabinTimer.isRunning && BLOCKED_CHECKLISTS.has(checklistId)) {
      return "Cannot start taxi checklist - cabin ready timer is running"
    }
    return null
  }

  // ── Item iteration ────────────────────────────────────────────────────────

  private async runItems(items: ChecklistItem[], signal: AbortSignal): Promise<void> {
    for (let i = 0; i < items.length; i++) {
      checkAbort(signal)
      useChecklistStore.getState().setStepIndex(i)
      await this.executeItem(items[i], i, signal)
    }
  }

  // ── Single item execution ─────────────────────────────────────────────────

  private async executeItem(item: ChecklistItem, index: number, signal: AbortSignal): Promise<void> {
    const cargo = getMd11Variant() === "cargo"
    const { setStepStatus } = useChecklistStore.getState()
    setStepStatus(index, "active")

    if (!item.challenge) {
      await this.runAutoCheckItem(item, signal)
      setStepStatus(index, "complete")
      return
    }

    if (cargo && item.cargo_skip) {
      setStepStatus(index, "complete")
      return
    }

    if (item.fo_only_response) {
      await this.runFoOnlyItem(item, signal)
      setStepStatus(index, "complete")
      return
    }

    const result = await this.runInteractiveItem(item, signal)
    if (result === null) return // aborted; status left as "active"

    if (!result.responsePlayed && item.copilot_response) {
      await playSyncSound(item.copilot_response)
    }
    await waitForSoundFinished()

    setStepStatus(index, "complete")
  }

  // ── Auto-check phase (no challenge, validations only) ─────────────────────

  private async runAutoCheckItem(item: ChecklistItem, signal: AbortSignal): Promise<void> {
    if (item.validations?.length) {
      while (true) {
        checkAbort(signal)
        if (await findPassingRule(item.validations, "", signal)) break
        if (item.incorrect) await playSyncSound(item.incorrect)
        await sleep(AUTO_CHECK_RETRY_DELAY)
      }
    }
    if (item.delay_ms) await sleep(item.delay_ms)
  }

  // ── First-officer-only phase (challenge plays, no crew speech expected) ───

  private async runFoOnlyItem(item: ChecklistItem, signal: AbortSignal): Promise<void> {
    await waitForSoundFinished()
    const challengeDone = playSound(item.challenge!)
    let responsePlayed = false

    if (item.validations?.length) {
      while (true) {
        checkAbort(signal)
        const rule = await findPassingRule(item.validations, "", signal)
        if (rule) {
          await challengeDone
          if (rule.copilot_response) {
            await playSyncSound(rule.copilot_response)
            responsePlayed = true
          }
          break
        }
        await sleep(FO_ONLY_POLL_DELAY)
      }
    } else {
      await challengeDone
    }

    if (!responsePlayed && item.copilot_response) await playSyncSound(item.copilot_response)
  }

  // ── Normal interactive phase (challenge → speech response → confirmations) ─

  private async runInteractiveItem(
    item: ChecklistItem,
    signal: AbortSignal
  ): Promise<{ responsePlayed: boolean } | null> {
    const responseList = item.response ?? []
    const hold = () => useSettingsStore.getState().holdOnIncorrect
    let responsePlayed = false
    let stepAccepted = false

    while (!stepAccepted) {
      checkAbort(signal)
      await playSyncSound(item.challenge!)

      const spoken = await this.waitForMatchingResponse(responseList, signal)
      if (spoken === null) return null // aborted
      checkAbort(signal)

      if (item.flaps_confirmation) {
        const ok = await this.checkFlapsConfirmation(item, spoken)
        if (!ok) {
          if (!hold()) stepAccepted = true
          continue
        }
      }

      if (item.validations?.length) {
        const rule = await findPassingRule(item.validations, spoken.text, signal)
        if (!rule) {
          await playSyncSound(item.incorrect ?? "are_you_sure.ogg")
          if (!hold()) stepAccepted = true
          continue
        }
        if (rule.copilot_response) {
          await playSyncSound(rule.copilot_response)
          responsePlayed = true
        }
      }

      if (item.flaps_confirmation && vars["flapsefb"]) {
        await playSyncSound(`flaps_${vars["flapsefb"]}.ogg`)
        responsePlayed = true
      }

      if (item.trim_confirmation) {
        await this.playTrimConfirmation()
      }

      if (item.abrk_confirmation) {
        await this.playAutobrakeConfirmation()
      }

      stepAccepted = true
    }

    return { responsePlayed }
  }

  private async waitForMatchingResponse(responseList: string[], signal: AbortSignal): Promise<SpeechInput | null> {
    while (true) {
      const spoken = await waitForSpeechInput(signal)
      if (spoken === null) return null
      if (!responseList.length || matchesAnyResponse(spoken.text, responseList)) return spoken
    }
  }

  private async checkFlapsConfirmation(item: ChecklistItem, spoken: SpeechInput): Promise<boolean> {
    const command =
      spoken.commandType === "discrete" && typeof spoken.payload?.command === "string"
        ? spoken.payload.command
        : undefined
    const spokenFlap = getSpokenFlapSetting(spoken.text, command)
    const expectedFlap = Math.round(Number(vars["flapsefb"]))
    const ok = spokenFlap !== null && (!Number.isFinite(expectedFlap) || spokenFlap === expectedFlap)
    if (!ok) await playSyncSound(item.incorrect ?? "are_you_sure.ogg")
    return ok
  }

  private async playTrimConfirmation(): Promise<void> {
    const rawTrim = (await readSimVar("(L:MD11_EXT_STAB_TRIM)")) ?? 0
    const units = Math.max(0, Number(rawTrim) * 0.165 - 1.0).toFixed(1)
    const [whole, decimal] = units.split(".")
    const files = [`${whole}.ogg`, "point.ogg", `${decimal}.ogg`]
    await playSoundSequence([...files, "units_set.ogg"])
    await waitForSoundFinished()
  }

  private async playAutobrakeConfirmation(): Promise<void> {
    const raw = (await simvarGet("(L:MD11_CTR_AUTOBRAKE_SW)")) ?? 0
    const file = AUTOBRAKE_FILES[Math.round(Number(raw))]
    if (!file) return
    await playSoundSequence(["set.ogg", file])
    await waitForSoundFinished()
  }

  // ── Completion side-effects ───────────────────────────────────────────────

  private onChecklistCompleted(checklistId: string, cargo: boolean): void {
    useVoiceHintProgressStore.getState().recordChecklistCompleted(checklistId)

    if (checklistId === "after_start" && !cargo) {
      useCabinReadyTimerStore.getState().startTimer(1 + Math.random() * 3)
    }
    if (checklistId === "parking") {
      useVoiceHintProgressStore.getState().resetForColdGround()
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton + public API
// ---------------------------------------------------------------------------

const runner = new ChecklistRunner()

export const executeChecklist = (checklistId: string): Promise<void> => runner.execute(checklistId)
export const abortChecklist = (): void => runner.abort()
