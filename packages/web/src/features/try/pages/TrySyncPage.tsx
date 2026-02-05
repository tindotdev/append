import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, parseRpcJson } from '@/lib/api-rpc';
import { useTryExportTermsForSync } from '../hooks';
import { clearTryState } from '../store';

type SyncState = 'idle' | 'syncing' | 'done' | 'error';

export function TrySyncPage() {
	const navigate = useNavigate();
	const { auth } = useRouteContext({ from: '__root__' });
	const { data: session, isPending } = auth;
	const items = useTryExportTermsForSync();
	const [state, setState] = useState<SyncState>('idle');
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const startedRef = useRef(false);

	const run = useCallback(async () => {
		setState('syncing');
		setErrorMessage(null);
		try {
			const res = await api.api.guest['import-terms'].$post({
				json: {
					clientRequestId: crypto.randomUUID(),
					items,
				},
			});
			await parseRpcJson(res);
			clearTryState();
			setState('done');
			navigate({ to: '/bucket/$slug', params: { slug: 'foundations' }, search: { term: undefined } });
		} catch (err) {
			setState('error');
			setErrorMessage(err instanceof Error ? err.message : 'Sync failed');
		}
	}, [items, navigate]);

	useEffect(() => {
		if (startedRef.current) return;
		if (isPending) return;
		if (!session) {
			navigate({ to: '/sign-in' });
			return;
		}
		startedRef.current = true;
		if (items.length === 0) {
			navigate({ to: '/batch' });
			return;
		}
		void run();
	}, [isPending, items.length, navigate, run, session]);

	return (
		<div className="w-full">
			<Card>
				<CardHeader>
					<CardTitle>Syncing trial data</CardTitle>
					<CardDescription>Importing your local trial terms into your new account…</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="text-sm text-muted-foreground">
						Terms to sync: <span className="text-foreground tabular-nums">{items.length}</span>
					</div>

					{state === 'syncing' && <div className="text-sm">Syncing…</div>}
					{state === 'error' && (
						<div className="space-y-2">
							<div className="text-sm text-destructive">{errorMessage ?? 'Sync failed.'}</div>
							<div className="flex gap-2">
								<Button onClick={() => run()}>Retry</Button>
								<Button variant="outline" onClick={() => navigate({ to: '/try' })}>
									Back to trial
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
