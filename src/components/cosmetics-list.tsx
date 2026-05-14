import { useCallback, useMemo, useState } from 'react'
import { Crown, Lock, LockOpen, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MetaSave } from '@/lib/meta-save'
import { useMetaSave } from '@/hooks/use-meta-save'
import {
  compareIdsByCatalog,
  displayName,
  type CosmeticInfo,
  type CosmeticsCatalog,
} from '@/lib/cosmetics-catalog'

type CosmeticsListProps = {
  metaSave: MetaSave
  catalog: CosmeticsCatalog
  onUpdateMetaSave: (next: MetaSave) => void
}

/**
 * Ring colors by rarity:
 *   0 Common    -> green
 *   1 Uncommon  -> blue
 *   2 Rare      -> purple
 *   3 Epic      -> yellow
 */
const RARITY_RING: Record<number, string> = {
  0: 'ring-green-400/70',
  1: 'ring-blue-400/70',
  2: 'ring-purple-400/80',
  3: 'ring-yellow-400/90',
}
const RARITY_TAG: Record<number, string> = {
  0: 'bg-green-600/40 text-green-100',
  1: 'bg-blue-600/40 text-blue-100',
  2: 'bg-purple-600/40 text-purple-100',
  3: 'bg-yellow-500/60 text-yellow-50',
}

function rarityRing(rarity: number | undefined) {
  if (rarity === undefined) return ''
  return RARITY_RING[rarity] ?? ''
}

function rarityTag(rarity: number | undefined) {
  if (rarity === undefined) return ''
  return RARITY_TAG[rarity] ?? ''
}

export function CosmeticsList({
  metaSave,
  catalog,
  onUpdateMetaSave,
}: CosmeticsListProps) {
  const {
    knownIds,
    isUnlocked,
    isEquipped,
    unlockedCount,
    historyCount,
    toggleUnlock,
    unlockAllKnown,
    lockAll,
    unlockByType,
    unlockByCategory,
  } = useMetaSave({ metaSave, catalog, onUpdateMetaSave })

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [onlyUnlocked, setOnlyUnlocked] = useState(false)

  /** Types available for the selected category (preserves TYPE_ORDER). */
  const typesForCategory = useMemo(() => {
    if (!categoryFilter) return catalog.types
    const allowed = new Set<string>()
    for (const c of catalog.all) {
      if (c.category === categoryFilter && c.type) allowed.add(c.type)
    }
    return catalog.types.filter((t) => allowed.has(t))
  }, [catalog.types, catalog.all, categoryFilter])

  const visibleIds = useMemo(() => {
    const trimmed = search.trim().toLowerCase()
    const filtered = knownIds.filter((id) => {
      const info = catalog.byId.get(id)
      if (categoryFilter && info?.category !== categoryFilter) return false
      if (typeFilter && info?.type !== typeFilter) return false
      if (onlyUnlocked && !isUnlocked(id)) return false
      if (trimmed.length === 0) return true
      if (String(id).includes(trimmed)) return true
      if (info?.name?.toLowerCase().includes(trimmed)) return true
      if (info?.type?.toLowerCase().includes(trimmed)) return true
      if (info?.category?.toLowerCase().includes(trimmed)) return true
      return false
    })
    // Canonical sort: type (TYPE_ORDER) > rarity desc > id
    filtered.sort((a, b) => compareIdsByCatalog(a, b, catalog))
    return filtered
  }, [
    search,
    typeFilter,
    categoryFilter,
    onlyUnlocked,
    knownIds,
    catalog,
    isUnlocked,
  ])

  const handleSelectCategory = useCallback(
    (cat: string | null) => {
      setCategoryFilter((prev) => (prev === cat ? null : cat))
      setTypeFilter(null)
    },
    [],
  )

  return (
    <section className="space-y-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Cosmetics</h2>
          <p className="text-xs text-[color:var(--color-muted)]">
            {unlockedCount} unlocked &middot; {historyCount} seen before &middot; {knownIds.length} known total
            {catalog.all.length > 0 && (
              <>
                {' '}&middot; {catalog.all.length} in game catalog
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={unlockAllKnown}
            className="flex items-center gap-1 rounded-md bg-[color:var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-primary-foreground)] hover:opacity-90"
          >
            <LockOpen className="size-3.5" />
            Unlock all
          </button>
          <button
            type="button"
            onClick={lockAll}
            className="flex items-center gap-1 rounded-md border border-[color:var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--color-surface-2)]"
          >
            <Lock className="size-3.5" />
            Lock all (keeps equipped)
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-[color:var(--color-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name"
            className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] py-1.5 pr-2 pl-7 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-[color:var(--color-muted)]">
          <input
            type="checkbox"
            checked={onlyUnlocked}
            onChange={(e) => setOnlyUnlocked(e.target.checked)}
            className="accent-[color:var(--color-primary)]"
          />
          Unlocked only
        </label>
      </div>

      {catalog.categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[color:var(--color-muted)]">Categories:</span>
          <button
            type="button"
            onClick={() => handleSelectCategory(null)}
            className={cn(
              'rounded-full border px-2 py-0.5 text-xs',
              categoryFilter === null
                ? 'border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)]'
                : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-surface-2)]',
            )}
          >
            all
          </button>
          {catalog.categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => handleSelectCategory(cat)}
              onDoubleClick={() => unlockByCategory(cat)}
              title="Click to filter; double-click to unlock everything in this category"
              className={cn(
                'rounded-full border px-2 py-0.5 text-xs',
                categoryFilter === cat
                  ? 'border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)]'
                  : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-surface-2)]',
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {typesForCategory.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[color:var(--color-muted)]">Types:</span>
          <button
            type="button"
            onClick={() => setTypeFilter(null)}
            className={cn(
              'rounded-full border px-2 py-0.5 text-xs',
              typeFilter === null
                ? 'border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)]'
                : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-surface-2)]',
            )}
          >
            all
          </button>
          {typesForCategory.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(typeFilter === t ? null : t)}
              onDoubleClick={() => unlockByType(t)}
              title="Click to filter; double-click to unlock everything of this type"
              className={cn(
                'rounded-full border px-2 py-0.5 text-xs',
                typeFilter === t
                  ? 'border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)]'
                  : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-surface-2)]',
              )}
            >
              {t}
            </button>
          ))}
          {typeFilter && (
            <button
              type="button"
              onClick={() => setTypeFilter(null)}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-[color:var(--color-muted)] hover:text-[color:var(--color-text)]"
            >
              <X className="size-3" />
              clear
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3 border-t border-[color:var(--color-border)] pt-3 text-xs text-[color:var(--color-muted)]">
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-[color:var(--color-primary)]" />
          unlocked
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]" />
          locked
        </span>
        <span className="flex items-center gap-1">
          <Crown className="size-3" />
          equipped
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-green-600/40 ring-2 ring-green-400/70" />
          common
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-blue-600/40 ring-2 ring-blue-400/70" />
          uncommon
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-purple-600/40 ring-2 ring-purple-400/80" />
          rare
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-yellow-500/60 ring-2 ring-yellow-400/90" />
          epic
        </span>
      </div>

      {visibleIds.length === 0 ? (
        <p className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted)]">
          No cosmetics match the current filter.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {visibleIds.map((id) => {
            const info: CosmeticInfo | undefined = catalog.byId.get(id)
            const unlocked = isUnlocked(id)
            const equipped = isEquipped(id)
            const name = displayName(id, catalog)
            const type = info?.type
            const hasMeta = info !== undefined
            const ringClass = rarityRing(info?.rarity)
            const tagClass = rarityTag(info?.rarity)
            const ariaTitle = hasMeta
              ? `#${id} - ${name}${type ? ` - ${type}` : ''}${
                  info?.category ? ` (${info.category})` : ''
                }${info?.rarityName ? ` - ${info.rarityName}` : ''}`
              : `#${id} (unknown - id not in catalog)`
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleUnlock(id)}
                title={ariaTitle}
                className={cn(
                  'relative flex min-h-16 flex-col items-stretch justify-between gap-1 rounded-md border p-2 text-left transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]',
                  unlocked
                    ? 'border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/20 hover:bg-[color:var(--color-primary)]/30'
                    : 'border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] opacity-80 hover:opacity-100',
                  ringClass && `ring-1 ${ringClass}`,
                )}
              >
                {equipped && (
                  <Crown className="absolute top-1.5 right-1.5 size-3 text-[color:var(--color-accent)]" />
                )}
                <span
                  className={cn(
                    'truncate text-sm leading-tight',
                    hasMeta ? 'font-medium' : 'font-mono text-[color:var(--color-muted)]',
                  )}
                >
                  {name}
                </span>
                <span className="flex items-center justify-between text-[10px] text-[color:var(--color-muted)]">
                  <span className="font-mono">#{id}</span>
                  {type && <span className="truncate">{type}</span>}
                </span>
                {info?.rarityName && info.rarity !== undefined && info.rarity > 0 && (
                  <span
                    className={cn(
                      'absolute -top-1 -left-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase shadow',
                      tagClass,
                    )}
                  >
                    {info.rarityName.slice(0, 4)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
