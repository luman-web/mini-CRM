import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Space, Typography, message } from 'antd'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'

type LoginValues = { email: string; password: string }

export function LoginPage() {
  const { signIn } = useAuth()
  const [loading, setLoading] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  const handleLogin = async ({ email, password }: LoginValues) => {
    setLoading(true)
    const error = await signIn(email, password)
    setLoading(false)
    if (error) messageApi.error(error)
  }

  return (
    <>
      {contextHolder}
      <main className="login-page">
        <Card className="login-card" variant="borderless">
          <Space orientation="vertical" size={24} className="full-width">
            <div>
              <Typography.Text className="eyebrow">МИНИ-CRM</Typography.Text>
              <Typography.Title level={2}>Объекты и задачи</Typography.Title>
              <Typography.Text type="secondary">
                Войдите под учётной записью постановщика или исполнителя.
              </Typography.Text>
            </div>

            {!isSupabaseConfigured && (
              <Alert
                type="warning"
                showIcon
                title="Supabase пока не подключён"
                description="Скопируйте .env.example в .env и укажите URL проекта и publishable key."
              />
            )}

            <Form<LoginValues>
              layout="vertical"
              requiredMark={false}
              onFinish={handleLogin}
              disabled={!isSupabaseConfigured}
            >
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: 'Введите email' },
                  { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Введите корректный email' },
                ]}
              >
                <Input prefix={<MailOutlined />} size="large" placeholder="name@company.ru" />
              </Form.Item>
              <Form.Item name="password" label="Пароль" rules={[{ required: true, message: 'Введите пароль' }]}>
                <Input.Password prefix={<LockOutlined />} size="large" placeholder="Пароль" />
              </Form.Item>
              <Button type="primary" htmlType="submit" size="large" loading={loading} block>
                Войти
              </Button>
            </Form>

            <Typography.Text type="secondary" className="login-note">
              Самостоятельная регистрация отключена. Учётные записи создаёт администратор.
            </Typography.Text>
          </Space>
        </Card>
      </main>
    </>
  )
}
