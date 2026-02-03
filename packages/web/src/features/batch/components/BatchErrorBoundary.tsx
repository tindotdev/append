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
		// Note: This clears the error state and attempts to re-render children.
		// If the error was caused by bad data, it will immediately re-trigger.
		// For persistent errors, users should use the "Reload Page" button.
		this.setState({ hasError: false, error: null });
	};

	render() {
		if (this.state.hasError) {
			return (
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<div className="max-w-md space-y-4">
						<h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
						<p className="text-sm text-muted-foreground">An error occurred while loading the batch view. Please try refreshing the page.</p>
						{this.state.error && (
							<details className="text-left">
								<summary className="cursor-pointer text-xs text-muted-foreground hover:text-muted-foreground">Technical details</summary>
								<pre className="mt-2 overflow-auto rounded-lg bg-card p-3 text-xs text-card-foreground">
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
