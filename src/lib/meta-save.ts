/**
 * Type definitions for the JSON payload inside `MetaSave.es3` after decryption.
 *
 * Easy Save 3 serializes collections with a string `__type` discriminator that
 * the game uses to deserialize. These fields MUST be preserved byte-for-byte on
 * round-trip or the game silently rejects the file.
 */

const INT_LIST_TYPE =
  'System.Collections.Generic.List`1[[System.Int32, mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089]],mscorlib'

const INT_LIST_LIST_TYPE =
  'System.Collections.Generic.List`1[[System.Collections.Generic.List`1[[System.Int32, mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089]], mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089]],mscorlib'

const INT_ARRAY_TYPE = 'System.Int32[],mscorlib'

export interface IntList {
  __type: string
  value: number[]
}

export interface IntListList {
  __type: string
  value: number[][]
}

export interface IntArray {
  __type: string
  value: number[]
}

export interface MetaSave {
  cosmeticTokens: IntList
  cosmeticUnlocks: IntList
  cosmeticHistory: IntList
  cosmeticEquipped: IntList
  cosmeticPresets: IntListList
  colorPresets: IntListList
  colorsEquipped: IntArray
}

/**
 * Heuristic discriminator to confirm JSON is MetaSave (not a run save).
 */
export function isMetaSave(value: unknown): value is MetaSave {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    'cosmeticUnlocks' in v &&
    'cosmeticHistory' in v &&
    'cosmeticEquipped' in v
  )
}

/**
 * Parses and validates structure. Throws a readable error if not valid MetaSave.
 */
export function parseMetaSave(decryptedJson: string): MetaSave {
  let parsed: unknown
  try {
    parsed = JSON.parse(decryptedJson)
  } catch (err) {
    throw new Error(
      `Failed to parse save JSON: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (!isMetaSave(parsed)) {
    throw new Error(
      'File does not look like MetaSave.es3 (missing cosmeticUnlocks/cosmeticHistory/cosmeticEquipped).',
    )
  }
  return parsed
}

/**
 * Serializes with 4-space indentation (format the game emits and the deprecated
 * editor validated in production).
 */
export function serializeMetaSave(meta: MetaSave): string {
  return JSON.stringify(meta, null, 4)
}

/**
 * Builds an empty MetaSave with correct `__type` values. Useful as a fallback if
 * editing before loading a file (not used by the current UI, but safe to keep).
 */
export function createEmptyMetaSave(): MetaSave {
  return {
    cosmeticTokens: { __type: INT_LIST_TYPE, value: [] },
    cosmeticUnlocks: { __type: INT_LIST_TYPE, value: [] },
    cosmeticHistory: { __type: INT_LIST_TYPE, value: [] },
    cosmeticEquipped: { __type: INT_LIST_TYPE, value: [] },
    cosmeticPresets: { __type: INT_LIST_LIST_TYPE, value: [] },
    colorPresets: { __type: INT_LIST_LIST_TYPE, value: [] },
    colorsEquipped: { __type: INT_ARRAY_TYPE, value: [] },
  }
}
