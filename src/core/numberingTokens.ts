/**
 * Auto Heading — Numbering Token System
 *
 * Defines the types and arithmetic for heading number tokens.
 * Supports Arabic (1,2,3), uppercase/lowercase letters (A,B,C / a,b,c),
 * and uppercase/lowercase Roman numerals (I,II,III / i,ii,iii).
 */

// ─── Roman Numeral Helpers (self-contained, no external dependency) ───

const ROMAN_VALUES: [string, number][] = [
  ['M', 1000], ['CM', 900], ['D', 500], ['CD', 400],
  ['C', 100], ['XC', 90], ['L', 50], ['XL', 40],
  ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1],
]

export function toRoman(num: number): string {
  if (num <= 0) return '0'
  let result = ''
  for (const [letter, value] of ROMAN_VALUES) {
    while (num >= value) {
      result += letter
      num -= value
    }
  }
  return result
}

export function fromRoman(roman: string): number {
  if (roman === '0') return 0
  const upper = roman.toUpperCase()
  let result = 0
  let i = 0
  for (const [letter, value] of ROMAN_VALUES) {
    while (upper.substring(i, i + letter.length) === letter) {
      result += value
      i += letter.length
    }
  }
  return result
}

// ─── Numbering Styles ─────────────────────────────────────────────────

/** All supported numbering styles */
export type NumberingStyle = '1' | 'A' | 'a' | 'I' | 'i'

/** A single numbering token with its style and value */
export type NumberingToken = {
  style: NumberingStyle
  value: number // internally always stored as a number (1-based for display)
}

/** Check if a string is a valid numbering style */
export function isValidNumberingStyle(s: string): s is NumberingStyle {
  return s === '1' || s === 'A' || s === 'a' || s === 'I' || s === 'i'
}

// ─── Token Display ────────────────────────────────────────────────────

/** Convert a token to its printable string representation */
export function tokenToString(token: NumberingToken): string {
  switch (token.style) {
    case '1':
      return token.value.toString()
    case 'A':
      return numberToUpperLetter(token.value)
    case 'a':
      return numberToLowerLetter(token.value)
    case 'I':
      return toRoman(token.value)
    case 'i':
      return toRoman(token.value).toLowerCase()
  }
}

function numberToUpperLetter(n: number): string {
  if (n <= 0) return ''
  if (n <= 26) return String.fromCharCode(64 + n) // A=1, B=2, ...
  // For values > 26: AA, AB, etc.
  const remainder = ((n - 1) % 26) + 1
  const prefix = Math.floor((n - 1) / 26)
  return (prefix > 0 ? numberToUpperLetter(prefix) : '') + String.fromCharCode(64 + remainder)
}

function numberToLowerLetter(n: number): string {
  return numberToUpperLetter(n).toLowerCase()
}

// ─── Token Arithmetic ─────────────────────────────────────────────────

/** Create a token at value=1 for the given style */
export function firstToken(style: NumberingStyle): NumberingToken {
  return { style, value: 1 }
}

/** Create a token at value=0 (the "zeroth" — used internally before first increment) */
export function zerothToken(style: NumberingStyle): NumberingToken {
  return { style, value: 0 }
}

/** Advance a token by 1 */
export function nextToken(token: NumberingToken): NumberingToken {
  return { style: token.style, value: token.value + 1 }
}

/** Create a zeroth token that, when next() is called, produces the desired startAt value */
export function startAtToken(startAt: string, style: NumberingStyle): NumberingToken {
  const parsed = parseStartAt(startAt, style)
  // Return value - 1 so that the first nextToken() call yields the desired start
  return { style, value: parsed - 1 }
}

/** Parse a start-at string into a numeric value for the given style */
function parseStartAt(startAt: string, style: NumberingStyle): number {
  if (!startAt || startAt.trim() === '') return 1

  const trimmed = startAt.trim()

  switch (style) {
    case '1': {
      const n = parseInt(trimmed, 10)
      return isNaN(n) || n < 1 ? 1 : n
    }
    case 'A': {
      if (/^[A-Z]+$/.test(trimmed)) {
        return upperLetterToNumber(trimmed)
      }
      return 1
    }
    case 'a': {
      if (/^[a-z]+$/.test(trimmed)) {
        return upperLetterToNumber(trimmed.toUpperCase())
      }
      return 1
    }
    case 'I': {
      if (/^[IVXLCDM]+$/i.test(trimmed)) {
        const val = fromRoman(trimmed.toUpperCase())
        return val > 0 ? val : 1
      }
      return 1
    }
    case 'i': {
      if (/^[ivxlcdm]+$/i.test(trimmed)) {
        const val = fromRoman(trimmed.toUpperCase())
        return val > 0 ? val : 1
      }
      return 1
    }
  }
}

function upperLetterToNumber(s: string): number {
  let result = 0
  for (let i = 0; i < s.length; i++) {
    result = result * 26 + (s.charCodeAt(i) - 64)
  }
  return result
}

// ─── Numbering String Builder ─────────────────────────────────────────

/**
 * Build a display string from a stack of tokens.
 * Example: [1, 2, 3] with dot separator → "1.2.3"
 */
export function makeNumberingString(stack: NumberingToken[], levelSeparator = '.'): string {
  return stack.map(t => tokenToString(t)).join(levelSeparator)
}
