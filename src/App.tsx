import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { Alert, Button, Card, ConfigProvider, Form, Input, Space, Typography, message } from 'antd'
import { useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import './App.css'

type LoginValues = {
  email: string
  password: string
}

function App() {
  const [loading, setLoading] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  const handleLogin = async ({ email, password }: LoginValues) => {
    if (!supabase) return

    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (error) {
      messageApi.error('Не удалось войти. Проверьте email и пароль.')
      return
    }

    messageApi.success('Вход выполнен')
  }

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#2563eb',
          borderRadius: 10,
          fontFamily: 'Inter, system-ui, sans-serif',
        },
      }}
    >
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
                message="Supabase пока не подключён"
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
                  { type: 'email', message: 'Введите корректный email' },
                ]}
              >
                <Input prefix={<MailOutlined />} size="large" placeholder="name@company.ru" />
              </Form.Item>

              <Form.Item
                name="password"
                label="Пароль"
                rules={[{ required: true, message: 'Введите пароль' }]}
              >
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
    </ConfigProvider>
  )
}

export default App
