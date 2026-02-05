import { Trash2 } from 'lucide-react';
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
import { signOut, useAuth } from '@/features/auth';
import { ApiRequestError } from '@/lib/api-rpc';
import { useDeleteAccount } from './use-delete-account';

export function AccountDeletionCard() {
	const { data: session } = useAuth();
	const mutation = useDeleteAccount();

	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState('');
	const [confirm, setConfirm] = useState('');

	const expectedEmail = session?.user?.email ?? '';

	const emailMatches = useMemo(() => {
		if (!expectedEmail) return false;
		return email.trim().toLowerCase() === expectedEmail.trim().toLowerCase();
	}, [email, expectedEmail]);

	const confirmMatches = useMemo(() => confirm.trim().toUpperCase() === 'DELETE', [confirm]);
	const canDelete = !!expectedEmail && emailMatches && confirmMatches && !mutation.isPending;

	const close = () => {
		setOpen(false);
		setEmail('');
		setConfirm('');
	};

	const onDelete = async () => {
		try {
			await mutation.mutateAsync({ email, confirm });

			// Best-effort sign out; the session may already be invalid due to hard delete.
			try {
				await signOut();
			} catch {
				// ignore
			}

			toast.success('Account deleted.');
			window.location.assign('/sign-in');
		} catch (err) {
			const message = err instanceof ApiRequestError ? err.message : 'Failed to delete account';
			toast.error(message);
		}
	};

	return (
		<Card>
			<CardHeader className="gap-1">
				<CardDescription className="text-xs">Danger zone</CardDescription>
				<CardTitle className="text-base">Delete account</CardTitle>
				<CardDescription>Permanently delete your account and all associated data.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<Alert variant="destructive">
					<AlertDescription>
						This action is permanent. It hard-deletes your user row and cascades deletion to user-owned data (terms, buckets, events, sessions,
						device tokens, and more).
					</AlertDescription>
				</Alert>

				<Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
					<DialogTrigger asChild>
						<Button type="button" variant="destructive" disabled={!expectedEmail}>
							<Trash2 className="mr-2 size-4" />
							Delete account
						</Button>
					</DialogTrigger>
					<DialogContent className="max-w-lg">
						<DialogHeader>
							<DialogTitle>Delete your account?</DialogTitle>
							<DialogDescription>
								To confirm, type your email and then type <code className="text-xs">DELETE</code>.
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-4">
							<div className="space-y-1">
								<div className="text-xs text-muted-foreground">Email</div>
								<Input
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder={expectedEmail || 'you@example.com'}
									autoCapitalize="none"
									autoCorrect="off"
									disabled={mutation.isPending || !expectedEmail}
								/>
								{expectedEmail ? (
									<p className="text-xs text-muted-foreground">
										Signed in as <span className="text-foreground">{expectedEmail}</span>
									</p>
								) : (
									<p className="text-xs text-muted-foreground">Sign in to delete your account.</p>
								)}
							</div>

							<div className="space-y-1">
								<div className="text-xs text-muted-foreground">Type DELETE</div>
								<Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" disabled={mutation.isPending} />
							</div>

							{!emailMatches && email.trim().length > 0 ? (
								<Alert variant="destructive">
									<AlertDescription>Email must match the signed-in account.</AlertDescription>
								</Alert>
							) : null}
						</div>

						<DialogFooter>
							<DialogClose asChild>
								<Button variant="ghost" disabled={mutation.isPending}>
									Cancel
								</Button>
							</DialogClose>
							<Button type="button" variant="destructive" onClick={onDelete} disabled={!canDelete}>
								{mutation.isPending ? 'Deleting…' : 'Delete permanently'}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</CardContent>
		</Card>
	);
}
