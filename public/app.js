const API_BASE = '/api';
const TOKEN_KEY = 'taskflow_token';

let token = localStorage.getItem(TOKEN_KEY) || '';
let currentStatusFilter = '';

function $(id) {
  return document.getElementById(id);
}

function showError(element, message) {
  element.textContent = message;
  element.classList.remove('hidden');
}

function clearError(element) {
  element.textContent = '';
  element.classList.add('hidden');
}

function setToken(value) {
  token = value;
  localStorage.setItem(TOKEN_KEY, value);
}

function clearToken() {
  token = '';
  localStorage.removeItem(TOKEN_KEY);
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(API_BASE + path, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch (error) {
    throw new Error('Сервер недоступен. Проверьте, запущен ли бэкенд.');
  }

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error?.message || `Ошибка запроса: ${response.status}`
    );
  }

  return data;
}

function showAuthView() {
  $('auth-view').classList.remove('hidden');
  $('app-view').classList.add('hidden');
}

function showAppView() {
  $('auth-view').classList.add('hidden');
  $('app-view').classList.remove('hidden');
}

async function enterApp(email) {
  $('user-email').textContent = email;
  showAppView();
  await loadAll();
}

async function tryEnterApp() {
  try {
    const user = await api('/auth/me');
    await enterApp(user.email);
  } catch (error) {
    clearToken();
    showAuthView();
  }
}

async function loadAll() {
  await Promise.all([loadTags(), loadTasks()]);
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('ru-RU');
}

function renderTask(task) {
  const li = document.createElement('li');
  li.className = 'task-item';

  const main = document.createElement('div');
  main.className = 'task-main';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = task.status === 'completed';

  checkbox.addEventListener('change', async () => {
    checkbox.disabled = true;

    try {
      await api(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: {
          status: checkbox.checked ? 'completed' : 'active'
        }
      });

      await loadTasks();
    } catch (error) {
      alert(error.message);
      checkbox.disabled = false;
    }
  });

  const content = document.createElement('div');
  content.className = 'task-content';

  const title = document.createElement('span');
  title.textContent = task.title;
  title.className = `task-title ${
    task.status === 'completed' ? 'completed' : ''
  }`;

  const meta = document.createElement('div');
  meta.className = 'task-meta';

  const created = document.createElement('div');
  created.textContent = `Создана: ${formatDate(task.created_at)}`;
  meta.appendChild(created);

  if (task.deadline) {
    const deadline = document.createElement('div');
    deadline.textContent = `Дедлайн: ${formatDate(task.deadline)}`;

    if (
      task.status === 'active' &&
      new Date(task.deadline).getTime() < Date.now()
    ) {
      deadline.classList.add('overdue');
    }

    meta.appendChild(deadline);
  }

  if (task.completed_at) {
    const completedAt = document.createElement('div');
    completedAt.textContent = `Выполнена: ${formatDate(task.completed_at)}`;
    meta.appendChild(completedAt);
  }

  if (task.tags && task.tags.length > 0) {
    const tags = document.createElement('div');
    tags.textContent = `Теги: ${task.tags.map((tag) => tag.name).join(', ')}`;
    meta.appendChild(tags);
  }

  content.appendChild(title);
  content.appendChild(meta);

  main.appendChild(checkbox);
  main.appendChild(content);

  const deleteButton = document.createElement('button');
  deleteButton.textContent = 'Удалить';
  deleteButton.className = 'task-delete-btn';

  deleteButton.addEventListener('click', async () => {
    if (!confirm('Удалить задачу?')) {
      return;
    }

    try {
      await api(`/tasks/${task.id}`, {
        method: 'DELETE'
      });

      await loadTasks();
    } catch (error) {
      alert(error.message);
    }
  });

  li.appendChild(main);
  li.appendChild(deleteButton);

  $('task-list').appendChild(li);
}

async function loadTasks() {
  const list = $('task-list');
  const loading = $('tasks-loading');
  const empty = $('tasks-empty');
  const error = $('tasks-error');

  list.innerHTML = '';
  clearError(error);
  empty.classList.add('hidden');
  loading.classList.remove('hidden');

  try {
    const query = new URLSearchParams();

    if (currentStatusFilter) {
      query.set('status', currentStatusFilter);
    }

    query.set('limit', '100');

    const data = await api(`/tasks?${query.toString()}`);

    if (!data.items.length) {
      empty.classList.remove('hidden');
      return;
    }

    data.items.forEach(renderTask);
  } catch (err) {
    showError(error, err.message);
  } finally {
    loading.classList.add('hidden');
  }
}

function renderTagCheckboxes(tags) {
  const container = $('tag-checkboxes');
  container.innerHTML = '';

  if (!tags.length) {
    container.textContent = 'Тегов пока нет. Создайте тег ниже.';
    return;
  }

  container.className = 'tag-checkboxes';

  for (const tag of tags) {
    const label = document.createElement('label');
    label.className = 'tag-checkbox';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = tag.id;

    const text = document.createElement('span');
    text.textContent = tag.name;

    label.appendChild(checkbox);
    label.appendChild(text);

    container.appendChild(label);
  }
}

function renderTagList(tags) {
  const list = $('tag-list');
  list.innerHTML = '';

  if (!tags.length) {
    const li = document.createElement('li');
    li.textContent = 'Тегов пока нет.';
    list.appendChild(li);
    return;
  }

  for (const tag of tags) {
    const li = document.createElement('li');
    li.className = 'tag-item';

    const name = document.createElement('span');
    name.textContent = tag.name;

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Удалить';
    deleteButton.className = 'tag-delete-btn';

    deleteButton.addEventListener('click', async () => {
      if (!confirm(`Удалить тег "${tag.name}"?`)) {
        return;
      }

      try {
        await api(`/tags/${tag.id}`, {
          method: 'DELETE'
        });

        await loadTags();
        await loadTasks();
      } catch (error) {
        alert(error.message);
      }
    });

    li.appendChild(name);
    li.appendChild(deleteButton);

    list.appendChild(li);
  }
}

async function loadTags() {
  try {
    const tags = await api('/tags');
    renderTagList(tags);
    renderTagCheckboxes(tags);
  } catch (error) {
    showError($('global-message'), error.message);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  clearError($('auth-message'));

  const email = $('login-email').value.trim();
  const password = $('login-password').value;

  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: { email, password }
    });

    setToken(data.token);
    await enterApp(data.user.email);
  } catch (error) {
    showError($('auth-message'), error.message);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  clearError($('auth-message'));

  const email = $('register-email').value.trim();
  const password = $('register-password').value;

  try {
    await api('/auth/register', {
      method: 'POST',
      body: { email, password }
    });

    const loginData = await api('/auth/login', {
      method: 'POST',
      body: { email, password }
    });

    setToken(loginData.token);
    await enterApp(loginData.user.email);
  } catch (error) {
    showError($('auth-message'), error.message);
  }
}

async function handleCreateTask(event) {
  event.preventDefault();
  clearError($('global-message'));

  const title = $('task-title').value.trim();
  const deadline = $('task-deadline').value || null;

  const tagIds = Array.from(
    document.querySelectorAll('#tag-checkboxes input:checked')
  ).map((input) => Number(input.value));

  if (!title) {
    showError($('global-message'), 'Введите название задачи');
    return;
  }

  try {
    await api('/tasks', {
      method: 'POST',
      body: {
        title,
        deadline,
        tagIds
      }
    });

    $('task-form').reset();
    await loadTasks();
  } catch (error) {
    showError($('global-message'), error.message);
  }
}

async function handleCreateTag(event) {
  event.preventDefault();
  clearError($('global-message'));

  const name = $('tag-name').value.trim();

  if (!name) {
    showError($('global-message'), 'Введите название тега');
    return;
  }

  try {
    await api('/tags', {
      method: 'POST',
      body: { name }
    });

    $('tag-form').reset();
    await loadTags();
  } catch (error) {
    showError($('global-message'), error.message);
  }
}

function bindEvents() {
  $('show-login').addEventListener('click', () => {
    $('login-form').classList.remove('hidden');
    $('register-form').classList.add('hidden');
    clearError($('auth-message'));
  });

  $('show-register').addEventListener('click', () => {
    $('register-form').classList.remove('hidden');
    $('login-form').classList.add('hidden');
    clearError($('auth-message'));
  });

  $('login-form').addEventListener('submit', handleLogin);
  $('register-form').addEventListener('submit', handleRegister);

  $('logout-btn').addEventListener('click', () => {
    clearToken();
    showAuthView();
  });

  $('task-form').addEventListener('submit', handleCreateTask);
  $('tag-form').addEventListener('submit', handleCreateTag);

  $('status-filter').addEventListener('change', (event) => {
    currentStatusFilter = event.target.value;
    loadTasks();
  });

  $('refresh-tasks').addEventListener('click', () => {
    loadTasks();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();

  if (token) {
    await tryEnterApp();
  } else {
    showAuthView();
  }
});