// Test login flow and /api/tasks endpoint
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env
dotenv.config({ path: join(__dirname, '.env') });

// Request OTP
console.log('1. Requesting OTP for test@example.com...');
let resp = await fetch('http://localhost:3000/api/auth/request-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test@example.com' })
});
console.log('   Status:', resp.status);

// Verify OTP (bypassed in dev)
console.log('2. Verifying OTP...');
resp = await fetch('http://localhost:3000/api/auth/verify-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test@example.com', code: '000000' })
});
const data = await resp.json();
console.log('   Status:', resp.status);
console.log('   User:', data.user?.email);
console.log('   Project:', data.project?.name);

if (data.accessToken) {
  // Test /api/tasks
  console.log('3. Testing /api/tasks...');
  const tasksResp = await fetch('http://localhost:3000/api/tasks', {
    headers: { 'Authorization': 'Bearer ' + data.accessToken }
  });
  const tasks = await tasksResp.json();
  console.log('   Status:', tasksResp.status);
  console.log('   Tasks count:', tasks.length);
  if (tasks.length > 0) {
    console.log('   Tasks:');
    for (const task of tasks) {
      console.log('     -', task.name, '(' + task.id + ')');
      if (task.dependencies && task.dependencies.length > 0) {
        console.log('       Dependencies:', task.dependencies.length);
      }
    }
  } else {
    console.log('   ERROR: No tasks returned!');
  }
}
