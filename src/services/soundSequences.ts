// Thousands the MD-11 packs can say: 1-15 and 20
const SPOKEN_THOUSANDS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20])

// "standard crosschecked, passing flight level 1 2 0", spelled from the digit sounds
export const buildPassingAltitudeSequence = (targetAlt: number): string[] => {
  const flightLevel = Math.round(targetAlt / 100)
    .toString()
    .padStart(3, "0")
  return ["standard_cross_checked.ogg", "passing_flight_level.ogg", ...[...flightLevel].map((d) => `${d}.ogg`)]
}

// "missed approach, 3 thousand 5 hundred feet set"; anything the packs can't say falls back to "missed approach set"
export const buildMissedApproachAltSequence = (altValue: number): string[] => {
  const fallback = ["missed_approach.ogg", "set.ogg"]
  if (!Number.isInteger(altValue / 100) || altValue <= 0) return fallback

  const thousands = Math.floor(altValue / 1000)
  const hundreds = (altValue % 1000) / 100
  const words: string[] = []

  if (thousands > 0) {
    if (!SPOKEN_THOUSANDS.has(thousands)) return fallback
    words.push(`${thousands}.ogg`, "thousand.ogg")
  }
  if (hundreds > 0) words.push(`${hundreds}.ogg`, "hundred.ogg")

  return ["missed_approach.ogg", ...words, "feet_set.ogg"]
}
