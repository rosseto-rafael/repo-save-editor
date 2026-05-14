/**
 * Cosmetics catalog produced by the Python extractor in
 * `tools/extract-cosmetics/extract.py`. The `public/cosmetics.json` file is
 * served as a static asset and loaded once when the app opens.
 *
 * Format: array of entries with numeric `id` (= id stored in the save),
 * `name`, `type`, `category`, `rarity`, etc. When missing, the UI falls back to
 * `#<id>`.
 */

export type CosmeticRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Unknown'

export interface CosmeticInfo {
  id: number
  name?: string
  /** Short name, e.g. "Wizard Hat". */
  assetName?: string
  /** Full ScriptableObject name, e.g. "Cosmetic - Head Top - Wizard Hat". */
  fullName?: string
  /** Display type, e.g. "Hat", "Arm Left". */
  type?: string
  /** Internal numeric type index (from CosmeticTypeAsset.type). */
  typeInt?: number
  rarity?: number
  rarityName?: CosmeticRarity
  /** "Head", "Arms", "Body", "Legs". */
  category?: string
  tintable?: boolean
}

/** Localized Menu TSV entry (reference / future i18n only). */
export interface CosmeticType {
  key: string
  name: string
}

/** Rich type: from extractor + Assembly-CSharp typetree. */
export interface CosmeticTypeEntry {
  /** Internal int from CosmeticTypeAsset. */
  type: number
  /** Display name, e.g. "Hat", "Arm Left". */
  name: string
  /** Parent category, e.g. "Head", "Body". */
  category?: string
  canEquipMultiple?: boolean
}

export interface CosmeticsCatalog {
  byId: Map<number, CosmeticInfo>
  types: string[]
  typeCatalog: CosmeticType[]
  typeEntries: CosmeticTypeEntry[]
  categories: string[]
  all: CosmeticInfo[]
}

export const EMPTY_CATALOG: CosmeticsCatalog = {
  byId: new Map(),
  types: [],
  typeCatalog: [],
  typeEntries: [],
  categories: [],
  all: [],
}

/** Canonical category order in the UI. */
const CATEGORY_ORDER = ['Head', 'Body', 'Arms', 'Legs']

/**
 * Canonical display order for types. Defined so cosmetics appear in a
 * "natural" order (top-down, related body parts together). Types not listed
 * here sort last, alphabetically.
 */
export const TYPE_ORDER: readonly string[] = [
  'Head Top',
  'Head Bottom',
  'Head Top Overlay',
  'Head Bottom Overlay',
  'Hat',
  'Headwear Bottom',
  'Eyewear',
  'Ears',
  'Face Upper',
  'Face Lower',
  'Eye Lid Right',
  'Eye Lid Left',
  'Body Top',
  'Body Bottom',
  'Body Top Overlay',
  'Body Bottom Overlay',
  'Bodywear Top',
  'Bodywear Bottom',
  'Arm Right',
  'Arm Left',
  'Arm Right Overlay',
  'Arm Left Overlay',
  'Armwear Right',
  'Armwear Left',
  'Grabber',
  'Leg Right',
  'Leg Left',
  'Leg Right Overlay',
  'Leg Left Overlay',
  'Legwear Right',
  'Legwear Left',
  'Foot Right',
  'Foot Left',
]

const TYPE_RANK = new Map(
  TYPE_ORDER.map((t, i) => [t.toLowerCase(), i] as const),
)

function typeRank(type: string | undefined): number {
  if (!type) return Number.MAX_SAFE_INTEGER
  return TYPE_RANK.get(type.toLowerCase()) ?? Number.MAX_SAFE_INTEGER
}

/**
 * Canonical comparator: type (TYPE_ORDER) > rarity (desc) > id.
 * Items without metadata sort last by id.
 */
export function compareCosmetics(
  a: CosmeticInfo | undefined,
  b: CosmeticInfo | undefined,
): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  const ta = typeRank(a.type)
  const tb = typeRank(b.type)
  if (ta !== tb) return ta - tb
  if (ta === Number.MAX_SAFE_INTEGER) {
    // Both unknown (or missing) type: fall back to alphabetical type string
    const sa = (a.type ?? '').toLowerCase()
    const sb = (b.type ?? '').toLowerCase()
    if (sa !== sb) return sa < sb ? -1 : 1
  }
  // Rarity DESC (Epic > Rare > Uncommon > Common); missing = last
  const ra = a.rarity ?? -1
  const rb = b.rarity ?? -1
  if (ra !== rb) return rb - ra
  return a.id - b.id
}

/** Id-based version: used by the filtered list in the UI. */
export function compareIdsByCatalog(
  a: number,
  b: number,
  catalog: CosmeticsCatalog,
): number {
  const cmp = compareCosmetics(catalog.byId.get(a), catalog.byId.get(b))
  if (cmp !== 0) return cmp
  return a - b
}

function buildCatalog(
  items: CosmeticInfo[],
  typeCatalog: CosmeticType[],
  typeEntries: CosmeticTypeEntry[],
): CosmeticsCatalog {
  const byId = new Map<number, CosmeticInfo>()
  const typeSet = new Set<string>()
  const categorySet = new Set<string>()
  for (const item of items) {
    if (typeof item.id !== 'number' || !Number.isFinite(item.id)) continue
    byId.set(item.id, item)
    if (item.type) typeSet.add(item.type)
    if (item.category) categorySet.add(item.category)
  }
  for (const t of typeEntries) {
    if (t.name) typeSet.add(t.name)
    if (t.category) categorySet.add(t.category)
  }
  // typeCatalog (from TSV) mixes TYPE.* and CATEGORY.* + extras like
  // "Presets" -- we do not merge into typeSet to avoid polluting UI chips
  // with names that are really categories. The original array is kept for
  // possible future i18n.

  const types = [...typeSet].sort((a, b) => {
    const ra = typeRank(a)
    const rb = typeRank(b)
    if (ra !== rb) return ra - rb
    return a.localeCompare(b)
  })

  const categories = [...categorySet].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a)
    const bi = CATEGORY_ORDER.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })

  return {
    byId,
    types,
    typeCatalog,
    typeEntries,
    categories,
    all: items.slice().sort(compareCosmetics),
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: 'no-cache' })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

/**
 * Loads catalog JSON files (served as static assets by Vite). Always returns a
 * valid catalog; on 404 or malformed JSON, returns an empty catalog without
 * throwing. This keeps the app usable without those files (UI shows ids only).
 */
export async function loadCosmeticsCatalog(): Promise<CosmeticsCatalog> {
  const [items, types, typeEntries] = await Promise.all([
    fetchJson<CosmeticInfo[]>('cosmetics.json'),
    fetchJson<CosmeticType[]>('cosmetic-types.json'),
    fetchJson<CosmeticTypeEntry[]>('cosmetic-type-catalog.json'),
  ])
  if (!Array.isArray(items) && !Array.isArray(types) && !Array.isArray(typeEntries)) {
    return EMPTY_CATALOG
  }
  return buildCatalog(
    Array.isArray(items) ? items : [],
    Array.isArray(types) ? types : [],
    Array.isArray(typeEntries) ? typeEntries : [],
  )
}

/** Human-readable name or `#<id>` fallback. */
export function displayName(id: number, catalog: CosmeticsCatalog): string {
  return catalog.byId.get(id)?.name ?? `#${id}`
}

/** Type (e.g. "Hat") or undefined if unknown. */
export function displayType(id: number, catalog: CosmeticsCatalog): string | undefined {
  return catalog.byId.get(id)?.type
}
