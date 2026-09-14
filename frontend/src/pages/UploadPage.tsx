import * as React from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  CloudUpload,
  Copy,
  FileText,
  Loader2,
  RefreshCw,
  Radio,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { cn, formatBytes, formatRelative } from '@/lib/utils'
import { useAuth } from '@/hooks/providers'
import { useUploadStream } from '@/hooks/useUploadStream'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Progress,
  Tooltip,
} from '@/components/ui/primitives'
import { PageBody, PageHeader } from '@/components/app/shared'
import type { ProcessingStatus, Upload } from '@/types'

const ACCEPTED = '.pdf,.docx,.txt'
const MAX_BYTES = 10 * 1024 * 1024

const STATUS_LABEL: Record<ProcessingStatus, string> = {
  queued: 'Queued',
  extracting: 'Reading document',
  parsing: 'Extracting details',
  embedding: 'Building semantic index',
  done: 'Done',
  failed: 'Failed',
}

export function UploadPage() {
  const { isStaff } = useAuth()
  const queryClient = useQueryClient()
  const [dragActive, setDragActive] = React.useState(false)
  const [rejected, setRejected] = React.useState<{ name: string; reason: string }[]>([])
  const inputRef = React.useRef<HTMLInputElement>(null)

  const { connected, events } = useUploadStream(true)

  const { data: uploads = [], isLoading } = useQuery({
    queryKey: ['uploads'],
    queryFn: () => api.uploads.list(40),
  })

  const upload = useMutation({
    mutationFn: (files: File[]) => api.uploads.create(files),
    onSuccess: (created) => {
      const queued = created.filter((item) => item.status === 'queued').length
      const failed = created.length - queued
      if (queued) toast.success(`${queued} file${queued === 1 ? '' : 's'} queued for processing`)
      if (failed) toast.error(`${failed} file${failed === 1 ? '' : 's'} were rejected`)
      queryClient.invalidateQueries({ queryKey: ['uploads'] })
    },
    onError: (error: Error) => toast.error('Upload failed', { description: error.message }),
  })

  const retry = useMutation({
    mutationFn: (id: number) => api.uploads.retry(id),
    onSuccess: () => {
      toast.success('Retrying')
      queryClient.invalidateQueries({ queryKey: ['uploads'] })
    },
    onError: (error: Error) => toast.error('Could not retry', { description: error.message }),
  })

  function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return
    const files: File[] = []
    const bad: { name: string; reason: string }[] = []

    Array.from(fileList).forEach((file) => {
      const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
      if (!ACCEPTED.split(',').includes(extension)) {
        bad.push({
          name: file.name,
          reason:
            extension === '.doc' || extension === '.rtf'
              ? 'Legacy format — re-save as PDF or DOCX.'
              : `${extension} is not supported. Use PDF, DOCX or TXT.`,
        })
      } else if (file.size > MAX_BYTES) {
        bad.push({ name: file.name, reason: `${formatBytes(file.size)} exceeds the 10 MB limit.` })
      } else {
        files.push(file)
      }
    })

    setRejected(bad)
    if (files.length) upload.mutate(files)
  }

  // Merge live SSE state over the fetched list so rows update mid-flight.
  const rows = uploads.map((item) => {
    const live = events[item.id]
    return live
      ? {
          ...item,
          status: live.status,
          progress: live.progress,
          error_message: live.error ?? item.error_message,
          candidate_id: live.candidate_id ?? item.candidate_id,
          is_duplicate: live.is_duplicate,
        }
      : item
  })

  const active = rows.filter((row) => !['done', 'failed'].includes(row.status))

  return (
    <>
      <PageHeader
        title="Upload resumes"
        description={
          isStaff
            ? 'Drop a batch of resumes — each one is parsed, scored against every open role, and added to the pipeline automatically.'
            : 'Upload your resume to see exactly how an applicant tracking system reads it.'
        }
        actions={
          <Tooltip
            content={
              connected
                ? 'Live progress connected.'
                : 'Live progress disconnected — reconnecting automatically.'
            }
          >
            <Badge variant={connected ? 'success' : 'warning'} className="cursor-help">
              {connected ? (
                <Wifi className="size-3" aria-hidden="true" />
              ) : (
                <WifiOff className="size-3" aria-hidden="true" />
              )}
              {connected ? 'Live' : 'Reconnecting'}
            </Badge>
          </Tooltip>
        }
      />

      <PageBody className="mx-auto max-w-4xl">
        {/* Dropzone */}
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragActive(false)
            handleFiles(event.dataTransfer.files)
          }}
          className={cn(
            'rounded-lg border-2 border-dashed p-8 text-center transition-colors',
            dragActive ? 'border-primary bg-primary/5' : 'border-border bg-card',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED}
            className="sr-only"
            onChange={(event) => {
              handleFiles(event.target.files)
              event.target.value = ''
            }}
            aria-label="Choose resume files"
          />
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <CloudUpload className="size-6 text-primary" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold">
            Drag resumes here, or{' '}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="cursor-pointer text-primary underline underline-offset-2 hover:no-underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              browse your files
            </button>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            PDF, DOCX or TXT · up to 10 MB each · up to 50 files at a time
          </p>
          {upload.isPending && (
            <p className="mt-3 flex items-center justify-center gap-2 text-xs font-medium text-primary">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Uploading…
            </p>
          )}
        </div>

        {/* Client-side rejections */}
        {rejected.length > 0 && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm"
          >
            <p className="mb-1 font-semibold text-destructive">
              {rejected.length} file{rejected.length === 1 ? '' : 's'} were not uploaded
            </p>
            <ul className="space-y-0.5 text-xs text-destructive">
              {rejected.map((item) => (
                <li key={item.name}>
                  <span className="font-medium">{item.name}</span> — {item.reason}
                </li>
              ))}
            </ul>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-destructive"
              onClick={() => setRejected([])}
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* In-flight */}
        {active.length > 0 && (
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Radio className="size-4 animate-pulse text-primary" aria-hidden="true" />
              <CardTitle>Processing {active.length}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {active.map((item) => (
                <div key={item.id} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate font-medium">{item.original_filename}</span>
                    <span className="ml-auto shrink-0 text-muted-foreground">
                      {STATUS_LABEL[item.status]}
                    </span>
                    <span className="tabular w-9 shrink-0 text-right font-semibold">
                      {item.progress}%
                    </span>
                  </div>
                  <Progress value={item.progress} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* History */}
        <Card>
          <CardHeader>
            <CardTitle>Recent uploads</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-12 skeleton" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No uploads yet"
                description="Resumes you upload will appear here with their processing status."
              />
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((item) => (
                  <UploadRow
                    key={item.id}
                    item={item}
                    isStaff={isStaff}
                    onRetry={() => retry.mutate(item.id)}
                    retrying={retry.isPending && retry.variables === item.id}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </PageBody>
    </>
  )
}

function UploadRow({
  item,
  isStaff,
  onRetry,
  retrying,
}: {
  item: Upload
  isStaff: boolean
  onRetry: () => void
  retrying: boolean
}) {
  const isDone = item.status === 'done'
  const isFailed = item.status === 'failed'

  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md',
          isDone ? 'bg-success/10 text-success' : isFailed ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
        )}
      >
        {isDone ? (
          <CheckCircle2 className="size-4" aria-hidden="true" />
        ) : isFailed ? (
          <AlertCircle className="size-4" aria-hidden="true" />
        ) : (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{item.original_filename}</span>
          {item.is_duplicate && (
            <Tooltip content="This resume matched one already on file — the existing profile was refreshed.">
              <Badge variant="warning" className="cursor-help">
                <Copy className="size-3" aria-hidden="true" />
                Duplicate
              </Badge>
            </Tooltip>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatBytes(item.size_bytes)} · {formatRelative(item.created_at)}
        </p>
        {isFailed && item.error_message && (
          <p className="mt-1 text-xs font-medium text-destructive">{item.error_message}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {isFailed && item.size_bytes > 0 && (
          <Button variant="ghost" size="sm" onClick={onRetry} loading={retrying}>
            <RefreshCw aria-hidden="true" />
            Retry
          </Button>
        )}
        {isDone && item.candidate_id && isStaff && (
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/candidates?focus=${item.candidate_id}`}>View profile</Link>
          </Button>
        )}
        {isDone && !isStaff && (
          <Button variant="ghost" size="sm" asChild>
            <Link to="/my-resume">See how it was read</Link>
          </Button>
        )}
      </div>
    </li>
  )
}
