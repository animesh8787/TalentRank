import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, KeyRound, RefreshCw, ShieldCheck, Users } from '@/components/ui/icons'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui/primitives'
import { PageBody, PageHeader } from '@/components/app/shared'

export function TeamPage() {
  const queryClient = useQueryClient()
  const { data: org, isLoading } = useQuery({ queryKey: ['org'], queryFn: api.orgs.me })

  const rotate = useMutation({
    mutationFn: api.orgs.rotateCode,
    onSuccess: (next) => {
      queryClient.setQueryData(['org'], next)
      toast.success('Invite code replaced', { description: 'The old code no longer works.' })
    },
    onError: () => toast.error('Could not replace the invite code'),
  })

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      toast.success('Invite code copied')
    } catch {
      toast.error('Copy failed. Select the code and copy it manually')
    }
  }

  return (
    <>
      <PageHeader
        title="Team"
        description="Everyone on your team shares the same roles, uploaded candidates, notes and activity log."
      />
      <PageBody className="max-w-2xl">
        {isLoading || !org ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="size-4" aria-hidden="true" />
                  {org.name}
                </CardTitle>
                <CardDescription>
                  {org.member_count} member{org.member_count === 1 ? '' : 's'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <KeyRound className="size-4" aria-hidden="true" />
                  Invite code
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded-md border bg-muted px-3 py-1.5 font-mono text-sm tracking-widest">
                    {org.invite_code}
                  </code>
                  <Button variant="outline" size="sm" onClick={() => void copy(org.invite_code)}>
                    <Copy aria-hidden="true" /> Copy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={rotate.isPending}
                    onClick={() => rotate.mutate()}
                  >
                    <RefreshCw aria-hidden="true" /> Replace code
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  A teammate registers as a recruiter, chooses <strong>Join a team</strong> and enters
                  this code. Replace it if it was shared by mistake.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-start gap-2.5 p-4 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p>
                  Other teams cannot see your roles, uploads, notes or exports. Candidates who
                  registered themselves appear to you only while they match one of your open roles.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </PageBody>
    </>
  )
}
