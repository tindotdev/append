import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function sh(command) {
	return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function splitNullSeparated(text) {
	return text.split('\0').filter(Boolean);
}

const allowedDocsFiles = new Set(['docs/design.md', 'docs/README.md', 'docs/runbook.md']);

const allowedDocsPrefixes = ['docs/adr/'];

function isAllowedDocsMarkdown(filePath) {
	if (!filePath.startsWith('docs/')) return true;
	if (!filePath.endsWith('.md')) return true;
	if (filePath.startsWith('docs/archive/')) return false;
	if (allowedDocsFiles.has(filePath)) return true;
	return allowedDocsPrefixes.some((prefix) => filePath.startsWith(prefix));
}

function isDisallowedTempDoc(filePath) {
	const base = filePath.split('/').pop() ?? '';
	if (base === 'HANDOFF.md') return true;
	if (base === 'ISSUE.md') return true;
	if (base === 'TASK.md') return true;
	if (/^DEBUG_.+\.md$/.test(base)) return true;
	if (/^PLAN_.+\.md$/.test(base)) return true;
	if (/^SUMMARY_.+\.md$/.test(base)) return true;
	return false;
}

const errors = [];

// 1) Ensure the working tree under docs/ follows the policy (no archive, no extra docs).
function listMarkdownFilesUnderDocs() {
	const results = [];
	const root = path.resolve('docs');
	if (!fs.existsSync(root)) return results;

	function walk(dirAbs) {
		for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
			const abs = path.join(dirAbs, entry.name);
			const rel = path.relative(process.cwd(), abs).replaceAll(path.sep, '/');
			if (entry.isDirectory()) {
				walk(abs);
				continue;
			}
			if (entry.isFile() && rel.startsWith('docs/') && rel.endsWith('.md')) {
				results.push(rel);
			}
		}
	}

	walk(root);
	return results;
}

const docsMarkdown = listMarkdownFilesUnderDocs();
const docsViolations = docsMarkdown.filter((filePath) => !isAllowedDocsMarkdown(filePath));
if (docsViolations.length > 0) {
	errors.push(
		[
			'Docs policy violation: disallowed markdown files under `docs/`.',
			'Allowed: `docs/design.md`, `docs/adr/**/*.md`, plus `docs/runbook.md` and `docs/README.md`.',
			'Disallowed files:',
			...docsViolations.map((p) => `- ${p}`),
		].join('\n')
	);
}

// 2) Block staging of temp-doc patterns (deprecated) and disallowed docs additions.
const stagedAddedRaw = sh('git diff --cached --name-status -z --diff-filter=A');
const stagedAddedTokens = splitNullSeparated(stagedAddedRaw);

// Format is repeating pairs: ["A", "path", "A", "path", ...]
for (let i = 0; i < stagedAddedTokens.length; i += 2) {
	const status = stagedAddedTokens[i];
	const filePath = stagedAddedTokens[i + 1];
	if (status !== 'A' || !filePath) continue;

	if (isDisallowedTempDoc(filePath)) {
		errors.push(
			[
				'Docs policy violation: temporary doc files are not allowed to be persisted.',
				`Disallowed: ${filePath}`,
				'Use the PR description / issue tracker instead, or convert durable decisions into an ADR.',
			].join('\n')
		);
	}

	if (!isAllowedDocsMarkdown(filePath)) {
		errors.push(
			[
				'Docs policy violation: new markdown file under `docs/` is not allowed.',
				`Disallowed: ${filePath}`,
				'Use `docs/design.md` (snapshot) or add an ADR under `docs/adr/`.',
			].join('\n')
		);
	}
}

if (errors.length > 0) {
	console.error(errors.join('\n\n'));
	process.exit(1);
}

console.log('Docs policy: OK');
