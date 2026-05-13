import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

loadDotEnv();

const args = new Set(process.argv.slice(2));
const deployToCapRover = args.has('--deploy-caprover');

const registry = process.env.DEPLOY_REGISTRY || 'reg.volobuev.keenetic.pro';
const imageName = process.env.DEPLOY_IMAGE || 'getgantt';
const imageSource =
  process.env.IMAGE_SOURCE || getGitOutput(['remote', 'get-url', 'origin']) || 'https://github.com/simon100500/gantt-lib-mcp.git';
const fullSha = getRequiredGitOutput(['rev-parse', 'HEAD']);
const shortSha = getRequiredGitOutput(['rev-parse', '--short', 'HEAD']);
const buildDate = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

const latestTag = `${registry}/${imageName}:latest`;
const shaTag = `${registry}/${imageName}:sha-${shortSha}`;

console.log(`Building image ${latestTag}`);
console.log(`Commit SHA: ${fullSha}`);

run('docker', [
  'build',
  '--build-arg',
  `VCS_REF=${fullSha}`,
  '--build-arg',
  `BUILD_DATE=${buildDate}`,
  '--build-arg',
  `IMAGE_SOURCE=${imageSource}`,
  '-t',
  latestTag,
  '-t',
  shaTag,
  '.',
]);

console.log(`Pushing image ${latestTag}`);
run('docker', ['push', latestTag]);

console.log(`Pushing image ${shaTag}`);
run('docker', ['push', shaTag]);

if (deployToCapRover) {
  const caproverUrl = process.env.CAPROVER_URL || process.env.CAPROVER_SERVER;
  const caproverAppName = process.env.CAPROVER_APP_NAME;
  const caproverAppToken = process.env.CAPROVER_APP_TOKEN;

  requireEnv('CAPROVER_SERVER or CAPROVER_URL', caproverUrl);
  requireEnv('CAPROVER_APP_NAME', caproverAppName);
  requireEnv('CAPROVER_APP_TOKEN', caproverAppToken);

  console.log(`Deploying ${shaTag} to CapRover app ${caproverAppName}`);
  run(
    'npx',
    [
      'caprover',
      'deploy',
      '--caproverUrl',
      caproverUrl,
      '--appName',
      caproverAppName,
      '--appToken',
      caproverAppToken,
      '--imageName',
      shaTag,
    ],
  );
}

console.log('');
console.log('Deploy image in CapRover:');
console.log(shaTag);

function getRequiredGitOutput(args) {
  const value = getGitOutput(args);
  if (!value) {
    console.error(`Failed to read git ${args.join(' ')}`);
    process.exit(1);
  }
  return value;
}

function getGitOutput(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    return '';
  }

  return result.stdout.trim();
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

function loadDotEnv() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(scriptDir, '../.env');

  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}
