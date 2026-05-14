import { useCallback, useRef, useState, type DragEvent } from 'react'
import { Upload, FileWarning, FolderOpen, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type UploadFileProps = {
  onFileLoaded: (bytes: Uint8Array, fileName: string) => void
  onError: (message: string) => void
}

const ACCEPTED_EXT = '.es3'
const META_SAVE_PATH = String.raw`%USERPROFILE%\AppData\LocalLow\semiwork\Repo\MetaSave.es3`

async function readFileAsBytes(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer()
  return new Uint8Array(buffer)
}

export function UploadFile({ onFileLoaded, onError }: UploadFileProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [pathCopied, setPathCopied] = useState(false)

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(ACCEPTED_EXT)) {
        onError(`Invalid file: extension must be ${ACCEPTED_EXT}`)
        return
      }
      try {
        const bytes = await readFileAsBytes(file)
        onFileLoaded(bytes, file.name)
      } catch (err) {
        onError(
          `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    },
    [onError, onFileLoaded],
  )

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setDragging(false)
      const file = event.dataTransfer.files?.[0]
      if (!file) return
      void handleFile(file)
    },
    [handleFile],
  )

  const onSelectClick = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const onCopyPath = useCallback(() => {
    void navigator.clipboard.writeText(META_SAVE_PATH).then(() => {
      setPathCopied(true)
      setTimeout(() => setPathCopied(false), 1500)
    })
  }, [])

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          e.target.value = ''
        }}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={onSelectClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onSelectClick()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]',
          dragging
            ? 'border-[color:var(--color-primary)] bg-[color:var(--color-surface-2)]'
            : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-surface)]',
        )}
      >
        <Upload className="size-8 text-[color:var(--color-muted)]" />
        <p className="text-sm font-medium">
          Drag your <code className="font-mono text-[color:var(--color-primary)]">MetaSave.es3</code> here
        </p>
        <p className="text-xs text-[color:var(--color-muted)]">or click to select</p>
      </div>
      <div className="space-y-2 text-xs">
        <p className="flex items-center gap-1 text-[color:var(--color-muted)]">
          <FolderOpen className="size-3" />
          Where to find the file:
        </p>
        <div className="relative rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface)] py-2 pr-9 pl-3 font-mono break-all">
          {META_SAVE_PATH}
          <button
            type="button"
            onClick={onCopyPath}
            title="Copy"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 hover:bg-[color:var(--color-surface-2)]"
          >
            {pathCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </button>
        </div>
        <p className="flex items-start gap-1 text-[color:var(--color-muted)]">
          <FileWarning className="mt-0.5 size-3 shrink-0" />
          Back up the original file before editing.
        </p>
      </div>
    </div>
  )
}
