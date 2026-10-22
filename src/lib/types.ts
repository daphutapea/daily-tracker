import type { JSONContent } from '@tiptap/react'
import type { Database, Tables } from './database.types'

export type TaskStatus = Database['public']['Enums']['task_status']
export type TaskPriority = Database['public']['Enums']['task_priority']

export interface TaskLink {
  label: string
  url: string
}

type TaskRow = Tables<'tasks'>
export type Task = Omit<TaskRow, 'links' | 'notes'> & { links: TaskLink[]; notes: JSONContent | null }
/** What lists and the dashboard load: everything except the rich notes body. */
export type TaskSummary = Omit<Task, 'notes' | 'user_id' | 'reminded_at'>

type NoteRow = Tables<'notes'>
export type Note = Omit<NoteRow, 'content'> & { content: JSONContent | null }
export type NoteSummary = Omit<Note, 'content' | 'user_id'>

export type CalEvent = Tables<'events'>
export type EventSeries = Tables<'event_series'>
export type Project = Tables<'projects'>
export type QuickLink = Tables<'quick_links'>
export type Profile = Tables<'profiles'>

export const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'done', label: 'Done' },
]

export const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export const statusLabel = (s: TaskStatus) => STATUSES.find((x) => x.value === s)!.label
export const priorityLabel = (p: TaskPriority) => PRIORITIES.find((x) => x.value === p)!.label
export const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
