import { Alert, Card, Empty, Table, Typography } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { TaskStatusTag } from '../taskStatus'
import type { TaskRow } from '../types'

export function MyTasksPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadTasks = useCallback(async () => {
    if (!supabase || !profile) return
    setLoading(true)
    const { data, error: queryError } = await supabase
      .from('tasks')
      .select('*, object:objects(id, name, address)')
      .eq('assignee_id', profile.id)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
    setLoading(false)
    if (queryError) {
      setError(queryError.message)
      return
    }
    setTasks((data ?? []) as unknown as TaskRow[])
    setError(null)
  }, [profile])

  useEffect(() => { loadTasks() }, [loadTasks])

  return (
    <>
      <div className="page-heading">
        <div>
          <Typography.Title level={2}>Мои задачи</Typography.Title>
          <Typography.Text type="secondary">Активные задачи, назначенные вам</Typography.Text>
        </div>
      </div>
      {error && <Alert type="error" showIcon title="Не удалось загрузить задачи" description={error} />}
      <Card>
        <Table<TaskRow>
          rowKey="id"
          loading={loading}
          dataSource={tasks}
          locale={{ emptyText: <Empty description="Назначенных задач нет" /> }}
          onRow={(task) => ({ onClick: () => navigate(`/tasks/${task.id}`), className: 'clickable-row' })}
          columns={[
            { title: 'Задача', dataIndex: 'title', key: 'title' },
            { title: 'Объект', key: 'object', render: (_, task) => task.object?.name ?? '—' },
            { title: 'Статус', key: 'status', render: (_, task) => <TaskStatusTag status={task.status} /> },
          ]}
        />
      </Card>
    </>
  )
}
