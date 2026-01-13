/**
 * Error boundary for the batch feature.
 */

import type React from 'react';
import { Component } from 'react';
import { Button } from '@/components/ui/button';

interface BatchErrorBoundaryProps {
	children: React.ReactNode;
}

interface BatchErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

export class BatchErrorBoundary extends Component<BatchErrorBoundaryProps, BatchErrorBoundaryState> {
	state: BatchErrorBoundaryState = {
		hasError: false,
		error: null,
	};

	static getDerivedStateFromError(error: Error): BatchErrorBoundaryState {
		return {
			hasError: true,
			error,
		};
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
		console.error('[BatchErrorBoundary] Caught error:', error, errorInfo);
	}

	handleReset = () => {
		this.setState({ hasError: false, error: null });
	};

	render() {
		if (this.state.hasError) {
			return (
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<div className="max-w-md space-y-4">
						<h2 className="text-lg font-semibold text-zinc-200">Something went wrong</h2>
						<p className="text-sm text-zinc-400">An error occurred while loading the batch view. Please try refreshing the page.</p>
						{this.state.error && (
							<details className="text-left">
								<summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-400">Technical details</summary>
								<pre className="mt-2 overflow-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-300">
									{this.state.error.message}
									{this.state.error.stack && `\n\n${this.state.error.stack}`}
								</pre>
							</details>
						)}
						<div className="flex gap-2 justify-center">
							<Button variant="secondary" onClick={this.handleReset}>
								Try Again
							</Button>
							<Button variant="outline" onClick={() => window.location.reload()}>
								Reload Page
							</Button>
						</div>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
