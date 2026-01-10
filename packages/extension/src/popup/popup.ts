import './popup.css';
import { ensureDeviceId } from '../lib/device';
import { flushOutbox, getOutboxCount } from '../lib/outbox';
import { getSettings, setSettings } from '../lib/settings';

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
				<div class="actions">
					<button id="save">Save</button>
					<button id="flush" class="secondary">Flush outbox</button>
				</div>
				<p id="status" class="status muted"></p>
			</section>
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
	const statusEl = root.querySelector<HTMLParagraphElement>('#status');

	if (!apiBaseUrlInput || !deviceTokenInput || !statusEl) return;
	apiBaseUrlInput.value = settings.apiBaseUrl;
	deviceTokenInput.value = settings.deviceToken ?? '';

	const setStatus = (text: string) => {
		statusEl.textContent = text;
	};

	const saveButton = root.querySelector<HTMLButtonElement>('#save');
	saveButton?.addEventListener('click', async () => {
		const next = await setSettings({
			apiBaseUrl: apiBaseUrlInput.value,
			deviceToken: deviceTokenInput.value,
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
	});
}

main().catch((err) => {
	console.error('[append][popup] error', err);
});
