const databaseMessages: Array<[string, string]> = [
  ['A task must be created active and in the new status', 'Задача должна создаваться активной и в статусе «Новая»'],
  ['Task author must be the current user', 'Автором задачи должен быть текущий пользователь'],
  ['Task author and creation date are immutable', 'Нельзя изменить автора и дату создания задачи'],
  ['Task status can only be changed with transition_task()', 'Статус задачи можно изменить только разрешённым действием'],
  ['Status transition cannot modify task fields', 'При изменении статуса нельзя одновременно редактировать поля задачи'],
  ['Use archive_task() or restore_task()', 'Используйте действие архивирования или восстановления'],
  ['Only an active new task can be edited', 'Редактировать можно только активную новую задачу'],
  ['Only a setter can edit a task', 'Редактировать задачу может только постановщик'],
  ['Only a setter can delete a task', 'Удалить задачу может только постановщик'],
  ['Only an active, unassigned new task can be deleted', 'Удалить можно только активную неназначенную задачу в статусе «Новая»'],
  ['Task assignee must have the executor role', 'Назначить задачу можно только исполнителю'],
  ['Authentication required', 'Необходимо войти в систему'],
  ['Task not found', 'Задача не найдена или недоступна'],
  ['Archived task cannot change status', 'Нельзя изменить статус архивной задачи'],
  ['Status transition is not allowed for this user', 'Это изменение статуса вам недоступно'],
  ['Only a setter can archive tasks', 'Архивировать задачи может только постановщик'],
  ['Task is already archived', 'Задача уже находится в архиве'],
  ['Only a setter can restore tasks', 'Восстановить задачу может только постановщик'],
  ['Task is not archived', 'Задача не находится в архиве'],
  ['An object with tasks cannot be deleted', 'Нельзя удалить объект, у которого есть задачи'],
]

export function errorMessage(error: { message?: string } | null | undefined, fallback = 'Не удалось выполнить действие') {
  const original = error?.message
  if (!original) return fallback

  const translated = databaseMessages.find(([source]) => original.includes(source))
  if (translated) return translated[1]
  if (original.includes('violates check constraint')) return 'Проверьте правильность заполнения полей'
  if (original.includes('duplicate key value')) return 'Такая запись уже существует'
  if (original.includes('permission denied') || original.includes('row-level security')) return 'Недостаточно прав для выполнения действия'
  if (original.includes('Cannot coerce the result to a single JSON object')) return 'Запись не найдена или недоступна'

  return fallback
}
