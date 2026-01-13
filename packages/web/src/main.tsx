import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import '@fontsource-variable/inter';
import '@fontsource/geist-mono';
import './main.css';
import { useAuth } from './features/auth';
import { AppProvider } from './providers';
import { router } from './router';

function InnerApp() {
	const auth = useAuth();
	return (
		<RouterProvider
			router={router}
			context={{
				auth,
			}}
		/>
	);
}

function App() {
	return (
		<AppProvider>
			<InnerApp />
		</AppProvider>
	);
}

const rootElement = document.getElementById('app');
if (rootElement && !rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(
		<StrictMode>
			<App />
		</StrictMode>
	);
}
