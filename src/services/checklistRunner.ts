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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const wsf = async (signal?: AbortSignal) => {
  await sleep(50)
  while (await isSoundPlaying()) {
    if (signal?.aborted) return
    await sleep(100)
  }
}
const checkAbort = (s: AbortSignal) => {
  if (s.aborted) throw new Error("Checklist aborted")
}

type SpeechRecognizedPayload = { type?: string; text?: string; commandType?: string; payload?: Record<string, unknown> }
type SpeechInput = { text: string; commandType?: string; payload?: Record<string, unknown> }

async function waitForSpeechInput(signal: AbortSignal): Promise<SpeechInput | null> {
  if (signal.aborted) return null
  return new Promise<SpeechInput | null>((resolve) => {
    let unlistenFn: (() => void) | null = null
    let resolved = false
    const done = (v: SpeechInput | null) => {
      if (resolved) return
      resolved = true
      unlistenFn?.()
      resolve(v)
    }
    signal.addEventListener("abort", () => done(null), { once: true })
    listen<SpeechRecognizedPayload>("speech_recognized", (e) => {
      if (e.payload?.type === "speech_unrecognized") return
      const text = e.payload?.text?.trim().toLowerCase()
      if (text) done({ text, commandType: e.payload?.commandType, payload: e.payload?.payload })
    }).then((fn) => {
      unlistenFn = fn
      if (signal.aborted) done(null)
    })
  })
}

const NUM_WORD = `(?:zero|one|two|three|four|five|six|seven|eight|nine|niner|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)`
const NUM_RE = new RegExp(`\\b${NUM_WORD}(?:[\\s-]+${NUM_WORD}){0,3}\\b`, "i")

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

const NUM_PATTERNS: Record<string, RegExp> = { "#2": /\b\d{2}\b/, "#3": /\b\d{3}\b/, "#4": /\b\d{4}\b/ }

function matchesResponse(spoken: string, response: string): boolean {
  if (response === "*") return true
  const input = spoken.toLowerCase()
  for (const token of response.toLowerCase().split(/\s+/)) {
    const numPat = NUM_PATTERNS[token]
    if (numPat) {
      if (!numPat.test(spoken) && (token !== "#2" || !NUM_RE.test(input))) return false
    } else if (!input.includes(token)) return false
  }
  return true
}

const matchesAny = (spoken: string, responses: string[]) => responses.some((r) => matchesResponse(spoken, r))

function getStoreValue(storePath: string): string | undefined {
  const state = usePerformanceStore.getState() as unknown as Record<string, Record<string, string>>
  const [section, key] = storePath.split(".")
  return state[section]?.[key]
}

async function readSimVar(expression: string): Promise<number | null> {
  for (let i = 0; i < 5; i++) {
    try {
      const v = await simvarGet(expression)
      if (v !== null) return v
    } catch (err) {
      console.warn(`[ChecklistRunner] Failed to read simvar "${expression}":`, err)
      return null
    }
    await sleep(150)
  }
  return null
}

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
        const s = getStoreValue((check.expected as { store: string }).store)
        if (s !== undefined) {
          const n = parseFloat(s)
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
  if (bestMatch && (await runChecks(bestMatch.checks ?? [], signal))) return bestMatch

  for (const rule of validations) {
    const { when: w } = rule
    if (
      ((w.store && getStoreValue(w.store.path) === w.store.equals) || w.always) &&
      (await runChecks(rule.checks ?? [], signal))
    ) {
      return rule
    }
  }
  return null
}

let abortController: AbortController | null = null

const BLOCKED_CHECKLISTS = new Set(["taxi", "before_takeoff"])
const AUTOBRAKE_FILES: Record<number, string> = { 2: "min.ogg", 3: "med.ogg", 4: "max.ogg" }

// Helper to bundle repetitive audio-wait sequences
async function playWithSync(soundFile: string): Promise<void> {
  await wsf()
  await playSound(soundFile)
  await wsf()
}

async function executeNormalItem(item: ChecklistItem, index: number, signal: AbortSignal): Promise<void> {
  const cargo = getMd11Variant() === "cargo"
  const { setStepStatus } = useChecklistStore.getState()
  setStepStatus(index, "active")
  let responsePlayed = false

  // 1. Auto-check Phase
  if (!item.challenge) {
    if (item.validations?.length) {
      while (true) {
        checkAbort(signal)
        if (await findPassingRule(item.validations, "", signal)) break
        if (item.incorrect) await playWithSync(item.incorrect)
        await sleep(2000)
      }
    }
    if (item.delay_ms) await sleep(item.delay_ms)
    setStepStatus(index, "complete")
    return
  }

  // 2. Cargo skip Phase
  if (cargo && item.cargo_skip) {
    setStepStatus(index, "complete")
    return
  }

  // 3. First Officer Only Phase
  if (item.fo_only_response) {
    await wsf()
    const challengeDone = playSound(item.challenge)
    if (item.validations?.length) {
      while (true) {
        checkAbort(signal)
        const rule = await findPassingRule(item.validations, "", signal)
        if (rule) {
          await challengeDone
          if (rule.copilot_response) {
            await playWithSync(rule.copilot_response)
            responsePlayed = true
          }
          break
        }
        await sleep(200)
      }
    } else {
      await challengeDone
    }
    if (!responsePlayed && item.copilot_response) await playWithSync(item.copilot_response)
    setStepStatus(index, "complete")
    return
  }

  // 4. Normal Item Interactive Phase
  const responseList = item.response ?? []
  const hold = () => useSettingsStore.getState().holdOnIncorrect
  let stepAccepted = false

  while (!stepAccepted) {
    checkAbort(signal)
    await playWithSync(item.challenge)

    let spoken: SpeechInput | null = null
    while (true) {
      spoken = await waitForSpeechInput(signal)
      if (spoken === null) return
      if (!responseList.length || matchesAny(spoken.text, responseList)) break
    }

    const s = spoken.text
    checkAbort(signal)

    if (item.flaps_confirmation) {
      const command =
        spoken.commandType === "discrete" && typeof spoken.payload?.command === "string"
          ? spoken.payload.command
          : undefined
      const spokenFlap = getSpokenFlapSetting(s, command)
      const expectedFlap = Math.round(Number(vars["flapsefb"]))
      if (spokenFlap === null || (Number.isFinite(expectedFlap) && spokenFlap !== expectedFlap)) {
        await playWithSync(item.incorrect ?? "are_you_sure.ogg")
        if (!hold()) stepAccepted = true
        continue
      }
    }

    if (item.validations?.length) {
      const rule = await findPassingRule(item.validations, s, signal)
      if (!rule) {
        await playWithSync(item.incorrect ?? "are_you_sure.ogg")
        if (!hold()) stepAccepted = true
        continue
      }
      if (rule.copilot_response) {
        await playWithSync(rule.copilot_response)
        responsePlayed = true
      }
    }

    if (item.flaps_confirmation && vars["flapsefb"]) {
      await playWithSync(`flaps_${vars["flapsefb"]}.ogg`)
      responsePlayed = true
    }

    if (item.trim_confirmation) {
      const rawTrim = (await readSimVar("(L:MD11_EXT_STAB_TRIM)")) ?? 0
      const units = Math.max(0, Number(rawTrim) * 0.165 - 1.0).toFixed(1)
      const files = [...units].map((d) => (d === "." ? "point.ogg" : `${d}.ogg`))
      await playSoundSequence([...files, "units_set.ogg"])
      await wsf()
    }

    if (item.abrk_confirmation) {
      const raw = (await simvarGet("(L:MD11_CTR_AUTOBRAKE_SW)")) ?? 0
      const file = AUTOBRAKE_FILES[Math.round(Number(raw))]
      if (file) {
        await playSoundSequence(["set.ogg", file])
        await wsf()
      }
    }

    stepAccepted = true
  }

  if (!responsePlayed && item.copilot_response) await playWithSync(item.copilot_response)
  await wsf()
  setStepStatus(index, "complete")
}

export async function executeChecklist(checklistId: string): Promise<void> {
  const cargo = getMd11Variant() === "cargo"
  const store = useChecklistStore.getState()
  abortController?.abort()
  abortController = null

  const checklist = getChecklistById(checklistId)
  if (!checklist) {
    store.setError(`Checklist "${checklistId}" not found`)
    return
  }

  await getTemplateVars()
  const cabinTimer = useCabinReadyTimerStore.getState()
  if (cabinTimer.isRunning && BLOCKED_CHECKLISTS.has(checklistId)) {
    playSound("cabin_not_secure.ogg")
    store.setError("Cannot start taxi checklist - cabin ready timer is running")
    return
  }

  store.setChecklist(checklist)
  abortController = new AbortController()
  const { signal } = abortController

  try {
    for (let i = 0; i < checklist.items.length; i++) {
      checkAbort(signal)
      useChecklistStore.getState().setStepIndex(i)
      await executeNormalItem(checklist.items[i], i, signal)
    }
    await playWithSync(checklist.completion)
    useChecklistStore.getState().setExecutionState("completed")
    useVoiceHintProgressStore.getState().recordChecklistCompleted(checklist.id)

    if (checklistId === "after_start" && !cargo) {
      cabinTimer.startTimer(1 + Math.random() * 3)
    }
  } catch (err) {
    const msg = String(err)
    if (msg.includes("aborted")) useChecklistStore.getState().setExecutionState("aborted")
    else useChecklistStore.getState().setError(msg)
  } finally {
    abortController = null
  }
}

export function abortChecklist(): void {
  abortController?.abort()
  abortController = null
}
