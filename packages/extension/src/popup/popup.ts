import './popup.css';

const root = document.querySelector<HTMLDivElement>('#root');
if (!root) throw new Error('Missing #root');

root.innerHTML = `
	<main class="wrap">
		<h1>Append</h1>
		<p>Telemetry emitter (coming next).</p>
	</main>
`;
