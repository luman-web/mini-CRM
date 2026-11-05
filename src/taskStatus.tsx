import { Tag } from 'antd'
/* eslint-disable react-refresh/only-export-components */
import type { TaskStatus } from './types'

export const taskStatusLabel: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  review: 'На проверке',
  accepted: 'Принята',
  revision: 'На доработке',
}

const taskStatusColor: Record<TaskStatus, string> = {
  new: 'blue',
  in_progress: 'processing',
  review: 'gold',
  accepted: 'green',
  revision: 'volcano',
}

export function TaskStatusTag({ status }: { status: TaskStatus }) {
  return <Tag color={taskStatusColor[status]}>{taskStatusLabel[status]}</Tag>
}
