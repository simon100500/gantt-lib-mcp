import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env BEFORE importing server code
dotenv.config({ path: join(__dirname, '.env') });

// Now import after dotenv is loaded
const { signAccessToken, signRefreshToken } = await import('./packages/server/dist/auth.js');
const { createClient } = await import('@libsql/client');

// Simulate the login flow from auth-routes.ts
const userId = crypto.randomUUID();
const email = 'test@example.com';
const projectId = crypto.randomUUID();
const sessionId = crypto.randomUUID();

const tokenPayload = {
  sub: userId,
  email,
  projectId,
  sessionId
};

const accessToken = signAccessToken(tokenPayload);
const refreshToken = signRefreshToken(tokenPayload);

console.log('userId:', userId);
console.log('projectId:', projectId);
console.log('accessToken:', accessToken.substring(0, 50) + '...');

// Create user, project, session directly in DB
const db = createClient({ url: 'file:gantt.db' });

// Insert user
await db.execute({
  sql: 'INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)',
  args: [userId, email, new Date().toISOString()]
});

// Insert project
await db.execute({
  sql: 'INSERT INTO projects (id, user_id, name, created_at) VALUES (?, ?, ?, ?)',
  args: [projectId, userId, 'Test Project', new Date().toISOString()]
});

// Insert session
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
await db.execute({
  sql: 'INSERT INTO sessions (id, user_id, project_id, access_token, refresh_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  args: [sessionId, userId, projectId, accessToken, refreshToken, expiresAt, new Date().toISOString()]
});

console.log('User, project, session created');

// Test /api/tasks
const response = await fetch('http://localhost:3000/api/tasks', {
  headers: {
    'Authorization': 'Bearer ' + accessToken
  }
});
console.log('Response status:', response.status);
const data = await response.json();
console.log('Tasks returned:', data.length);
console.log('Tasks:', JSON.stringify(data, null, 2));
