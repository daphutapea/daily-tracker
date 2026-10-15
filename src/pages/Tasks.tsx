import {
  defaultDropAnimation,
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DropAnimation,
} from '@dnd-kit/core'
import { MagnifyingGlassIcon, PlusIcon } from '@phosphor-icons/react'
import { addDays, endOfDay, startOfDay, subDays } from 'date-fns'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { TaskRow } from '@/components/TaskRow'
import { Loading, PriorityTag, QueryError, Segmented, StateMessage } from '@/components/ui'
import { formatWhen, toDate } from '@/lib/dates'
import { useDialogs } from '@/lib/dialogs'
import { useProjects, useSetTaskStatus, useTasks } from '@/lib/queries'
import { PRIORITIES, PRIORITY_RANK, STATUSES, type Project, type TaskStatus, type TaskSummary } from '@/lib/types'

type Show = 'open' | 'today' | 'overdue' | 'done' | 'all'
const SHOW_OPTIONS: { value: Show; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'today', label: 'Today' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'done', label: 'Done' },
  { value: 'all', label: 'All' },
]

export function TasksPage() {
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'board' ? 'board' : 'list'
  const show = (SHOW_OPTIONS.find((o) => o.value === params.get('show'))?.value ?? 'open') as Show
  const q = params.get('q') ?? ''
  const priority = params.get('priority') ?? ''
  const projectId = params.get('project') ?? ''

  const tasks = useTasks()
  const projects = useProjects()
  const { openTask } = useDialogs()
  const projectById = useMemo(() => new Map(projects.data?.map((p) => [p.id, p])), [projects.data])

  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (tasks.data ?? []).filter(
      (t) =>
        (!needle || t.title.toLowerCase().includes(needle) || t.notes_text.toLowerCase().includes(needle)) &&
        (!priority || t.priority === priority) &&
        (!projectId || t.project_id === projectId),
    )
  }, [tasks.data, q, priority, projectId])

  const filtersActive = !!(q || priority || projectId)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Tasks</h1>
        <button type="button" className="btn btn-primary" onClick={() => openTask('new')}>
          <PlusIcon size={16} weight="bold" />
          Add task
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="View"
          value={view}
          options={[
            { value: 'list', label: 'List' },
            { value: 'board', label: 'Board' },
          ]}
          onChange={(v) => setParam('view', v === 'board' ? 'board' : '')}
        />
        <div className="relative min-w-0 flex-1 basis-48">
          <MagnifyingGlassIcon
            size={16}
            weight="bold"
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3"
          />
          <label htmlFor="task-search" className="sr-only">
            Search tasks
          </label>
          <input
            id="task-search"
            type="search"
            placeholder="Search titles and notes"
            className="field pl-8"
            value={q}
            onChange={(e) => setParam('q', e.target.value)}
          />
        </div>
        <label htmlFor="filter-priority" className="sr-only">
          Priority
        </label>
        <select
          id="filter-priority"
          className="field w-auto"
          value={priority}
          onChange={(e) => setParam('priority', e.target.value)}
        >
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        {!!projects.data?.length && (
          <>
            <label htmlFor="filter-project" className="sr-only">
              Project
            </label>
            <select
              id="filter-project"
              className="field w-auto max-w-48"
              value={projectId}
              onChange={(e) => setParam('project', e.target.value)}
            >
              <option value="">All projects</option>
              {projects.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {view === 'list' && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {SHOW_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="chip"
              aria-pressed={show === o.value}
              onClick={() => setParam('show', o.value === 'open' ? '' : o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {tasks.isPending ? (
        <Loading what="tasks" />
      ) : tasks.isError ? (
        <QueryError what="tasks" error={tasks.error} retry={() => tasks.refetch()} />
      ) : tasks.data.length === 0 ? (
        <div className="panel">
          <StateMessage
            title="No tasks yet."
            body="Add the first thing you need to get done. Give it a deadline and it shows up on Home and in the calendar."
            action={
              <button type="button" className="btn btn-primary" onClick={() => openTask('new')}>
                Add your first task
              </button>
            }
          />
        </div>
      ) : view === 'board' ? (
        <Board tasks={filtered} projectById={projectById} onOpen={openTask} />
      ) : (
        <TaskList
          tasks={filtered}
          show={show}
          projectById={projectById}
          onOpen={openTask}
          filtersActive={filtersActive}
          clearFilters={() => setParams(view === 'list' && show !== 'open' ? { show } : {}, { replace: true })}
        />
      )}
    </div>
  )
}

function TaskList({
  tasks,
  show,
  projectById,
  onOpen,
  filtersActive,
  clearFilters,
}: {
  tasks: TaskSummary[]
  show: Show
  projectById: Map<string, Project>
  onOpen: (id: string) => void
  filtersActive: boolean
  clearFilters: () => void
}) {
  const now = new Date()
  const groups = groupTasks(tasks, show, now)
  const count = groups.reduce((n, g) => n + g.tasks.length, 0)

  if (count === 0) {
    const emptyCopy: Record<Show, string> = {
      open: 'Every task is done.',
      today: 'Nothing is due today.',
      overdue: 'Nothing is overdue.',
      done: 'No finished tasks yet.',
      all: 'No tasks.',
    }
    return (
      <div className="panel">
        <StateMessage
          title={filtersActive ? 'No tasks match these filters.' : emptyCopy[show]}
          action={
            filtersActive ? (
              <button type="button" className="btn btn-quiet" onClick={clearFilters}>
                Clear filters
              </button>
            ) : undefined
          }
        />
      </div>
    )
  }

  return (
    <div className="panel fade-in overflow-hidden">
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label} className="border-line not-first:border-t">
          <h2
            className={`border-b border-line bg-surface-2/50 px-4 py-1.5 text-[13px] font-medium ${
              g.tone === 'danger' ? 'text-danger' : 'text-ink-2'
            }`}
          >
            {g.label} <span className="font-normal text-ink-3">· {g.tasks.length}</span>
          </h2>
          <ul className="divide-y divide-line">
            {g.tasks.map((t) => (
              <TaskRow key={t.id} task={t} project={projectById.get(t.project_id ?? '')} onOpen={onOpen} now={now} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function groupTasks(tasks: TaskSummary[], show: Show, now: Date) {
  const today = startOfDay(now)
  const todayEnd = endOfDay(now)
  const tomorrowEnd = endOfDay(addDays(now, 1))
  const weekEnd = endOfDay(addDays(now, 7))
  const byDue = (a: TaskSummary, b: TaskSummary) =>
    (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]

  if (show === 'done') {
    const done = tasks
      .filter((t) => t.status === 'done')
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    return [{ label: 'Done', tasks: done, tone: undefined }]
  }

  const pool = tasks
    .filter((t) => (show === 'all' ? true : t.status !== 'done'))
    .filter((t) => {
      if (show === 'today') return t.due_at && toDate(t.due_at) >= today && toDate(t.due_at) <= todayEnd
      if (show === 'overdue') return t.due_at && toDate(t.due_at) < today
      return true
    })
    .sort(byDue)

  const buckets: { label: string; tone?: 'danger'; test: (d: Date | null) => boolean }[] = [
    { label: 'Overdue', tone: 'danger', test: (d) => !!d && d < today },
    { label: 'Today', test: (d) => !!d && d >= today && d <= todayEnd },
    { label: 'Tomorrow', test: (d) => !!d && d > todayEnd && d <= tomorrowEnd },
    { label: 'Next 7 days', test: (d) => !!d && d > tomorrowEnd && d <= weekEnd },
    { label: 'Later', test: (d) => !!d && d > weekEnd },
    { label: 'No deadline', test: (d) => !d },
  ]
  return buckets
    .map((b) => ({
      label: b.label,
      tone: b.tone,
      tasks: pool.filter((t) => b.test(t.due_at ? toDate(t.due_at) : null)),
    }))
    .filter((g) => g.tasks.length > 0)
}

// ---------------------------------------------------------------- board

const DONE_WINDOW_DAYS = 14

function Board({
  tasks,
  projectById,
  onOpen,
}: {
  tasks: TaskSummary[]
  projectById: Map<string, Project>
  onOpen: (id: string) => void
}) {
  const setStatus = useSetTaskStatus()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  )
  const doneSince = subDays(new Date(), DONE_WINDOW_DAYS)
  const [activeId, setActiveId] = useState<string | null>(null)
  // A dropped card's new column, held locally until the save settles. React Query delivers its own
  // update a tick later, and the drop animation measures the card in the same render as the drop,
  // so without this the lifted copy flies back to the old column before the card jumps across.
  const [moved, setMoved] = useState<Record<string, TaskStatus>>({})

  const board = tasks.map((t) => {
    const status = moved[t.id]
    if (!status || status === t.status) return t
    return { ...t, status, completed_at: status === 'done' ? (t.completed_at ?? new Date().toISOString()) : null }
  })
  const active = activeId ? board.find((t) => t.id === activeId) : undefined

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const to = e.over?.id as TaskStatus | undefined
    const task = board.find((t) => t.id === e.active.id)
    if (!to || !task || task.status === to) return
    setMoved((m) => ({ ...m, [task.id]: to }))
    setStatus.mutate(
      { id: task.id, status: to },
      {
        onSettled: () =>
          setMoved((m) => {
            const { [task.id]: _done, ...rest } = m
            return rest
          }),
      },
    )
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <p className="text-[13px] text-ink-3">
        Drag a card to change its status, or open it to edit. Done shows the last {DONE_WINDOW_DAYS} days.
      </p>
      <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        {STATUSES.map((s) => {
          const items = board
            .filter((t) => t.status === s.value)
            .filter((t) => s.value !== 'done' || (t.completed_at && toDate(t.completed_at) >= doneSince))
            .sort((a, b) =>
              s.value === 'done'
                ? (b.completed_at ?? '').localeCompare(a.completed_at ?? '')
                : PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
                  (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'),
            )
          return (
            <Column key={s.value} status={s.value} label={s.label} count={items.length}>
              {items.map((t) => (
                <Card key={t.id} task={t} project={projectById.get(t.project_id ?? '')} onOpen={onOpen} />
              ))}
            </Column>
          )
        })}
      </div>
      {/* The lifted copy follows the pointer; on drop it settles into the card's new place. */}
      <DragOverlay dropAnimation={DROP_ANIMATION}>
        {active ? (
          <div className="scale-[1.02] cursor-grabbing rounded-[6px] shadow-float">
            <CardFace task={active} project={projectById.get(active.project_id ?? '')} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

const DROP_ANIMATION: DropAnimation = {
  ...defaultDropAnimation,
  duration: 200,
  easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
}

function Column({
  status,
  label,
  count,
  children,
}: {
  status: TaskStatus
  label: string
  count: number
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <section
      ref={setNodeRef}
      aria-label={`${label}, ${count} ${count === 1 ? 'task' : 'tasks'}`}
      className={`flex w-[82vw] max-w-80 shrink-0 snap-start flex-col rounded-[10px] border bg-surface-2/50 transition-colors duration-150 md:w-auto md:max-w-none ${
        isOver ? 'border-ink-2' : 'border-line'
      }`}
    >
      <h2 className="px-3 pt-2.5 pb-2 text-[13px] font-medium text-ink-2">
        {label} <span className="font-normal text-ink-3">· {count}</span>
      </h2>
      <ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
        {count === 0 ? <li className="px-1 py-3 text-[13px] text-ink-3">Nothing here.</li> : children}
      </ul>
    </section>
  )
}

function Card({ task, project, onOpen }: { task: TaskSummary; project?: Project; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  const { role: _role, tabIndex: _tabIndex, ...dragAttributes } = attributes
  return (
    // While its copy is lifted, the card stays put and dims, so you can see where it came from.
    <li ref={setNodeRef} className={`touch-manipulation transition-opacity duration-150 ${isDragging ? 'opacity-40' : ''}`}>
      <button
        type="button"
        {...dragAttributes}
        {...listeners}
        onClick={() => onOpen(task.id)}
        className="press block w-full rounded-[6px] text-left"
      >
        <CardFace task={task} project={project} />
      </button>
    </li>
  )
}

function CardFace({ task, project }: { task: TaskSummary; project?: Project }) {
  const now = new Date()
  const overdue = task.status !== 'done' && task.due_at && toDate(task.due_at) < now
  return (
    <span className="block rounded-[6px] border border-line bg-surface p-3">
      <span className={`block break-words ${task.status === 'done' ? 'text-ink-3 line-through' : ''}`}>{task.title}</span>
      <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px]">
        {task.due_at && (
          <span className={`tnum ${overdue ? 'font-medium text-danger' : 'text-ink-2'}`}>
            {overdue ? 'Overdue · ' : ''}
            {formatWhen(task.due_at, now)}
          </span>
        )}
        {project && <span className="text-ink-3">{project.name}</span>}
        {task.status !== 'done' && <PriorityTag priority={task.priority} quiet />}
      </span>
    </span>
  )
}
