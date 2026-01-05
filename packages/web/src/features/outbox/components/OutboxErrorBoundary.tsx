/**
 * Error boundary for OutboxProvider initialization failures.
 */

import type React from 'react';
import { Component } from 'react';
import { toast } from 'sonner';

interface OutboxErrorBoundaryProps {
	children: React.ReactNode;
	fallback: React.ReactNode;
}

interface OutboxErrorBoundaryState {
	hasError: boolean;
}

export class OutboxErrorBoundary extends Component<OutboxErrorBoundaryProps, OutboxErrorBoundaryState> {
	state: OutboxErrorBoundaryState = { hasError: false };

	static getDerivedStateFromError(): OutboxErrorBoundaryState {
		return { hasError: true };
	}

	componentDidCatch(error: Error): void {
		console.error('[Outbox] Initialization failed; continuing without outbox.', error);
		toast.error('Sync is unavailable in this browser session.');
	}

	render() {
		if (this.state.hasError) {
			return this.props.fallback;
		}
		return this.props.children;
	}
}
