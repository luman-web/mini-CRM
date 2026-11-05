import { BellOutlined, CheckOutlined, InboxOutlined } from '@ant-design/icons'
import { Badge, Button, Dropdown, Empty, Spin, Typography, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { NotificationKind, TaskNotification } from '../types'

const notificationText: Record<NotificationKind, string> = {
  assigned: 'Вам назначена новая задача',
  updated: 'Данные задачи изменены',
  submitted: 'Исполнитель отправил задачу на проверку',
  revision: 'Задача возвращена на доработку',
  accepted: 'Результат задачи принят',
  archived: 'Задача перемещена в архив',
  restored: 'Задача восстановлена из архива',
}

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function NotificationsBell() {
  const [notifications, setNotifications] = useState<TaskNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const loadNotifications = useCallback(async (silent = false) => {
    if (!supabase) return
    if (!silent) setLoading(true)

    const { data, error } = await supabase
      .from('notifications')
      .select('id, task_id, actor_id, kind, read_at, created_at, task:tasks!notifications_task_id_fkey(id, title, status, archived_at), actor:profiles!notifications_actor_id_fkey(id, full_name)')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      if (!silent) message.error('Не удалось загрузить уведомления')
    } else {
      setNotifications((data ?? []) as unknown as TaskNotification[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadNotifications()
    const interval = window.setInterval(() => loadNotifications(true), 30_000)
    return () => window.clearInterval(interval)
  }, [loadNotifications, location.pathname])

  const unreadCount = notifications.filter((item) => !item.read_at).length

  const openNotification = async (notification: TaskNotification) => {
    if (!notification.read_at) {
      const readAt = new Date().toISOString()
      setNotifications((items) => items.map((item) => (
        item.id === notification.id ? { ...item, read_at: readAt } : item
      )))
      await supabase?.from('notifications').update({ read_at: readAt }).eq('id', notification.id)
    }
    setOpen(false)
    navigate(`/tasks/${notification.task_id}`)
  }

  const markAllRead = async () => {
    const readAt = new Date().toISOString()
    setNotifications((items) => items.map((item) => ({ ...item, read_at: item.read_at ?? readAt })))
    const { error } = await supabase?.from('notifications').update({ read_at: readAt }).is('read_at', null) ?? { error: null }
    if (error) {
      message.error('Не удалось отметить уведомления прочитанными')
      loadNotifications(true)
    }
  }

  const content = (
    <div className="notifications-panel">
      <div className="notifications-heading">
        <Typography.Text strong>Уведомления</Typography.Text>
        {unreadCount > 0 && (
          <Button type="link" size="small" icon={<CheckOutlined />} onClick={markAllRead}>
            Прочитать все
          </Button>
        )}
      </div>
      {loading ? (
        <div className="notifications-loading"><Spin size="small" /></div>
      ) : notifications.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Новых событий нет" />
      ) : (
        <div className="notifications-list">
          {notifications.map((notification) => (
            <button
              type="button"
              key={notification.id}
              className={`notification-item${notification.read_at ? '' : ' notification-unread'}`}
              onClick={() => openNotification(notification)}
            >
              <InboxOutlined className="notification-icon" />
              <span className="notification-content">
                <Typography.Text strong>{notificationText[notification.kind]}</Typography.Text>
                <Typography.Text ellipsis>{notification.task?.title ?? 'Задача'}</Typography.Text>
                <Typography.Text type="secondary" className="notification-meta">
                  {notification.actor?.full_name} · {dateFormatter.format(new Date(notification.created_at))}
                </Typography.Text>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      popupRender={() => content}
      trigger={['click']}
      placement="bottomRight"
    >
      <Badge count={unreadCount} size="small" overflowCount={99}>
        <Button type="text" icon={<BellOutlined />} aria-label={`Уведомления: ${unreadCount} непрочитанных`} />
      </Badge>
    </Dropdown>
  )
}
