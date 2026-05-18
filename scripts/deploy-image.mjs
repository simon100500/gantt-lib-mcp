import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const args = new Set(argv);
const deployToCapRover = args.has('--deploy-caprover');
const target = getArgValue(argv, '--target') || 'default';

const targetConfig = getTargetConfig(target);
loadDotEnv('.env');
for (const envPath of targetConfig.extraEnvPaths) {
  loadDotEnv(envPath);
}

const registry = getFirstEnv(targetConfig.registryEnvNames) || 'reg.volobuev.keenetic.pro';
const imageName = getFirstEnv(targetConfig.imageEnvNames) || targetConfig.defaultImageName;
const imageSource =
  process.env.IMAGE_SOURCE || getGitOutput(['remote', 'get-url', 'origin']) || 'https://github.com/simon100500/gantt-lib-mcp.git';
const fullSha = getRequiredGitOutput(['rev-parse', 'HEAD']);
const shortSha = getRequiredGitOutput(['rev-parse', '--short', 'HEAD']);
const buildDate = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

const latestTag = `${registry}/${imageName}:latest`;
const shaTag = `${registry}/${imageName}:sha-${shortSha}`;

console.log(`Building image ${latestTag}`);
console.log(`Commit SHA: ${fullSha}`);

for (const envName of targetConfig.requiredEnvNames) {
  requireEnv(envName, process.env[envName]);
}

const buildArgs = [
  'build',
  '-f',
  targetConfig.dockerfilePath,
  '--build-arg',
  `VCS_REF=${fullSha}`,
  '--build-arg',
  `BUILD_DATE=${buildDate}`,
  '--build-arg',
  `IMAGE_SOURCE=${imageSource}`,
];

for (const buildArgName of targetConfig.buildArgNames) {
  const buildArgValue = process.env[buildArgName];
  if (!buildArgValue) {
    continue;
  }

  buildArgs.push('--build-arg', `${buildArgName}=${buildArgValue}`);
}

buildArgs.push('-t', latestTag, '-t', shaTag, '.');

run('docker', buildArgs);

console.log(`Pushing image ${latestTag}`);
run('docker', ['push', latestTag]);

console.log(`Pushing image ${shaTag}`);
run('docker', ['push', shaTag]);

if (deployToCapRover) {
  const caproverUrl = getFirstEnv(targetConfig.caproverUrlEnvNames);
  const caproverAppName = getFirstEnv(targetConfig.appNameEnvNames);
  const caproverAppToken = getFirstEnv(targetConfig.appTokenEnvNames);

  requireEnv(targetConfig.caproverUrlEnvNames.join(' or '), caproverUrl);
  requireEnv(targetConfig.appNameEnvNames.join(' or '), caproverAppName);
  requireEnv(targetConfig.appTokenEnvNames.join(' or '), caproverAppToken);

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

function getFirstEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }

  return '';
}

function getArgValue(argv, name) {
  const inlinePrefix = `${name}=`;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith(inlinePrefix)) {
      return arg.slice(inlinePrefix.length);
    }

    if (arg === name) {
      return argv[index + 1] || '';
    }
  }

  return '';
}

function getTargetConfig(target) {
  if (target === 'fact') {
    return {
      dockerfilePath: 'Dockerfile.fact',
      extraEnvPaths: ['packages/fact/.env'],
      defaultImageName: 'gantt-fact',
      imageEnvNames: ['FACT_DEPLOY_IMAGE', 'DEPLOY_IMAGE'],
      registryEnvNames: ['FACT_DEPLOY_REGISTRY', 'DEPLOY_REGISTRY'],
      caproverUrlEnvNames: ['FACT_CAPROVER_URL', 'FACT_CAPROVER_SERVER'],
      appNameEnvNames: ['FACT_CAPROVER_APP_NAME'],
      appTokenEnvNames: ['FACT_CAPROVER_APP_TOKEN'],
      buildArgNames: ['VITE_FACT_API_BASE_URL'],
      requiredEnvNames: ['VITE_FACT_API_BASE_URL'],
    };
  }

  return {
    dockerfilePath: 'Dockerfile',
    extraEnvPaths: [],
    defaultImageName: 'getgantt',
    imageEnvNames: ['DEPLOY_IMAGE'],
    registryEnvNames: ['DEPLOY_REGISTRY'],
    caproverUrlEnvNames: ['CAPROVER_URL', 'CAPROVER_SERVER'],
    appNameEnvNames: ['CAPROVER_APP_NAME'],
    appTokenEnvNames: ['CAPROVER_APP_TOKEN'],
    buildArgNames: [],
    requiredEnvNames: [],
  };
}

function loadDotEnv(relativeEnvPath) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(scriptDir, '..', relativeEnvPath);

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
