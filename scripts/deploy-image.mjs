import { spawnSync } from 'node:child_process';

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
