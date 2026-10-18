import * as React from 'react'
import { Download, FileText, Loader2 } from '@/components/ui/icons'
import { toast } from 'sonner'

import { API_BASE, api, downloadFile } from '@/lib/api'
import { Button } from '@/components/ui/primitives'

/**
 * In-app view of the original resume. The file is fetched with the bearer token
 * (a plain <iframe src> could not send it), shown from a blob URL, and revoked
 * on close. Word documents cannot be rendered by a browser, so those offer the
 * download only.
 */
export function ResumeViewer({ uploadId, filename }: { uploadId: number; filename: string | null }) {
  const [url, setUrl] = React.useState<string | null>(null)
  const [kind, setKind] = React.useState<string>('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])

  // A different candidate means a different file: drop the previous one.
  React.useEffect(() => {
    setUrl(null)
    setError(null)
  }, [uploadId])

  async function open() {
    setLoading(true)
    setError(null)
    try {
      const blob = await api.uploads.file(uploadId)
      setKind(blob.type)
      setUrl(URL.createObjectURL(blob))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the resume.')
    } finally {
      setLoading(false)
    }
  }

  async function download() {
    try {
      await downloadFile(`${API_BASE}/api/uploads/${uploadId}/file`, filename ?? 'resume')
    } catch {
      toast.error('Download failed')
    }
  }

  const viewable = kind === 'application/pdf' || kind.startsWith('text/')

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Original resume
        </h3>
        <div className="ml-auto flex gap-2">
          {!url && (
            <Button variant="outline" size="sm" onClick={() => void open()} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileText aria-hidden="true" />}
              View
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => void download()}>
            <Download aria-hidden="true" /> Download
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {url && viewable && (
        <iframe
          src={url}
          title="Resume"
          className="h-[28rem] w-full rounded-md border bg-background"
        />
      )}
      {url && !viewable && (
        <p className="text-xs text-muted-foreground">
          Browsers cannot display this file type inline. Use Download to open it.
        </p>
      )}
    </section>
  )
}
