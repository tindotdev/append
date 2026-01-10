import './popup.css';
import { ensureDeviceId } from '../lib/device';
import { clearDeadletter, type DeadletterItem, flushOutbox, getDeadletterItems, getOutboxCount } from '../lib/outbox';
import { getSettings, setSettings } from '../lib/settings';

function formatDeadletterItem(item: DeadletterItem): string {
	const date = new Date(item.at_ms).toLocaleString();
	const eventId = item.event.event_id.slice(0, 8);
	return `[${date}] ${eventId}… — ${item.reason}`;
}

async function main() {
	const root = document.querySelector<HTMLDivElement>('#root');
	if (!root) throw new Error('Missing #root');

	root.innerHTML = `
		<main class="wrap">
			<header class="header">
				<img class="logo" src="/icons/icon-32.png" alt="Append" />
				<div>
					<h1>Append</h1>
					<p class="muted">Telemetry emitter</p>
				</div>
			</header>

			<section class="section">
				<div class="row">
					<div class="label">Device</div>
					<div class="value" id="deviceId">…</div>
				</div>
				<div class="row">
					<div class="label">Outbox</div>
					<div class="value" id="outboxCount">…</div>
				</div>
			</section>

			<section class="section">
				<label class="field">
					<span>API base URL</span>
					<input id="apiBaseUrl" type="url" placeholder="http://localhost:8787" />
				</label>
				<label class="field">
					<span>Device token</span>
					<input id="deviceToken" type="password" placeholder="apdt_…" />
				</label>
				<label class="field checkbox-field">
					<input id="includeHints" type="checkbox" />
					<span>Include path and title hints</span>
				</label>
				<p class="hint">When enabled, sends page path and title with heartbeats. Off by default for privacy.</p>
				<div class="actions">
					<button id="save">Save</button>
					<button id="flush" class="secondary">Flush outbox</button>
				</div>
				<p id="status" class="status muted"></p>
			</section>

			<details class="section debug-section">
				<summary class="debug-toggle">Debug: Rejected events <span id="deadletterCount" class="badge">0</span></summary>
				<div class="debug-content">
					<pre id="deadletterList" class="deadletter-list"></pre>
					<button id="clearDeadletter" class="secondary small">Clear rejected</button>
				</div>
			</details>
		</main>
	`;

	const deviceId = await ensureDeviceId();
	const settings = await getSettings();
	const outboxCount = await getOutboxCount();

	const deviceIdEl = root.querySelector<HTMLDivElement>('#deviceId');
	if (deviceIdEl) deviceIdEl.textContent = deviceId;

	const outboxCountEl = root.querySelector<HTMLDivElement>('#outboxCount');
	if (outboxCountEl) {
		outboxCountEl.textContent = `${outboxCount} event${outboxCount !== 1 ? 's' : ''}`;
		if (outboxCount >= 1000) {
			outboxCountEl.style.color = '#dc2626';
			outboxCountEl.style.fontWeight = 'bold';
		} else if (outboxCount >= 100) {
			outboxCountEl.style.color = '#f59e0b';
		}
	}

	const apiBaseUrlInput = root.querySelector<HTMLInputElement>('#apiBaseUrl');
	const deviceTokenInput = root.querySelector<HTMLInputElement>('#deviceToken');
	const includeHintsInput = root.querySelector<HTMLInputElement>('#includeHints');
	const statusEl = root.querySelector<HTMLParagraphElement>('#status');

	if (!apiBaseUrlInput || !deviceTokenInput || !includeHintsInput || !statusEl) return;
	apiBaseUrlInput.value = settings.apiBaseUrl;
	deviceTokenInput.value = settings.deviceToken ?? '';
	includeHintsInput.checked = settings.includeHints;

	const setStatus = (text: string) => {
		statusEl.textContent = text;
	};

	const saveButton = root.querySelector<HTMLButtonElement>('#save');
	saveButton?.addEventListener('click', async () => {
		const next = await setSettings({
			apiBaseUrl: apiBaseUrlInput.value,
			deviceToken: deviceTokenInput.value,
			includeHints: includeHintsInput.checked,
		});
		setStatus(`Saved. Targeting ${next.apiBaseUrl}`);
	});

	const flushButton = root.querySelector<HTMLButtonElement>('#flush');
	flushButton?.addEventListener('click', async () => {
		setStatus('Flushing…');
		await flushOutbox();
		const newCount = await getOutboxCount();
		if (outboxCountEl) {
			outboxCountEl.textContent = `${newCount} event${newCount !== 1 ? 's' : ''}`;
			if (newCount >= 1000) {
				outboxCountEl.style.color = '#dc2626';
				outboxCountEl.style.fontWeight = 'bold';
			} else if (newCount >= 100) {
				outboxCountEl.style.color = '#f59e0b';
			} else {
				outboxCountEl.style.color = '';
				outboxCountEl.style.fontWeight = '';
			}
		}
		setStatus('Flush complete (check Service Worker logs).');
		// Refresh dead letter display after flush
		await refreshDeadletter();
	});

	// Dead letter queue display
	const deadletterCountEl = root.querySelector<HTMLSpanElement>('#deadletterCount');
	const deadletterListEl = root.querySelector<HTMLPreElement>('#deadletterList');
	const clearDeadletterBtn = root.querySelector<HTMLButtonElement>('#clearDeadletter');

	async function refreshDeadletter() {
		const items = await getDeadletterItems();
		if (deadletterCountEl) {
			deadletterCountEl.textContent = String(items.length);
		}
		if (deadletterListEl) {
			if (items.length === 0) {
				deadletterListEl.textContent = 'No rejected events.';
			} else {
				deadletterListEl.textContent = items.map(formatDeadletterItem).join('\n');
			}
		}
	}

	await refreshDeadletter();

	clearDeadletterBtn?.addEventListener('click', async () => {
		await clearDeadletter();
		await refreshDeadletter();
		setStatus('Rejected events cleared.');
	});
}

main().catch((err) => {
	console.error('[append][popup] error', err);
});
