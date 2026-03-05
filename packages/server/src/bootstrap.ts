/**
 * Bootstrap entry point — loads .env before importing server
 *
 * ES module imports are hoisted and evaluated before any module code runs.
 * This bootstrap loads dotenv first, then dynamically imports the real entry point.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = process.env.GANTT_PROJECT_ROOT ?? join(__dirname, '../../..');

// Load .env BEFORE any server imports (auth.ts validates JWT_SECRET at import time)
dotenv.config({ path: join(PROJECT_ROOT, '.env') });

// Dynamic import to ensure dotenv loads first
await import('./index.js');
