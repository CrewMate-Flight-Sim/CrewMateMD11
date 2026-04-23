import { listen } from "@tauri-apps/api/event"

import { simvarGet } from "@/API/simvarApi"
import { getMd11Variant } from "@/hooks/useMD11variant"
import { getChecklistById } from "@/services/checklistLoader"
import { isSoundPlaying, playSound, playSoundSequence } from "@/services/playSounds"
import { useCabinReadyTimerStore } from "@/store/cabinReadyTimerStore"
import { useChecklistStore } from "@/store/checklistStore"
import { usePerformanceStore } from "@/store/performanceStore"
import { useSettingsStore } from "@/store/settingsStore"
import { useVoiceHintProgressStore } from "@/store/voiceHintProgressStore"
import type { Check, ChecklistItem, ValidationRule } from "@/types/checklist"

import { vars, getTemplateVars } from "./flowLoader"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Block until no sound is playing */
const wsf = async () => {
  while (await isSoundPlaying()) await sleep(100)
}
/** Throw if the checklist was aborted */
const checkAbort = (s: AbortSignal) => {
  if (s.aborted) throw new Error("Checklist aborted")
}

/** Resolves with the next recognised speech string, or null on abort */
async function waitForSpeechResponse(signal: AbortSignal): Promise<string | null> {
  if (signal.aborted) return null
  return new Promise<string | null>((resolve) => {
    let unlistenFn: (() => void) | null = null
    let resolved = false
    const done = (v: string | null) => {
      if (resolved) return
      resolved = true
      unlistenFn?.()
      resolve(v)
    }
    signal.addEventListener("abort", () => done(null), { once: true })
    listen<{ text?: string; type?: string }>("speech_recognized", (e) => {
      if (e.payload?.type === "speech_unrecognized") return
      const text = e.payload?.text?.trim().toLowerCase()
      if (text) done(text)
    }).then((fn) => {
      unlistenFn = fn
      if (signal.aborted) done(null)
    })
  })
}

// ─── Response matching ────────────────────────────────────────────────────────

const NUM_WORD = `(?:zero|one|two|three|four|five|six|seven|eight|nine|niner|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)`
const NUM_RE = new RegExp(`\\b${NUM_WORD}(?:[\\s-]+${NUM_WORD}){0,3}\\b`, "i")

/**
 * Returns true if `spoken` satisfies the response token pattern.
 * Special tokens: `*` = any, `#2/#3/#4` = 2/3/4-digit number or spoken equivalent.
 */
function matchesResponse(spoken: string, response: string): boolean {
  if (response === "*") return true
  const input = spoken.toLowerCase()
  for (const token of response.toLowerCase().split(/\s+/)) {
    if (token === "#2" && !/\b\d{2}\b/.test(spoken) && !NUM_RE.test(input)) return false
    else if (token === "#3" && !/\b\d{3}\b/.test(spoken)) return false
    else if (token === "#4" && !/\b\d{4}\b/.test(spoken)) return false
    else if (!["#2", "#3", "#4"].includes(token) && !input.includes(token)) return false
  }
  return true
}

/** Returns true if `spoken` matches any token in `responses` */
const matchesAny = (spoken: string, responses: string[]) => responses.some((r) => matchesResponse(spoken, r))

// ─── Store / SimVar helpers ───────────────────────────────────────────────────

/** Read a dotted path from the performance store, e.g. "takeoff.v1" */
function getStoreValue(storePath: string): string | undefined {
  const state = usePerformanceStore.getState() as unknown as Record<string, Record<string, string>>
  const [section, key] = storePath.split(".")
  return state[section]?.[key]
}

/** Read a SimConnect expression with up to 5 retries, returns null on failure */
async function readSimVar(expression: string): Promise<number | null> {
  for (let i = 0; i < 5; i++) {
    try {
      const v = await simvarGet(expression)
      if (v !== null) {
        console.log(`[ChecklistRunner] readSimVar("${expression}") → ${v}${i > 0 ? ` (attempt ${i + 1})` : ""}`)
        return v
      }
    } catch (err) {
      console.warn(`[ChecklistRunner] Failed to read simvar "${expression}":`, err)
      return null
    }
    await sleep(150)
  }
  console.warn(`[ChecklistRunner] readSimVar("${expression}") → null after retries`)
  return null
}

// ─── Core check runner ────────────────────────────────────────────────────────

/**
 * Evaluates a list of checks sequentially.
 * Supports `any` (OR group), `simvar` (SimConnect comparison), and `store` (perf store equality).
 * Returns false as soon as any check fails.
 */
async function runChecks(checks: Check[], signal: AbortSignal): Promise<boolean> {
  for (const check of checks) {
    let pass = false

    if (check.type === "any") {
      for (const group of check.groups ?? []) {
        if (await runChecks(group, signal)) {
          pass = true
          break
        }
      }
    }

    if (check.type === "simvar") {
      const raw = await readSimVar(check.var!)
      checkAbort(signal)
      let expected: number | null = null
      if (typeof check.expected === "boolean") expected = check.expected ? 1 : 0
      else if (typeof check.expected === "number") expected = check.expected
      else if (typeof check.expected === "string") {
        // Resolve template vars like {flaps}, {flapsefb}
        const n = parseFloat(check.expected.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ""))
        expected = isNaN(n) ? null : n
      } else if (typeof check.expected === "object" && check.expected !== null) {
        const s = getStoreValue(check.expected.store)
        if (s !== undefined) {
          const n = parseFloat(s)
          expected = isNaN(n) ? null : n
        }
      }
      if (typeof check.expected === "boolean") {
        const b = raw !== null ? (raw > 0.5 ? 1 : 0) : null
        pass = b !== null && expected !== null && b === expected
      } else {
        pass = raw !== null && expected !== null && Math.abs(raw - expected) < 0.5
      }
    }

    if (check.type === "store") pass = getStoreValue(check.store!) === check.equals
    if (!pass) return false
  }
  return true
}

/**
 * Finds the first validation rule whose `when` condition and checks all pass.
 * Prefers the longest response token match; falls back to `always`/`store` rules for silent mode.
 */
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
  if (bestMatch) return (await runChecks(bestMatch.checks ?? [], signal)) ? bestMatch : null

  // No speech match — try always/store-conditional rules (silent mode fallback)
  for (const rule of validations) {
    const { when: w } = rule
    const met = (w.store && getStoreValue(w.store.path) === w.store.equals) || w.always === true
    if (met && (await runChecks(rule.checks ?? [], signal))) return rule
  }
  return null
}

// ─── Item execution ───────────────────────────────────────────────────────────

let abortController: AbortController | null = null

/**
 * Executes a single checklist item. Handles four cases:
 * 1. No challenge — auto-check only (waits for SimVar/store condition)
 * 2. Cargo skip — item is irrelevant for the freighter variant
 * 3. FO-only — challenge plays, no speech expected from pilot
 * 4. Normal — challenge + pilot speech + optional validation/confirmation sounds
 */
async function executeNormalItem(item: ChecklistItem, index: number, signal: AbortSignal): Promise<void> {
  const { setStepStatus } = useChecklistStore.getState()
  setStepStatus(index, "active")
  let responsePlayed = false

  // 1. Auto-check (no audible challenge)
  if (!item.challenge) {
    if (item.validations?.length) {
      while (true) {
        checkAbort(signal)
        if (await findPassingRule(item.validations, "", signal)) break
        if (item.incorrect) {
          await wsf()
          await playSound(item.incorrect)
          await wsf()
        }
        await sleep(2000)
      }
    }
    if (item.delay_ms) await sleep(item.delay_ms) // ← add this
    setStepStatus(index, "complete")
    return
  }

  // 2. Cargo skip
  if (getMd11Variant() === "cargo" && item.cargo_skip) {
    setStepStatus(index, "complete")
    return
  }

  // 3. FO-only (challenge plays, FO responds autonomously)
  if (item.fo_only_response) {
    await wsf()
    await playSound(item.challenge)
    await wsf()
    if (item.validations?.length) {
      while (true) {
        checkAbort(signal)
        const rule = await findPassingRule(item.validations, "", signal)
        if (rule) {
          if (rule.copilot_response) {
            await playSound(rule.copilot_response)
            await wsf()
            responsePlayed = true
          }
          break
        }
        await playSound(item.incorrect ?? "are_you_sure.ogg")
        await wsf()
        await sleep(2000)
      }
    }
    if (!responsePlayed && item.copilot_response) {
      await playSound(item.copilot_response)
      await wsf()
    }
    setStepStatus(index, "complete")
    return
  }

  // 4. Normal flow — challenge, wait for pilot speech, validate
  const responseList = item.response ?? []
  const hold = () => useSettingsStore.getState().holdOnIncorrect

  while (true) {
    checkAbort(signal)
    await wsf()
    await playSound(item.challenge)
    await wsf()

    // Wait for a speech response that matches the expected token list
    let spoken: string | null = null
    while (true) {
      spoken = await waitForSpeechResponse(signal)
      if (spoken === null) return
      if (!responseList.length || matchesAny(spoken, responseList)) break
    }

    const s = spoken!
    checkAbort(signal)

    // Run validation rules if present
    if (item.validations?.length) {
      const rule = await findPassingRule(item.validations, s, signal)
      if (!rule) {
        await playSound(item.incorrect ?? "are_you_sure.ogg")
        await wsf()
        if (hold()) continue
        else break
      }
      if (rule.copilot_response) {
        await playSound(rule.copilot_response)
        await wsf()
        responsePlayed = true
      }
      break
    }

    // Flaps readback
    if (item.flaps_confirmation) {
      const flapValue = vars["flapsefb"]
      if (flapValue) {
        await playSound(`flaps_${flapValue}.ogg`)
        await wsf()
        responsePlayed = true
      }
    }

    // Trim readback — converts raw LVAR to units and spells out digits
    if (item.trim_confirmation) {
      const rawTrim = (await readSimVar("(L:MD11_EXT_STAB_TRIM)")) ?? 0
      const units = Math.max(0, Number(rawTrim) * 0.165 - 1.0).toFixed(1)
      await playSoundSequence([...units.split("").map((d) => (d === "." ? "point.ogg" : `${d}.ogg`)), "units_set.ogg"])
      await wsf()
    }

    // Autobrake readback
    if (item.abrk_confirmation) {
      const raw = (await simvarGet("(L:MD11_CTR_AUTOBRAKE_SW)")) ?? 0
      const file = ({ 2: "min.ogg", 3: "med.ogg", 4: "max.ogg" } as Record<number, string>)[Math.round(Number(raw))]
      if (file) {
        await playSoundSequence(["set.ogg", file])
        await wsf()
      }
    }

    break
  }

  // Fallback copilot response if nothing else played one
  if (!responsePlayed && item.copilot_response) {
    await wsf()
    await playSound(item.copilot_response)
    await wsf()
  }
  setStepStatus(index, "complete")
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Checklists blocked while the cabin ready timer is running */
const BLOCKED_CHECKLISTS = new Set(["taxi", "before_takeoff"])

/** Load and run a checklist by ID. Aborts any currently running checklist first. */
export async function executeChecklist(checklistId: string): Promise<void> {
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
    await wsf()
    await playSound(checklist.completion)
    await wsf()
    useChecklistStore.getState().setExecutionState("completed")
    useVoiceHintProgressStore.getState().recordChecklistCompleted(checklist.id)

    // Start cabin ready timer after before_start checklist
    if (checklistId === "after_start" && getMd11Variant() === "passenger") {
      // Shorten the timer slightly because they've been working during engine start
      const duration = 1 + Math.random() * 3
      cabinTimer.startTimer(duration)
      console.log(`[CabinReadyTimer] Final walk-through in progress...`)
    }
  } catch (err) {
    const msg = String(err)
    if (msg.includes("aborted")) useChecklistStore.getState().setExecutionState("aborted")
    else useChecklistStore.getState().setError(msg)
  } finally {
    abortController = null
  }
}

/** Abort the currently running checklist, if any */
export function abortChecklist(): void {
  abortController?.abort()
  abortController = null
}
