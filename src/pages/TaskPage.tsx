import { ArrowLeftOutlined, CheckOutlined, DeleteOutlined, EditOutlined, InboxOutlined, PlayCircleOutlined, RedoOutlined, RollbackOutlined, SendOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Descriptions, Form, Input, Modal, Popconfirm, Select, Space, Spin, Timeline, Typography, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { taskStatusLabel, TaskStatusTag } from '../taskStatus'
import type { Profile, TaskEvent, TaskRow, TaskStatus } from '../types'

type EditValues = { title: string; description: string; assignee_id?: string }

const fieldLabel: Record<string, string> = {
  title: 'Название',
  description: 'Описание',
  object_id: 'Объект',
  assignee_id: 'Исполнитель',
}

export function TaskPage() {
  const { id } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [task, setTask] = useState<TaskRow | null>(null)
  const [events, setEvents] = useState<TaskEvent[]>([])
  const [executors, setExecutors] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [revisionOpen, setRevisionOpen] = useState(false)
  const [form] = Form.useForm<EditValues>()
  const [revisionForm] = Form.useForm<{ comment: string }>()
  const [messageApi, contextHolder] = message.useMessage()

  const loadTask = useCallback(async () => {
    if (!supabase || !id) return
    setLoading(true)
    const [taskResult, eventResult] = await Promise.all([
      supabase
        .from('tasks')
        .select('*, object:objects(id, name, address), assignee:profiles!tasks_assignee_id_fkey(id, full_name), author:profiles!tasks_author_id_fkey(id, full_name)')
        .eq('id', id)
        .single(),
      supabase
        .from('task_events')
        .select('*, actor:profiles!task_events_actor_id_fkey(id, full_name)')
        .eq('task_id', id)
        .order('created_at', { ascending: false }),
    ])
    setLoading(false)
    if (taskResult.error || eventResult.error) {
      setError(taskResult.error?.message ?? eventResult.error?.message ?? 'Ошибка загрузки')
      return
    }
    setTask(taskResult.data as unknown as TaskRow)
    setEvents((eventResult.data ?? []) as unknown as TaskEvent[])
    setError(null)
  }, [id])

  useEffect(() => { loadTask() }, [loadTask])

  useEffect(() => {
    if (!supabase || profile?.role !== 'setter') return
    supabase.from('profiles').select('*').eq('role', 'executor').order('full_name').then(({ data }) => {
      setExecutors((data ?? []) as Profile[])
    })
  }, [profile?.role])

  const runAction = async (action: () => Promise<{ error: { message: string } | null }>, success: string) => {
    setActionLoading(true)
    const result = await action()
    setActionLoading(false)
    if (result.error) {
      messageApi.error(result.error.message)
      return false
    }
    messageApi.success(success)
    await loadTask()
    return true
  }

  const transition = (status: TaskStatus, comment?: string) => runAction(
    async () => {
      const { error: rpcError } = await supabase!.rpc('transition_task', { p_task_id: id, p_to_status: status, p_comment: comment ?? null })
      return { error: rpcError }
    },
    `Статус изменён: ${taskStatusLabel[status]}`,
  )

  const saveEdit = async (values: EditValues) => {
    const success = await runAction(
      async () => {
        const { error: updateError } = await supabase!.from('tasks').update({
          title: values.title.trim(),
          description: values.description.trim(),
          assignee_id: values.assignee_id ?? null,
        }).eq('id', id)
        return { error: updateError }
      },
      'Изменения сохранены в истории',
    )
    if (success) setEditOpen(false)
  }

  const openEdit = () => {
    if (!task) return
    form.setFieldsValue({ title: task.title, description: task.description, assignee_id: task.assignee_id ?? undefined })
    setEditOpen(true)
  }

  const submitRevision = async ({ comment }: { comment: string }) => {
    const success = await transition('revision', comment)
    if (success) {
      revisionForm.resetFields()
      setRevisionOpen(false)
    }
  }

  const deleteTask = async () => {
    const success = await runAction(
      async () => {
        const { error: deleteError } = await supabase!.from('tasks').delete().eq('id', id)
        return { error: deleteError }
      },
      'Задача удалена',
    )
    if (success) navigate(`/objects/${task?.object_id}`)
  }

  const actionButtons = (() => {
    if (!task || !profile || task.archived_at) return []
    const buttons: React.ReactNode[] = []
    const isAssignee = task.assignee_id === profile.id
    const isAuthor = task.author_id === profile.id

    if (profile.role === 'executor' && isAssignee && task.status === 'new') {
      buttons.push(<Button key="start" type="primary" icon={<PlayCircleOutlined />} onClick={() => transition('in_progress')}>Взять в работу</Button>)
    }
    if (profile.role === 'executor' && isAssignee && task.status === 'in_progress') {
      buttons.push(<Button key="review" type="primary" icon={<SendOutlined />} onClick={() => transition('review')}>Отправить на проверку</Button>)
    }
    if (profile.role === 'executor' && isAssignee && task.status === 'revision') {
      buttons.push(<Button key="redo" type="primary" icon={<RedoOutlined />} onClick={() => transition('in_progress')}>Вернуть в работу</Button>)
    }
    if (profile.role === 'setter' && isAuthor && task.status === 'review') {
      buttons.push(<Button key="accept" type="primary" icon={<CheckOutlined />} onClick={() => transition('accepted')}>Принять</Button>)
      buttons.push(<Button key="revision" danger icon={<RollbackOutlined />} onClick={() => setRevisionOpen(true)}>На доработку</Button>)
    }
    if (profile.role === 'setter' && task.status === 'new') {
      buttons.push(<Button key="edit" icon={<EditOutlined />} onClick={openEdit}>Редактировать</Button>)
    }
    if (profile.role === 'setter') {
      buttons.push(<Button key="archive" icon={<InboxOutlined />} onClick={() => runAction(async () => {
        const { error: rpcError } = await supabase!.rpc('archive_task', { p_task_id: id, p_comment: null })
        return { error: rpcError }
      }, 'Задача перемещена в архив')}>В архив</Button>)
    }
    return buttons
  })()

  if (loading) return <div className="centered"><Spin size="large" /></div>
  if (error || !task) return <Alert type="error" showIcon message="Не удалось открыть задачу" description={error} />

  const archived = Boolean(task.archived_at)

  return (
    <>
      {contextHolder}
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/objects/${task.object_id}`)}>К объекту</Button>
      <div className="page-heading">
        <div>
          <Space wrap><Typography.Title level={2}>{task.title}</Typography.Title><TaskStatusTag status={task.status} />{archived && <Typography.Text type="danger">В архиве</Typography.Text>}</Space>
          <Typography.Text type="secondary">{task.object?.name}</Typography.Text>
        </div>
        <Space wrap>{actionButtons}</Space>
      </div>

      {archived && profile?.role === 'setter' && (
        <Alert
          type="warning"
          showIcon
          message="Задача находится в архиве"
          action={<Button icon={<RollbackOutlined />} loading={actionLoading} onClick={() => runAction(async () => {
            const { error: rpcError } = await supabase!.rpc('restore_task', { p_task_id: id, p_comment: null })
            return { error: rpcError }
          }, 'Задача восстановлена')}>Восстановить</Button>}
        />
      )}

      <Card title="Данные задачи" className="content-card">
        <Descriptions column={{ xs: 1, md: 2 }} items={[
          { key: 'object', label: 'Объект', children: task.object?.name },
          { key: 'assignee', label: 'Исполнитель', children: task.assignee?.full_name ?? 'Не назначен' },
          { key: 'author', label: 'Автор', children: task.author?.full_name },
          { key: 'created', label: 'Создана', children: new Date(task.created_at).toLocaleString('ru-RU') },
          { key: 'description', label: 'Описание', span: 2, children: task.description || '—' },
        ]} />
        {profile?.role === 'setter' && task.status === 'new' && !task.assignee_id && !archived && (
          <Popconfirm title="Удалить задачу без возможности восстановления?" okText="Удалить" cancelText="Отмена" onConfirm={deleteTask}>
            <Button danger icon={<DeleteOutlined />}>Удалить неназначенную задачу</Button>
          </Popconfirm>
        )}
      </Card>

      <Card title="История" className="content-card">
        <Timeline items={events.map((event) => ({
          content: (
            <div>
              <Typography.Text strong>{event.actor?.full_name ?? 'Пользователь'}</Typography.Text>
              <Typography.Text type="secondary"> · {new Date(event.created_at).toLocaleString('ru-RU')}</Typography.Text>
              <div>{describeEvent(event)}</div>
              {event.comment && <Typography.Paragraph className="event-comment">«{event.comment}»</Typography.Paragraph>}
            </div>
          ),
        }))} />
      </Card>

      <Modal title="Редактирование задачи" open={editOpen} onCancel={() => setEditOpen(false)} onOk={() => form.submit()} confirmLoading={actionLoading} okText="Сохранить" cancelText="Отмена">
        <Form form={form} layout="vertical" onFinish={saveEdit} requiredMark={false}>
          <Form.Item name="title" label="Название" rules={[{ required: true, min: 2 }]}><Input /></Form.Item>
          <Form.Item name="description" label="Описание" rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item>
          <Form.Item name="assignee_id" label="Исполнитель"><Select allowClear options={executors.map((item) => ({ value: item.id, label: item.full_name }))} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="Вернуть на доработку" open={revisionOpen} onCancel={() => setRevisionOpen(false)} onOk={() => revisionForm.submit()} confirmLoading={actionLoading} okText="Вернуть" cancelText="Отмена">
        <Form form={revisionForm} layout="vertical" onFinish={submitRevision}>
          <Form.Item name="comment" label="Что нужно исправить" rules={[{ required: true, whitespace: true, message: 'Комментарий обязателен' }]}>
            <Input.TextArea rows={4} autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

function describeEvent(event: TaskEvent) {
  if (event.event_type === 'created') return 'Создал задачу'
  if (event.event_type === 'archived') return 'Переместил задачу в архив'
  if (event.event_type === 'restored') return 'Восстановил задачу из архива'
  if (event.event_type === 'status_changed' && event.from_status && event.to_status) {
    return `Изменил статус: ${taskStatusLabel[event.from_status]} → ${taskStatusLabel[event.to_status]}`
  }
  if (event.event_type === 'updated') {
    const fields = Object.keys(event.changes).map((key) => fieldLabel[key] ?? key)
    return `Изменил поля: ${fields.join(', ')}`
  }
  return 'Изменил задачу'
}
