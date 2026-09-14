import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText, Search } from 'lucide-react'

import { api } from '@/lib/api'
import { formatRelative } from '@/lib/utils'
import { Badge, Card, EmptyState, Input, Skeleton } from '@/components/ui/primitives'
import { PageBody, PageHeader } from '@/components/app/shared'

export function ActivityPage() {
  const [search, setSearch] = React.useState('')

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.analytics.audit(200),
  })

  const visible = events.filter((event) =>
    search.trim()
      ? `${event.summary} ${event.actor_name} ${event.action}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      : true,
  )

  return (
    <>
      <PageHeader
        title="Activity log"
        description="Every change to roles, candidates and pipeline stages — who did it and when."
      >
        <div className="flex items-center gap-2 border-t border-border px-4 py-2.5 sm:px-6">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search the log…"
              className="pl-8"
              aria-label="Search activity log"
            />
          </div>
          <span className="tabular ml-auto text-xs text-muted-foreground">
            {visible.length} event{visible.length === 1 ? '' : 's'}
          </span>
        </div>
      </PageHeader>

      <PageBody>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={search ? 'Nothing matches that search' : 'No activity recorded yet'}
            description={
              search
                ? 'Try a different term.'
                : 'Actions like creating a role or moving a candidate appear here.'
            }
          />
        ) : (
          <Card className="divide-y divide-border">
            {visible.map((event) => (
              <div key={event.id} className="flex items-start gap-3 p-3">
                <Badge variant="muted" className="shrink-0 font-mono text-[10px]">
                  {event.action}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{event.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.actor_name} · {event.entity_type}
                    {event.entity_id ? ` #${event.entity_id}` : ''} ·{' '}
                    {formatRelative(event.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        )}
      </PageBody>
    </>
  )
}
