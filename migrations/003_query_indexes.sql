-- Составные индексы для частого списка задач пользователя и фильтрации.
CREATE INDEX IF NOT EXISTS idx_tasks_user_created_id
  ON tasks(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status_created_id
  ON tasks(user_id, status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_task_tags_tag_task
  ON task_tags(tag_id, task_id);
