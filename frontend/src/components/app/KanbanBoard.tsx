import * as React from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { GripVertical, MoveRight } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { STAGE_META, STAGE_ORDER, cn, pct } from '@/lib/utils'
import {
  Badge,
  Button,
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Skeleton,
  Tooltip,
} from '@/components/ui/primitives'
import { Avatar, ScoreBadge } from '@/components/app/shared'
import type { Match, PipelineStage } from '@/types'

export function KanbanBoard({
  matches,
  loading,
  onOpen,
}: {
  matches: Match[]
  loading: boolean
  onOpen: (matchId: number) => void
}) {
  const queryClient = useQueryClient()
  const [dragging, setDragging] = React.useState<Match | null>(null)
  // Optimistic overrides so a card lands instantly, before the server replies.
  const [optimistic, setOptimistic] = React.useState<Record<number, PipelineStage>>({})

  const sensors = useSensors(
    // A small distance threshold stops a click from being read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  const setStage = useMutation({
    mutationFn: ({ matchId, stage }: { matchId: number; stage: PipelineStage }) =>
      api.matches.setStage(matchId, stage),
    onSuccess: (_data, variables) => {
      toast.success(`Moved to ${STAGE_META[variables.stage].label}`)
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    },
    onError: (error: Error, variables) => {
      // Roll the card back to where it came from.
      setOptimistic((prev) => {
        const next = { ...prev }
        delete next[variables.matchId]
        return next
      })
      toast.error('Could not move candidate', { description: error.message })
    },
  })

  const stageOf = (match: Match) => optimistic[match.id] ?? match.stage

  const columns = React.useMemo(() => {
    const grouped: Record<string, Match[]> = {}
    STAGE_ORDER.forEach((stage) => {
      grouped[stage] = []
    })
    matches.forEach((match) => {
      const stage = stageOf(match)
      ;(grouped[stage] ??= []).push(match)
    })
    Object.values(grouped).forEach((list) =>
      list.sort((a, b) => b.overall_score - a.overall_score),
    )
    return grouped
  }, [matches, optimistic])

  function handleDragStart(event: DragStartEvent) {
    const match = matches.find((item) => item.id === Number(event.active.id))
    setDragging(match ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragging(null)
    const { active, over } = event
    if (!over) return

    const matchId = Number(active.id)
    const targetStage = String(over.id) as PipelineStage
    if (!STAGE_ORDER.includes(targetStage)) return

    const match = matches.find((item) => item.id === matchId)
    if (!match || stageOf(match) === targetStage) return

    setOptimistic((prev) => ({ ...prev, [matchId]: targetStage }))
    setStage.mutate({ matchId, stage: targetStage })
  }

  function move(matchId: number, stage: PipelineStage) {
    setOptimistic((prev) => ({ ...prev, [matchId]: stage }))
    setStage.mutate({ matchId, stage })
  }

  if (loading) {
    return (
      <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-2">
        {STAGE_ORDER.map((stage) => (
          <Skeleton key={stage} className="h-72 w-64 shrink-0" />
        ))}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-2">
        {STAGE_ORDER.map((stage) => (
          <Column
            key={stage}
            stage={stage}
            matches={columns[stage] ?? []}
            onOpen={onOpen}
            onMove={move}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
        {dragging ? <CardFace match={dragging} dragging /> : null}
      </DragOverlay>

      <p className="mt-3 text-xs text-muted-foreground">
        Drag a card between columns, or use the menu on each card — every drag action has a
        keyboard-accessible equivalent.
      </p>
    </DndContext>
  )
}

function Column({
  stage,
  matches,
  onOpen,
  onMove,
}: {
  stage: PipelineStage
  matches: Match[]
  onOpen: (matchId: number) => void
  onMove: (matchId: number, stage: PipelineStage) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const meta = STAGE_META[stage]

  return (
    <section
      ref={setNodeRef}
      aria-label={`${meta.label} — ${matches.length} candidates`}
      className={cn(
        'flex w-64 shrink-0 flex-col rounded-lg border bg-muted/30 transition-colors',
        isOver ? 'border-primary bg-primary/5' : 'border-border',
      )}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className={cn('size-2 rounded-full', meta.dot)} aria-hidden="true" />
        <h3 className="text-xs font-bold">{meta.label}</h3>
        <Badge variant="muted" className="tabular ml-auto">
          {matches.length}
        </Badge>
      </header>

      <div className="scrollbar-thin flex max-h-[62dvh] flex-col gap-2 overflow-y-auto p-2">
        {matches.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            Nothing here yet
          </p>
        ) : (
          matches.map((match) => (
            <DraggableCard
              key={match.id}
              match={match}
              onOpen={() => onOpen(match.id)}
              onMove={(next) => onMove(match.id, next)}
            />
          ))
        )}
      </div>
    </section>
  )
}

function DraggableCard({
  match,
  onOpen,
  onMove,
}: {
  match: Match
  onOpen: () => void
  onMove: (stage: PipelineStage) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: match.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(isDragging && 'opacity-40')}
    >
      <CardFace match={match} onOpen={onOpen} onMove={onMove} handleProps={{ ...attributes, ...listeners }} />
    </div>
  )
}

function CardFace({
  match,
  onOpen,
  onMove,
  handleProps,
  dragging,
}: {
  match: Match
  onOpen?: () => void
  onMove?: (stage: PipelineStage) => void
  handleProps?: Record<string, unknown>
  dragging?: boolean
}) {
  const candidate = match.candidate

  return (
    <Card
      className={cn(
        'group p-2.5 transition-shadow',
        dragging ? 'rotate-1 shadow-pop' : 'hover:shadow-card',
      )}
    >
      <div className="flex items-start gap-2">
        {handleProps && (
          <button
            type="button"
            {...handleProps}
            className="mt-0.5 cursor-grab touch-none rounded p-0.5 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing group-hover:opacity-100"
            aria-label={`Drag ${candidate.full_name ?? 'candidate'}`}
          >
            <GripVertical className="size-3.5" aria-hidden="true" />
          </button>
        )}
        <Avatar name={candidate.full_name} size="sm" anonymized={candidate.is_anonymized} />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            disabled={!onOpen}
            className="block w-full cursor-pointer truncate text-left text-xs font-semibold hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {candidate.full_name ?? 'Unnamed'}
          </button>
          <p className="truncate text-[11px] text-muted-foreground">
            {candidate.total_experience.toFixed(0)} yrs ·{' '}
            {candidate.highest_qualification ?? 'Education unknown'}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <ScoreBadge score={match.overall_score} size="sm" showLabel={false} />
        {match.note_count > 0 && (
          <Tooltip content={`${match.note_count} note(s)`}>
            <Badge variant="muted" className="tabular cursor-help">
              {match.note_count}
            </Badge>
          </Tooltip>
        )}
        {onMove && (
          <Select value={match.stage} onValueChange={(value) => onMove(value as PipelineStage)}>
            <SelectTrigger
              className="ml-auto h-6 w-6 justify-center border-0 bg-transparent p-0 shadow-none [&>svg:last-child]:hidden"
              aria-label={`Move ${candidate.full_name ?? 'candidate'} to another stage`}
            >
              <MoveRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </SelectTrigger>
            <SelectContent>
              {STAGE_ORDER.map((stage) => (
                <SelectItem key={stage} value={stage}>
                  <span className="flex items-center gap-2">
                    <span className={cn('size-2 rounded-full', STAGE_META[stage].dot)} aria-hidden="true" />
                    {STAGE_META[stage].label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </Card>
  )
}
