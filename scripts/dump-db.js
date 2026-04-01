import { accessSync, constants, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const envPath = resolve(repoRoot, '.env');

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }

  const content = readFileSync(path, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();

    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      const closingIndex = value.indexOf(quote, 1);
      if (closingIndex !== -1) {
        value = value.slice(1, closingIndex);
      } else {
        value = value.slice(1);
      }
    } else {
      const commentIndex = value.indexOf(' #');
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    process.env[key] = value;
  }
}

function timestampForFilename(date = new Date()) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function canExecute(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function fileNameForMount(path) {
  return path.split(/[\\/]/).pop();
}

function buildDockerDatabaseUrl(databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
    parsed.hostname = 'host.docker.internal';
  }
  return parsed.toString();
}

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options,
    });

    child.on('error', (error) => {
      resolvePromise({ ok: false, code: null, error });
    });

    child.on('exit', (code) => {
      resolvePromise({ ok: code === 0, code, error: null });
    });
  });
}

loadEnvFile(envPath);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Put it in the root .env or export it before running.');
  process.exit(1);
}

const requestedOutput = process.argv[2];
const outputPath = requestedOutput
  ? resolve(process.cwd(), requestedOutput)
  : resolve(repoRoot, `backup-${timestampForFilename()}.dump`);

mkdirSync(dirname(outputPath), { recursive: true });

const mode = (process.env.DB_DUMP_MODE || 'docker').toLowerCase();
const localPgDump = process.env.PG_DUMP_PATH || 'pg_dump';
const dockerImage = process.env.PG_DUMP_DOCKER_IMAGE || 'postgres:17';

async function dumpWithLocalPgDump() {
  if (process.env.PG_DUMP_PATH && !canExecute(process.env.PG_DUMP_PATH)) {
    return { ok: false, reason: `PG_DUMP_PATH is not executable: ${process.env.PG_DUMP_PATH}` };
  }

  console.log(`Creating PostgreSQL dump: ${outputPath}`);
  console.log(`Using local command: ${localPgDump}`);

  const result = await runCommand(localPgDump, [
    `--file=${outputPath}`,
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    databaseUrl,
  ]);

  if (result.ok) {
    return { ok: true };
  }

  if (result.error) {
    return { ok: false, reason: result.error.message };
  }

  return { ok: false, reason: `pg_dump exited with code ${result.code}` };
}

async function dumpWithDocker() {
  const outputDir = dirname(outputPath);
  const outputName = fileNameForMount(outputPath);
  const dockerDatabaseUrl = buildDockerDatabaseUrl(databaseUrl);

  console.log(`Creating PostgreSQL dump: ${outputPath}`);
  console.log(`Using Docker image: ${dockerImage}`);

  const dockerArgs = [
    'run',
    '--rm',
    '--add-host',
    'host.docker.internal:host-gateway',
    '-v',
    `${outputDir}:/backup`,
    dockerImage,
    'pg_dump',
    `--file=/backup/${outputName}`,
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    dockerDatabaseUrl,
  ];

  const result = await runCommand('docker', dockerArgs);
  if (result.ok) {
    return { ok: true };
  }

  if (result.error) {
    return { ok: false, reason: result.error.message };
  }

  return { ok: false, reason: `docker pg_dump exited with code ${result.code}` };
}

async function main() {
  if (mode === 'auto') {
    const localResult = await dumpWithLocalPgDump();
    if (localResult.ok) {
      console.log(`Dump created successfully: ${outputPath}`);
      return;
    }

    console.warn(`Local pg_dump unavailable: ${localResult.reason}`);
    console.warn('Falling back to Docker...');

    const dockerResult = await dumpWithDocker();
    if (!dockerResult.ok) {
      console.error(dockerResult.reason);
      process.exit(1);
    }

    console.log(`Dump created successfully: ${outputPath}`);
    return;
  }

  if (mode === 'local') {
    const result = await dumpWithLocalPgDump();
    if (!result.ok) {
      console.error(result.reason);
      process.exit(1);
    }
    console.log(`Dump created successfully: ${outputPath}`);
    return;
  }

  if (mode === 'docker') {
    const result = await dumpWithDocker();
    if (!result.ok) {
      console.error(result.reason);
      process.exit(1);
    }
    console.log(`Dump created successfully: ${outputPath}`);
    return;
  }

  console.error(`Unsupported DB_DUMP_MODE: ${mode}. Use docker, local, or auto.`);
  process.exit(1);
}

await main();
