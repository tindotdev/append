import { Copy, KeyRound, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type DeviceTokenListItem, useCreateDeviceToken, useDeviceTokens, useRevokeDeviceToken } from '../api/device-tokens';

function formatDate(ms: number | null): string {
	if (!ms) return '—';
	try {
		return new Date(ms).toLocaleString();
	} catch {
		return '—';
	}
}

function TokenRow({ token, onRevoke }: { token: DeviceTokenListItem; onRevoke: () => void }) {
	const revoked = token.revoked_at_ms !== null;
	const expired = token.expires_at_ms !== null && token.expires_at_ms < Date.now();

	return (
		<div className="flex items-start justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<KeyRound className="size-4 text-zinc-400" />
					<div className="font-medium text-zinc-100 truncate">{token.label || 'Untitled token'}</div>
					<div className="text-xs text-zinc-500">({token.token_prefix}…)</div>
					{revoked && <span className="text-xs rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">Revoked</span>}
					{!revoked && expired && <span className="text-xs rounded bg-orange-900/50 px-2 py-0.5 text-orange-300">Expired</span>}
				</div>
				<div className="mt-1 grid grid-cols-1 gap-1 text-xs text-zinc-500 @md/main:grid-cols-2">
					<div>
						<span className="text-zinc-400">Created:</span> {formatDate(token.created_at_ms)}
					</div>
					<div>
						<span className="text-zinc-400">Last used:</span> {formatDate(token.last_used_at_ms)}
					</div>
					{token.expires_at_ms && (
						<div className={expired ? 'text-orange-400' : ''}>
							<span className="text-zinc-400">Expires:</span> {formatDate(token.expires_at_ms)}
						</div>
					)}
				</div>
			</div>
			<div className="flex items-center gap-2">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button type="button" variant="ghost" size="sm" onClick={onRevoke} disabled={revoked} aria-label="Revoke token">
							<Trash2 className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{revoked ? 'Token already revoked' : 'Revoke token'}</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}

export function DeviceTokenManager() {
	const [createOpen, setCreateOpen] = useState(false);
	const [label, setLabel] = useState('');
	const [expiresInDays, setExpiresInDays] = useState<string>('never');
	const [createdToken, setCreatedToken] = useState<string | null>(null);
	const [createdTokenId, setCreatedTokenId] = useState<string | null>(null);
	const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
	const [tokenToRevoke, setTokenToRevoke] = useState<string | null>(null);

	const { data, isLoading, isError, refetch } = useDeviceTokens();
	const createMutation = useCreateDeviceToken();
	const revokeMutation = useRevokeDeviceToken();

	const tokens = useMemo(() => data?.tokens ?? [], [data?.tokens]);

	const handleCreate = async () => {
		try {
			const expires_in_days = expiresInDays === 'never' ? undefined : Number.parseInt(expiresInDays, 10);
			const res = await createMutation.mutateAsync({ label, expires_in_days });
			setCreatedToken(res.token);
			setCreatedTokenId(res.token_id);
			toast.success('Device token created. Copy it now — it will only be shown once.');
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to create token');
		}
	};

	const handleCopy = async () => {
		if (!createdToken) return;
		try {
			await navigator.clipboard.writeText(createdToken);
			toast.success('Copied token to clipboard.');
		} catch {
			toast.error('Failed to copy. Please copy manually.');
		}
	};

	const closeCreate = () => {
		setCreateOpen(false);
		setLabel('');
		setExpiresInDays('never');
		setCreatedToken(null);
		setCreatedTokenId(null);
	};

	const openRevokeDialog = (tokenId: string) => {
		setTokenToRevoke(tokenId);
		setRevokeDialogOpen(true);
	};

	const confirmRevoke = async () => {
		if (!tokenToRevoke) return;
		try {
			await revokeMutation.mutateAsync(tokenToRevoke);
			toast.success('Token revoked.');
			setRevokeDialogOpen(false);
			setTokenToRevoke(null);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to revoke token');
		}
	};

	return (
		<Card>
			<CardHeader className="gap-1">
				<CardDescription className="text-xs">Chrome extension</CardDescription>
				<CardTitle className="text-base">Device tokens</CardTitle>
				<CardDescription>
					Mint a device token and paste it into the extension popup. Tokens are shown once and can be revoked at any time.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex flex-wrap items-center gap-2">
					<Dialog open={createOpen} onOpenChange={setCreateOpen}>
						<DialogTrigger asChild>
							<Button type="button">
								<Plus className="mr-2 size-4" />
								New token
							</Button>
						</DialogTrigger>
						<DialogContent className="max-w-lg">
							<DialogHeader>
								<DialogTitle>Create device token</DialogTitle>
								<DialogDescription>
									This token grants access to <code className="text-xs">POST /events/ingest</code>. Store it only in your extension.
								</DialogDescription>
							</DialogHeader>

							<div className="space-y-3">
								<div className="space-y-1">
									<div className="text-xs text-zinc-500">Label (optional)</div>
									<Input
										value={label}
										onChange={(e) => setLabel(e.target.value)}
										placeholder="e.g. Chrome (Work laptop)"
										maxLength={64}
										disabled={createMutation.isPending}
									/>
								</div>

								<div className="space-y-1">
									<div className="text-xs text-zinc-500">Expiration (optional)</div>
									<Select value={expiresInDays} onValueChange={setExpiresInDays} disabled={createMutation.isPending}>
										<SelectTrigger className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="never">Never expires</SelectItem>
											<SelectItem value="30">30 days</SelectItem>
											<SelectItem value="90">90 days</SelectItem>
											<SelectItem value="180">180 days (6 months)</SelectItem>
											<SelectItem value="365">365 days (1 year)</SelectItem>
										</SelectContent>
									</Select>
								</div>

								{createdToken ? (
									<div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
										<div className="text-xs text-zinc-400 mb-1">Token (copy now)</div>
										<div className="flex items-center gap-2">
											<Input value={createdToken} readOnly />
											<Button type="button" variant="outline" onClick={handleCopy}>
												<Copy className="mr-2 size-4" />
												Copy
											</Button>
										</div>
										<p className="text-xs text-zinc-500 mt-2">
											Paste this token into the extension popup → <span className="text-zinc-300">Device token</span>.
										</p>
									</div>
								) : null}
							</div>

							<DialogFooter>
								<DialogClose asChild>
									<Button variant="ghost" onClick={closeCreate}>
										Close
									</Button>
								</DialogClose>
								{createdToken ? null : (
									<Button type="button" onClick={handleCreate} disabled={createMutation.isPending}>
										{createMutation.isPending ? 'Creating…' : 'Create token'}
									</Button>
								)}
							</DialogFooter>
						</DialogContent>
					</Dialog>

					<Button type="button" variant="outline" onClick={() => refetch()} disabled={isLoading}>
						<RefreshCcw className="mr-2 size-4" />
						Refresh
					</Button>
				</div>

				{isError && (
					<Alert variant="destructive">
						<AlertDescription>Failed to load device tokens.</AlertDescription>
					</Alert>
				)}

				{revokeMutation.isError && (
					<Alert variant="destructive">
						<AlertDescription>{revokeMutation.error instanceof Error ? revokeMutation.error.message : 'Failed to revoke token'}</AlertDescription>
					</Alert>
				)}

				{tokens.length === 0 && !isLoading ? (
					<div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-6 text-center">
						<p className="text-zinc-400">No device tokens yet.</p>
						<p className="text-xs text-zinc-500 mt-1">Create one to connect your extension.</p>
					</div>
				) : (
					<div className="space-y-2">
						{tokens.map((t) => (
							<TokenRow key={t.id} token={t} onRevoke={() => openRevokeDialog(t.id)} />
						))}
					</div>
				)}

				{createdTokenId ? (
					<p className="text-xs text-zinc-500">
						Created token id: <span className="font-mono text-zinc-300">{createdTokenId}</span>
					</p>
				) : null}
			</CardContent>

			<Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Revoke token?</DialogTitle>
						<DialogDescription>
							The extension will stop ingesting events until you create and configure a new token. This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="ghost">Cancel</Button>
						</DialogClose>
						<Button variant="destructive" onClick={confirmRevoke} disabled={revokeMutation.isPending}>
							{revokeMutation.isPending ? 'Revoking…' : 'Revoke'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
