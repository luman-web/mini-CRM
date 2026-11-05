import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Descriptions, Empty, Form, Input, Modal, Select, Table, Typography, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errorMessage'
import { TaskStatusTag } from '../taskStatus'
import type { ObjectRow, Profile, TaskRow } from '../types'

type TaskFormValues = { title: string; description: string; assignee_id?: string }

export function ObjectPage() {
  const { id } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [object, setObject] = useState<ObjectRow | null>(null)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [executors, setExecutors] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<TaskFormValues>()
  const [messageApi, contextHolder] = message.useMessage()

  const loadPage = useCallback(async () => {
    if (!supabase || !id) return
    setLoading(true)
    const [objectResult, tasksResult] = await Promise.all([
      supabase.from('objects').select('*').eq('id', id).single(),
      supabase
        .from('tasks')
        .select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name)')
        .eq('object_id', id)
        .order('created_at', { ascending: false }),
    ])
    setLoading(false)

    if (objectResult.error || tasksResult.error) {
      setError(errorMessage(objectResult.error ?? tasksResult.error, 'Не удалось загрузить данные объекта'))
      return
    }
    setObject(objectResult.data as ObjectRow)
    setTasks((tasksResult.data ?? []) as unknown as TaskRow[])
    setError(null)
  }, [id])

  useEffect(() => { loadPage() }, [loadPage])

  useEffect(() => {
    if (!supabase || profile?.role !== 'setter') return
    supabase.from('profiles').select('*').eq('role', 'executor').order('full_name').then(({ data }) => {
      setExecutors((data ?? []) as Profile[])
    })
  }, [profile?.role])

  const createTask = async (values: TaskFormValues) => {
    if (!supabase || !profile || !id) return
    setSaving(true)
    const { error: insertError } = await supabase.from('tasks').insert({
      object_id: id,
      title: values.title.trim(),
      description: values.description.trim(),
      assignee_id: values.assignee_id ?? null,
      author_id: profile.id,
    })
    setSaving(false)
    if (insertError) {
      messageApi.error(errorMessage(insertError, 'Не удалось создать задачу'))
      return
    }
    messageApi.success('Задача создана')
    form.resetFields()
    setModalOpen(false)
    loadPage()
  }

  if (error) return <Alert type="error" showIcon title="Не удалось открыть объект" description={error} />

  return (
    <>
      {contextHolder}
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/objects')}>К объектам</Button>
      <div className="page-heading">
        <div>
          <Typography.Title level={2}>{loading ? 'Загрузка…' : object?.name}</Typography.Title>
          <Typography.Text type="secondary">{object?.address}</Typography.Text>
        </div>
        {profile?.role === 'setter' && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Новая задача</Button>
        )}
      </div>

      <Card>
        {object && <Descriptions items={[{ key: 'name', label: 'Объект', children: object.name }, { key: 'address', label: 'Адрес', children: object.address }]} />}
      </Card>

      <Typography.Title level={3} className="section-title">Задачи</Typography.Title>
      <Card>
        <Table<TaskRow>
          rowKey="id"
          loading={loading}
          dataSource={tasks}
          locale={{ emptyText: <Empty description="Задач пока нет" /> }}
          onRow={(task) => ({ onClick: () => navigate(`/tasks/${task.id}`), className: 'clickable-row' })}
          columns={[
            { title: 'Название', dataIndex: 'title', key: 'title' },
            { title: 'Исполнитель', key: 'assignee', render: (_, task) => task.assignee?.full_name ?? 'Не назначен' },
            { title: 'Статус', key: 'status', render: (_, task) => <TaskStatusTag status={task.status} /> },
            { title: 'Архив', key: 'archive', responsive: ['md'], render: (_, task) => task.archived_at ? 'Да' : '—' },
          ]}
        />
      </Card>

      <Modal title="Новая задача" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} confirmLoading={saving} okText="Создать" cancelText="Отмена">
        <Form form={form} layout="vertical" onFinish={createTask} requiredMark={false}>
          <Form.Item name="title" label="Название" validateFirst rules={[{ required: true }, { whitespace: true }, { min: 2 }]}><Input /></Form.Item>
          <Form.Item name="description" label="Описание" validateFirst rules={[{ required: true }, { whitespace: true }]}><Input.TextArea rows={4} /></Form.Item>
          <Form.Item name="assignee_id" label="Исполнитель">
            <Select allowClear placeholder="Можно назначить позже" options={executors.map((item) => ({ value: item.id, label: item.full_name }))} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
