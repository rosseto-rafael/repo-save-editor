import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Download, RotateCcw } from 'lucide-react'
import { UploadFile } from './components/upload-file'
import { CosmeticsList } from './components/cosmetics-list'
import { decryptEs3, encryptEs3 } from './lib/es3-crypto'
import {
  parseMetaSave,
  serializeMetaSave,
  type MetaSave,
} from './lib/meta-save'
import {
  EMPTY_CATALOG,
  loadCosmeticsCatalog,
  type CosmeticsCatalog,
} from './lib/cosmetics-catalog'

type LoadedFile = {
  fileName: string
  meta: MetaSave
}

export default function App() {
  const [loaded, setLoaded] = useState<LoadedFile | null>(null)
  const [catalog, setCatalog] = useState<CosmeticsCatalog>(EMPTY_CATALOG)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadCosmeticsCatalog().then((c) => {
      if (!cancelled) setCatalog(c)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleFileLoaded = useCallback(
    async (bytes: Uint8Array, fileName: string) => {
      setError(null)
      setBusy(true)
      try {
        const decrypted = await decryptEs3(bytes)
        const meta = parseMetaSave(decrypted)
        setLoaded({ fileName, meta })
        setDirty(false)
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : `Failed to load save: ${String(err)}`,
        )
        setLoaded(null)
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const handleMetaUpdate = useCallback((next: MetaSave) => {
    setLoaded((prev) => (prev ? { ...prev, meta: next } : prev))
    setDirty(true)
  }, [])

  const handleDownload = useCallback(async () => {
    if (!loaded) return
    setBusy(true)
    try {
      const json = serializeMetaSave(loaded.meta)
      const encrypted = await encryptEs3(json)
      const blob = new Blob([encrypted as BlobPart], {
        type: 'application/octet-stream',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = loaded.fileName || 'MetaSave.es3'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setDirty(false)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Failed to generate file: ${String(err)}`,
      )
    } finally {
      setBusy(false)
    }
  }, [loaded])

  const handleReset = useCallback(() => {
    setLoaded(null)
    setError(null)
    setDirty(false)
  }, [])

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[color:var(--color-border)] pb-4">
        <div>
          <h1 className="text-2xl font-semibold">
            REPO Cosmetics Save Editor
          </h1>
          <p className="text-sm text-[color:var(--color-muted)]">
            Edit cosmetics in the R.E.P.O game <code className="font-mono">MetaSave.es3</code>. Everything runs in your browser; no files are uploaded to any server.
          </p>
        </div>
        {loaded && (
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 rounded-md border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-surface)]"
          >
            <RotateCcw className="size-3.5" />
            Change file
          </button>
        )}
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-[color:var(--color-danger)] bg-[color:var(--color-danger)]/10 p-3 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-[color:var(--color-danger)]" />
          <p className="break-words">{error}</p>
        </div>
      )}

      {!loaded ? (
        <section className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
          <UploadFile onFileLoaded={handleFileLoaded} onError={setError} />
          {busy && (
            <p className="mt-3 text-xs text-[color:var(--color-muted)]">Processing...</p>
          )}
        </section>
      ) : (
        <>
          <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
            <div className="text-sm">
              <p>
                File: <code className="font-mono text-[color:var(--color-primary)]">{loaded.fileName}</code>
                {dirty && (
                  <span className="ml-2 rounded bg-[color:var(--color-accent)]/20 px-1.5 py-0.5 text-xs text-[color:var(--color-accent)]">
                    unsaved
                  </span>
                )}
              </p>
              <p className="text-xs text-[color:var(--color-muted)]">
                Equipped: {loaded.meta.cosmeticEquipped.value.join(', ') || 'none'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              disabled={busy}
              className="flex items-center gap-1 rounded-md bg-[color:var(--color-primary)] px-4 py-2 text-sm font-medium text-[color:var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-40"
            >
              <Download className="size-4" />
              Download MetaSave.es3
            </button>
          </section>

          <CosmeticsList
            metaSave={loaded.meta}
            catalog={catalog}
            onUpdateMetaSave={handleMetaUpdate}
          />
        </>
      )}

      <footer className="mt-auto border-t border-[color:var(--color-border)] pt-4 text-xs text-[color:var(--color-muted)]">
        <p>
          Back up your <code className="font-mono">MetaSave.es3</code> before applying changes. The game silently rejects malformed files.
        </p>
      </footer>
    </div>
  )
}
