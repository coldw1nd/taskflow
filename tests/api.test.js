process.env.DB_FILE = ':memory:';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const { app, db } = require('../src/app');

const user1 = {
  email: 'user1@example.com',
  password: 'password123'
};

const user2 = {
  email: 'user2@example.com',
  password: 'password123'
};

let token1;
let token2;
let taskId;
let user1TagId;
let user2TagId;

function authHeader(token) {
  return {
    Authorization: `Bearer ${token}`
  };
}

afterAll(() => {
  db.close();
});

describe('health and auth', () => {
  beforeAll(async () => {
    await request(app)
      .post('/api/auth/register')
      .send(user1)
      .expect(201);

    await request(app)
      .post('/api/auth/register')
      .send(user2)
      .expect(201);

    const login1 = await request(app)
      .post('/api/auth/login')
      .send(user1)
      .expect(200);

    const login2 = await request(app)
      .post('/api/auth/login')
      .send(user2)
      .expect(200);

    token1 = login1.body.token;
    token2 = login2.body.token;
  });

  test('health check returns ok', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body.status).toBe('ok');
  });

  test('cannot register duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send(user1)
      .expect(409);
  });

  test('cannot login with wrong password', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({
        email: user1.email,
        password: 'wrongpassword'
      })
      .expect(401);
  });

  test('me endpoint requires token', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });

  test('me endpoint returns current user', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set(authHeader(token1))
      .expect(200);

    expect(response.body.email).toBe(user1.email);
  });
});

describe('tasks', () => {
  test('cannot create task without token', async () => {
    await request(app)
      .post('/api/tasks')
      .send({ title: 'Task without token' })
      .expect(401);
  });

  test('can create task', async () => {
    const response = await request(app)
      .post('/api/tasks')
      .set(authHeader(token1))
      .send({ title: 'Купить молоко' })
      .expect(201);

    taskId = response.body.id;

    expect(response.body.title).toBe('Купить молоко');
    expect(response.body.status).toBe('active');
    expect(response.body.user_id).toBeDefined();
  });

  test('cannot create task with empty title', async () => {
    await request(app)
      .post('/api/tasks')
      .set(authHeader(token1))
      .send({ title: '' })
      .expect(400);
  });

  test('cannot create task with past deadline', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    await request(app)
      .post('/api/tasks')
      .set(authHeader(token1))
      .send({
        title: 'Просроченная задача',
        deadline: yesterday
      })
      .expect(400);
  });

  test('can list own tasks', async () => {
    const response = await request(app)
      .get('/api/tasks')
      .set(authHeader(token1))
      .expect(200);

    expect(response.body.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(response.body.items)).toBe(true);
  });

  test('another user cannot access task', async () => {
    await request(app)
      .get(`/api/tasks/${taskId}`)
      .set(authHeader(token2))
      .expect(404);
  });

  test('can complete task', async () => {
    const response = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set(authHeader(token1))
      .send({ status: 'completed' })
      .expect(200);

    expect(response.body.status).toBe('completed');
    expect(response.body.completed_at).toBeTruthy();
  });

  test('can return task to active', async () => {
    const response = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set(authHeader(token1))
      .send({ status: 'active' })
      .expect(200);

    expect(response.body.status).toBe('active');
    expect(response.body.completed_at).toBeNull();
  });

  test('can delete task', async () => {
    await request(app)
      .delete(`/api/tasks/${taskId}`)
      .set(authHeader(token1))
      .expect(204);

    await request(app)
      .get(`/api/tasks/${taskId}`)
      .set(authHeader(token1))
      .expect(404);
  });
});

describe('tags and task-tag relation', () => {
  test('can create tag', async () => {
    const response = await request(app)
      .post('/api/tags')
      .set(authHeader(token1))
      .send({ name: 'Дом' })
      .expect(201);

    user1TagId = response.body.id;
    expect(response.body.name).toBe('Дом');
  });

  test('cannot create duplicate tag for same user', async () => {
    await request(app)
      .post('/api/tags')
      .set(authHeader(token1))
      .send({ name: 'Дом' })
      .expect(409);
  });

  test('user2 can create own tag', async () => {
    const response = await request(app)
      .post('/api/tags')
      .set(authHeader(token2))
      .send({ name: 'Работа' })
      .expect(201);

    user2TagId = response.body.id;
  });

  test('can create task with own tag', async () => {
    const response = await request(app)
      .post('/api/tasks')
      .set(authHeader(token1))
      .send({
        title: 'Задача с тегом',
        tagIds: [user1TagId]
      })
      .expect(201);

    expect(response.body.tags).toHaveLength(1);
    expect(response.body.tags[0].id).toBe(user1TagId);

    taskId = response.body.id;
  });

  test('cannot assign another user tag', async () => {
    await request(app)
      .post('/api/tasks')
      .set(authHeader(token1))
      .send({
        title: 'Попытка использовать чужой тег',
        tagIds: [user2TagId]
      })
      .expect(400);
  });

  test('can replace task tags', async () => {
    const response = await request(app)
      .put(`/api/tasks/${taskId}/tags`)
      .set(authHeader(token1))
      .send({ tagIds: [] })
      .expect(200);

    expect(response.body.tags).toHaveLength(0);
  });

  test('can delete tag', async () => {
    await request(app)
      .delete(`/api/tags/${user1TagId}`)
      .set(authHeader(token1))
      .expect(204);
  });
});