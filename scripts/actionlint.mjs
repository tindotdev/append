import { spawnSync } from 'node:child_process';

function isMissingExecutable(error) {
	return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

const version = spawnSync('actionlint', ['-version'], { encoding: 'utf8' });

if (isMissingExecutable(version.error)) {
	console.warn('actionlint not found; skipping GitHub Actions workflow lint.');
	console.warn('Install: https://github.com/rhysd/actionlint');
	process.exit(0);
}

if (version.status !== 0) {
	process.exit(version.status ?? 1);
}

const res = spawnSync('actionlint', ['-color'], { stdio: 'inherit' });
process.exit(res.status ?? 1);
