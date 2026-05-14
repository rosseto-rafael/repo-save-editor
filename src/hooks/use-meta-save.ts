import { useCallback, useMemo } from 'react'
import type { MetaSave } from '@/lib/meta-save'
import type { CosmeticsCatalog } from '@/lib/cosmetics-catalog'

type UseMetaSaveProps = {
  metaSave: MetaSave
  catalog: CosmeticsCatalog
  onUpdateMetaSave: (next: MetaSave) => void
}

/**
 * Hook that centralizes all MetaSave manipulation related to cosmetics.
 * All operations are immutable: they produce a new object via
 * `onUpdateMetaSave`, so the parent can detect changes with a simple
 * reference check.
 */
export function useMetaSave({
  metaSave,
  catalog,
  onUpdateMetaSave,
}: UseMetaSaveProps) {
  const unlockedSet = useMemo(
    () => new Set(metaSave.cosmeticUnlocks.value),
    [metaSave.cosmeticUnlocks.value],
  )

  const historySet = useMemo(
    () => new Set(metaSave.cosmeticHistory.value),
    [metaSave.cosmeticHistory.value],
  )

  const equippedSet = useMemo(
    () => new Set(metaSave.cosmeticEquipped.value),
    [metaSave.cosmeticEquipped.value],
  )

  /**
   * Known ids: union of history + unlocks + catalog (if the extractor produced it).
   * Ensures cosmetics the player has never seen still appear unlockable when
   * metadata exists.
   */
  const knownIds = useMemo(() => {
    const merged = new Set<number>([
      ...metaSave.cosmeticHistory.value,
      ...metaSave.cosmeticUnlocks.value,
    ])
    for (const entry of catalog.all) merged.add(entry.id)
    return [...merged].sort((a, b) => a - b)
  }, [
    metaSave.cosmeticHistory.value,
    metaSave.cosmeticUnlocks.value,
    catalog.all,
  ])

  const isUnlocked = useCallback(
    (id: number) => unlockedSet.has(id),
    [unlockedSet],
  )

  const isEquipped = useCallback(
    (id: number) => equippedSet.has(id),
    [equippedSet],
  )

  const writeUnlocks = useCallback(
    (nextUnlocks: number[], nextHistory?: number[]) => {
      const next: MetaSave = {
        ...metaSave,
        cosmeticUnlocks: {
          ...metaSave.cosmeticUnlocks,
          value: nextUnlocks,
        },
        cosmeticHistory: nextHistory
          ? { ...metaSave.cosmeticHistory, value: nextHistory }
          : metaSave.cosmeticHistory,
      }
      onUpdateMetaSave(next)
    },
    [metaSave, onUpdateMetaSave],
  )

  /**
   * Toggles unlock for one cosmetic. Also appends to history if missing so it
   * stays visible after being locked again.
   */
  const toggleUnlock = useCallback(
    (id: number) => {
      const unlocks = new Set(metaSave.cosmeticUnlocks.value)
      if (unlocks.has(id)) {
        unlocks.delete(id)
      } else {
        unlocks.add(id)
      }
      const history = historySet.has(id)
        ? metaSave.cosmeticHistory.value
        : [...metaSave.cosmeticHistory.value, id]
      writeUnlocks([...unlocks], history)
    },
    [
      metaSave.cosmeticUnlocks.value,
      metaSave.cosmeticHistory.value,
      historySet,
      writeUnlocks,
    ],
  )

  /**
   * Unlocks every id currently known (history + unlocks + catalog).
   */
  const unlockAllKnown = useCallback(() => {
    const unlocks = new Set<number>(metaSave.cosmeticUnlocks.value)
    const history = new Set<number>(metaSave.cosmeticHistory.value)
    for (const id of knownIds) {
      unlocks.add(id)
      history.add(id)
    }
    writeUnlocks([...unlocks], [...history])
  }, [
    knownIds,
    metaSave.cosmeticUnlocks.value,
    metaSave.cosmeticHistory.value,
    writeUnlocks,
  ])

  /**
   * Locks everything except equipped items. Equipped items stay unlocked to
   * avoid equipped-but-locked states that can break the in-game customization UI.
   */
  const lockAll = useCallback(() => {
    const equipped = new Set(metaSave.cosmeticEquipped.value)
    const remaining = metaSave.cosmeticUnlocks.value.filter((id) =>
      equipped.has(id),
    )
    writeUnlocks(remaining)
  }, [
    metaSave.cosmeticEquipped.value,
    metaSave.cosmeticUnlocks.value,
    writeUnlocks,
  ])

  const unlockMany = useCallback(
    (ids: Iterable<number>) => {
      const idArray = [...ids]
      if (idArray.length === 0) return
      const unlocks = new Set(metaSave.cosmeticUnlocks.value)
      const history = new Set(metaSave.cosmeticHistory.value)
      for (const id of idArray) {
        unlocks.add(id)
        history.add(id)
      }
      writeUnlocks([...unlocks], [...history])
    },
    [
      metaSave.cosmeticUnlocks.value,
      metaSave.cosmeticHistory.value,
      writeUnlocks,
    ],
  )

  /**
   * Unlocks every cosmetic of a type string, per catalog. No-op if catalog is empty.
   */
  const unlockByType = useCallback(
    (type: string) => {
      const idsOfType = catalog.all
        .filter((c) => c.type === type)
        .map((c) => c.id)
      unlockMany(idsOfType)
    },
    [catalog.all, unlockMany],
  )

  /**
   * Unlocks every cosmetic in a category (Head/Body/Arms/Legs).
   */
  const unlockByCategory = useCallback(
    (category: string) => {
      const ids = catalog.all
        .filter((c) => c.category === category)
        .map((c) => c.id)
      unlockMany(ids)
    },
    [catalog.all, unlockMany],
  )

  return {
    knownIds,
    isUnlocked,
    isEquipped,
    unlockedCount: unlockedSet.size,
    historyCount: historySet.size,
    toggleUnlock,
    unlockAllKnown,
    lockAll,
    unlockByType,
    unlockByCategory,
  }
}
