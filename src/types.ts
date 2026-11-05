export type AppRole = 'setter' | 'executor'

export type TaskStatus = 'new' | 'in_progress' | 'review' | 'accepted' | 'revision'

export type Profile = {
  id: string
  full_name: string
  role: AppRole
  created_at: string
}

export type ObjectRow = {
  id: string
  name: string
  address: string
  created_by: string
  created_at: string
  updated_at: string
  tasks?: Array<{ count: number }>
}

export type TaskRow = {
  id: string
  object_id: string
  title: string
  description: string
  assignee_id: string | null
  status: TaskStatus
  author_id: string
  archived_at: string | null
  archived_by: string | null
  created_at: string
  updated_at: string
  assignee?: Pick<Profile, 'id' | 'full_name'> | null
  author?: Pick<Profile, 'id' | 'full_name'> | null
  object?: Pick<ObjectRow, 'id' | 'name' | 'address'> | null
}

export type TaskEvent = {
  id: number
  task_id: string
  event_type: 'created' | 'updated' | 'status_changed' | 'archived' | 'restored'
  actor_id: string
  from_status: TaskStatus | null
  to_status: TaskStatus | null
  comment: string | null
  changes: Record<string, { old: unknown; new: unknown }>
  created_at: string
  actor?: Pick<Profile, 'id' | 'full_name'> | null
}

export type NotificationKind =
  | 'assigned'
  | 'updated'
  | 'submitted'
  | 'revision'
  | 'accepted'
  | 'archived'
  | 'restored'

export type TaskNotification = {
  id: number
  task_id: string
  actor_id: string
  kind: NotificationKind
  read_at: string | null
  created_at: string
  task?: Pick<TaskRow, 'id' | 'title' | 'status' | 'archived_at'> | null
  actor?: Pick<Profile, 'id' | 'full_name'> | null
}
