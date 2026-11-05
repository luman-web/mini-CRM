import { EnvironmentOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Empty, Form, Input, Modal, Row, Skeleton, Space, Typography, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errorMessage'
import type { ObjectRow } from '../types'

type ObjectFormValues = { name: string; address: string }

export function ObjectsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [objects, setObjects] = useState<ObjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<ObjectFormValues>()
  const [messageApi, contextHolder] = message.useMessage()

  const loadObjects = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    const { data, error: queryError } = await supabase
      .from('objects')
      .select('id, name, address, created_by, created_at, updated_at, tasks(count)')
      .order('created_at', { ascending: false })

    setLoading(false)
    if (queryError) {
      setError(errorMessage(queryError, 'Не удалось загрузить объекты'))
      return
    }
    setObjects((data ?? []) as ObjectRow[])
    setError(null)
  }, [])

  useEffect(() => { loadObjects() }, [loadObjects])

  const createObject = async (values: ObjectFormValues) => {
    if (!supabase || !profile) return
    setSaving(true)
    const { error: insertError } = await supabase.from('objects').insert({
      name: values.name.trim(),
      address: values.address.trim(),
      created_by: profile.id,
    })
    setSaving(false)

    if (insertError) {
      messageApi.error(errorMessage(insertError, 'Не удалось создать объект'))
      return
    }
    messageApi.success('Объект создан')
    form.resetFields()
    setModalOpen(false)
    loadObjects()
  }

  return (
    <>
      {contextHolder}
      <div className="page-heading">
        <div>
          <Typography.Title level={2}>Объекты</Typography.Title>
          <Typography.Text type="secondary">Стройки и задачи по ним</Typography.Text>
        </div>
        {profile?.role === 'setter' && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Новый объект
          </Button>
        )}
      </div>

      {error && <Alert type="error" showIcon title="Не удалось загрузить объекты" description={error} />}
      {loading ? (
        <Row gutter={[16, 16]}>{[1, 2, 3].map((item) => <Col xs={24} md={12} xl={8} key={item}><Card><Skeleton active /></Card></Col>)}</Row>
      ) : objects.length === 0 ? (
        <Card><Empty description="Объектов пока нет" /></Card>
      ) : (
        <Row gutter={[16, 16]}>
          {objects.map((object) => (
            <Col xs={24} md={12} xl={8} key={object.id}>
              <Card hoverable onClick={() => navigate(`/objects/${object.id}`)} className="object-card">
                <Space orientation="vertical" size={12}>
                  <Typography.Title level={4}>{object.name}</Typography.Title>
                  <Typography.Text type="secondary"><EnvironmentOutlined /> {object.address}</Typography.Text>
                  <Typography.Text>{object.tasks?.[0]?.count ?? 0} задач</Typography.Text>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        title="Новый объект"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText="Создать"
        cancelText="Отмена"
      >
        <Form form={form} layout="vertical" onFinish={createObject} requiredMark={false}>
          <Form.Item name="name" label="Название" validateFirst rules={[{ required: true }, { whitespace: true }, { min: 2 }]}>
            <Input placeholder="ЖК Северный" />
          </Form.Item>
          <Form.Item name="address" label="Адрес" validateFirst rules={[{ required: true }, { whitespace: true }, { min: 3 }]}>
            <Input placeholder="ул. Строителей, 10" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
