import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import './main.css';
import { useAuth } from './components/AuthProvider';
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
