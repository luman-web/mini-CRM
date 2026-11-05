import { ApartmentOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { Avatar, Button, Layout, Menu, Space, Tag, Typography } from 'antd'
import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { NotificationsBell } from './NotificationsBell'

const { Header, Sider, Content } = Layout

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const menuItems = [
    { key: '/objects', icon: <ApartmentOutlined />, label: 'Объекты' },
    ...(profile?.role === 'executor'
      ? [{ key: '/my-tasks', icon: <UnorderedListOutlined />, label: 'Мои задачи' }]
      : []),
  ]

  const selectedKey = location.pathname.startsWith('/my-tasks') ? '/my-tasks' : '/objects'

  return (
    <Layout className="app-layout">
      <Sider collapsible collapsed={collapsed} trigger={null} breakpoint="lg" onBreakpoint={setCollapsed}>
        <div className="app-logo">{collapsed ? 'CRM' : 'МИНИ-CRM'}</div>
        <Menu theme="dark" mode="inline" selectedKeys={[selectedKey]} items={menuItems} onClick={({ key }) => navigate(key)} />
      </Sider>
      <Layout>
        <Header className="app-header">
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((value) => !value)}
          />
          <Space>
            <NotificationsBell />
            <Avatar>{profile?.full_name.slice(0, 1)}</Avatar>
            <div className="user-summary">
              <Typography.Text strong>{profile?.full_name}</Typography.Text>
              <Tag color={profile?.role === 'setter' ? 'purple' : 'blue'}>
                {profile?.role === 'setter' ? 'Постановщик' : 'Исполнитель'}
              </Tag>
            </div>
            <Button type="text" icon={<LogoutOutlined />} onClick={signOut} aria-label="Выйти" />
          </Space>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
