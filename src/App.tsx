import { Alert, Button, ConfigProvider, Result, Spin } from 'antd'
import ruRU from 'antd/locale/ru_RU'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { AppLayout } from './components/AppLayout'
import { ObjectPage } from './pages/ObjectPage'
import { ObjectsPage } from './pages/ObjectsPage'
import { LoginPage } from './pages/LoginPage'
import { MyTasksPage } from './pages/MyTasksPage'
import { TaskPage } from './pages/TaskPage'
import './App.css'

function ProtectedRoutes() {
  const { session, profile, loading, error, signOut } = useAuth()

  if (loading) return <div className="app-loading"><Spin size="large" /></div>
  if (!session) return <LoginPage />
  if (error || !profile) {
    return (
      <div className="app-loading">
        <Alert
          type="error"
          showIcon
          title="Профиль пользователя не настроен"
          description={error}
          action={<Button onClick={signOut}>Выйти</Button>}
        />
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/objects" replace />} />
        <Route path="objects" element={<ObjectsPage />} />
        <Route path="objects/:id" element={<ObjectPage />} />
        <Route path="tasks/:id" element={<TaskPage />} />
        <Route
          path="my-tasks"
          element={profile.role === 'executor' ? <MyTasksPage /> : <Navigate to="/objects" replace />}
        />
        <Route path="*" element={<Result status="404" title="Страница не найдена" extra={<Button href="/objects">К объектам</Button>} />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <ConfigProvider
      locale={ruRU}
      form={{
        validateMessages: {
          required: 'Поле «${label}» обязательно',
          whitespace: 'Поле «${label}» не может состоять только из пробелов',
          string: {
            min: 'Поле «${label}» должно содержать не менее ${min} символов',
            max: 'Поле «${label}» должно содержать не более ${max} символов',
          },
        },
      }}
      theme={{
        token: {
          colorPrimary: '#2563eb',
          borderRadius: 10,
          fontFamily: 'Inter, system-ui, sans-serif',
        },
      }}
    >
      <BrowserRouter>
        <AuthProvider>
          <ProtectedRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ConfigProvider>
  )
}

export default App
