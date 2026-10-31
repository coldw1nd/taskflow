-- Типовые запросы TaskFlow. Параметры ? передаются через prepared statements.

-- Получение списка задач пользователя (страница 1, 10 записей).
SELECT id, title, status, deadline, created_at, completed_at
FROM tasks
WHERE user_id = ?
ORDER BY created_at DESC, id DESC
LIMIT ? OFFSET ?;

-- Фильтрация по статусу.
SELECT id, title, status, created_at
FROM tasks
WHERE user_id = ? AND status = ?
ORDER BY created_at DESC, id DESC
LIMIT ? OFFSET ?;

-- Фильтрация по тегу, принадлежащему пользователю.
SELECT t.id, t.title, t.status, t.created_at
FROM tasks AS t
WHERE t.user_id = ?
  AND EXISTS (
    SELECT 1
    FROM task_tags AS tt
    JOIN tags AS g ON g.id = tt.tag_id
    WHERE tt.task_id = t.id AND tt.tag_id = ? AND g.user_id = ?
  )
ORDER BY t.created_at DESC, t.id DESC;

-- Добавление задачи. Перед выполнением приложение проверяет дедлайн и tagIds.
INSERT INTO tasks(title, status, deadline, created_at, completed_at, user_id)
VALUES (?, 'active', ?, ?, NULL, ?);

-- Частичное обновление статуса.
UPDATE tasks
SET status = ?, completed_at = ?
WHERE id = ? AND user_id = ?;

-- Удаление задачи владельцем. Связи task_tags удаляются каскадно.
DELETE FROM tasks WHERE id = ? AND user_id = ?;
