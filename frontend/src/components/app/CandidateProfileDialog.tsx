import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Copy, Github, Linkedin, Mail, MapPin, Phone, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { formatDate, pct } from '@/lib/utils'
import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Separator,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
} from '@/components/ui/primitives'
import { Avatar, ChipRow, HealthPill } from '@/components/app/shared'
import { HealthReportPanel } from '@/components/app/HealthReportPanel'

export function CandidateProfileDialog({
  candidateId,
  onOpenChange,
}: {
  candidateId: number | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

  const { data: candidate, isLoading } = useQuery({
    queryKey: ['candidate', candidateId],
    queryFn: () => api.candidates.get(candidateId as number),
    enabled: candidateId !== null,
  })

  const { data: duplicates = [] } = useQuery({
    queryKey: ['duplicates', candidateId],
    queryFn: () => api.candidates.duplicates(candidateId as number),
    enabled: candidateId !== null,
  })

  const remove = useMutation({
    mutationFn: () => api.candidates.remove(candidateId as number),
    onSuccess: () => {
      toast.success('Candidate deleted')
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ['candidates'] })
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    },
    onError: (error: Error) => toast.error('Could not delete', { description: error.message }),
  })

  return (
    <Dialog open={candidateId !== null} onOpenChange={onOpenChange}>
      <DialogContent wide className="max-h-[92dvh]">
        {isLoading || !candidate ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                <Avatar
                  name={candidate.full_name}
                  size="lg"
                  anonymized={candidate.is_anonymized}
                />
                <div className="min-w-0 flex-1">
                  <DialogTitle className="truncate">
                    {candidate.full_name ?? 'Unnamed candidate'}
                  </DialogTitle>
                  {candidate.headline && (
                    <p className="truncate text-sm text-muted-foreground">{candidate.headline}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {candidate.email && (
                      <a
                        href={`mailto:${candidate.email}`}
                        className="flex items-center gap-1 hover:text-foreground hover:underline"
                      >
                        <Mail className="size-3" aria-hidden="true" />
                        {candidate.email}
                      </a>
                    )}
                    {candidate.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="size-3" aria-hidden="true" />
                        {candidate.phone}
                      </span>
                    )}
                    {candidate.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" aria-hidden="true" />
                        {candidate.location}
                      </span>
                    )}
                    {candidate.linkedin_url && (
                      <a
                        href={candidate.linkedin_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center gap-1 hover:text-foreground hover:underline"
                      >
                        <Linkedin className="size-3" aria-hidden="true" />
                        LinkedIn
                      </a>
                    )}
                    {candidate.github_url && (
                      <a
                        href={candidate.github_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center gap-1 hover:text-foreground hover:underline"
                      >
                        <Github className="size-3" aria-hidden="true" />
                        GitHub
                      </a>
                    )}
                  </div>
                </div>
                <HealthPill score={candidate.health_score} />
              </div>
            </DialogHeader>

            {duplicates.length > 0 && (
              <div className="flex items-start gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-xs">
                <Copy className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
                <p className="text-warning">
                  <span className="font-semibold">
                    {duplicates.length} possible duplicate
                    {duplicates.length === 1 ? '' : 's'}
                  </span>{' '}
                  — same email, phone or resume content as{' '}
                  {duplicates.map((item) => item.full_name ?? `#${item.id}`).join(', ')}.
                </p>
              </div>
            )}

            <Tabs defaultValue="profile" className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-border px-4 py-2">
                <TabsList>
                  <TabsTrigger value="profile">Profile</TabsTrigger>
                  <TabsTrigger value="health">Resume health</TabsTrigger>
                  <TabsTrigger value="resume">Resume text</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="profile" className="min-h-0 flex-1">
                <DialogBody className="space-y-5">
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Fact label="Experience" value={`${candidate.total_experience.toFixed(0)} yrs`} />
                    <Fact label="Education" value={candidate.highest_qualification ?? '—'} />
                    <Fact label="University" value={candidate.university ?? '—'} />
                    <Fact label="Added" value={formatDate(candidate.created_at)} />
                  </dl>

                  <Separator />

                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Skills ({candidate.skills.length})
                    </h3>
                    {candidate.skills.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No skills detected.</p>
                    ) : (
                      <ChipRow
                        items={candidate.skills}
                        max={24}
                        render={(skill: typeof candidate.skills[number]) => (
                          <Tooltip
                            key={skill.id}
                            content={
                              skill.evidence
                                ? `${skill.proficiency} · ${pct(skill.confidence)} confidence — “${skill.evidence}”`
                                : `${skill.proficiency} · ${pct(skill.confidence)} confidence`
                            }
                          >
                            <Badge variant="outline" className="cursor-help">
                              {skill.name}
                            </Badge>
                          </Tooltip>
                        )}
                      />
                    )}
                  </section>

                  {candidate.experiences.length > 0 && (
                    <section>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Work history
                      </h3>
                      <ul className="space-y-2">
                        {candidate.experiences.map((item) => (
                          <li key={item.id} className="rounded-md border border-border p-2.5 text-xs">
                            <p className="font-semibold">{item.title ?? 'Role not detected'}</p>
                            <p className="text-muted-foreground">{item.company ?? '—'}</p>
                            <p className="tabular mt-0.5 text-[11px] text-muted-foreground">
                              {item.start_date ?? '?'} – {item.end_date ?? 'Present'}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </DialogBody>
              </TabsContent>

              <TabsContent value="health" className="min-h-0 flex-1">
                <DialogBody>
                  {candidate.health_report ? (
                    <HealthReportPanel report={candidate.health_report} />
                  ) : (
                    <p className="text-sm text-muted-foreground">No health report was recorded.</p>
                  )}
                </DialogBody>
              </TabsContent>

              <TabsContent value="resume" className="min-h-0 flex-1">
                <DialogBody>
                  <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 font-sans text-xs leading-relaxed">
                    {candidate.resume_text || 'No resume text available.'}
                  </pre>
                </DialogBody>
              </TabsContent>
            </Tabs>

            <div className="flex justify-between gap-2 border-t border-border p-4">
              <Button
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete ${candidate.full_name ?? 'this candidate'}? This removes their profile, all match records and notes. It cannot be undone.`,
                    )
                  ) {
                    remove.mutate()
                  }
                }}
                loading={remove.isPending}
              >
                <Trash2 aria-hidden="true" />
                Delete candidate
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-semibold" title={value}>
        {value}
      </dd>
    </div>
  )
}
