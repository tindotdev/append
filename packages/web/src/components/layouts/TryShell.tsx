import { Outlet, useNavigate } from '@tanstack/react-router';
import { Info, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { TrySidebar } from '@/components/try-sidebar';
import { Button } from '@/components/ui/button';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { signIn } from '@/features/auth/api/auth-client';
import { useTryActions } from '@/features/try/hooks';

export function TryShell() {
	const navigate = useNavigate();
	const { resetTryToSeed } = useTryActions();
	const [isResetting, setIsResetting] = useState(false);

	return (
		<SidebarProvider>
			<TrySidebar />
			<SidebarInset>
				<header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
					<SidebarTrigger className="-ml-1" />
					<div className="ml-auto flex items-center gap-2">
						<div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
							<Info className="size-3.5" />
							Local-only • saved in this browser
						</div>

						<Button
							variant="outline"
							size="sm"
							disabled={isResetting}
							onClick={async () => {
								if (!window.confirm('Reset trial data back to the seeded examples?')) return;
								setIsResetting(true);
								try {
									resetTryToSeed();
									toast.success('Trial data reset');
									navigate({ to: '/try' });
								} finally {
									setIsResetting(false);
								}
							}}
						>
							<RotateCcw className="mr-2 size-4" />
							Reset trial
						</Button>

						<Button
							size="sm"
							onClick={() =>
								signIn.social({
									provider: 'google',
									callbackURL: `${window.location.origin}/try/sync`,
								})
							}
						>
							Create account
						</Button>
					</div>
				</header>

				<main className="flex-1 overflow-auto p-6">
					<div className="mx-auto max-w-7xl flex justify-center">
						<Outlet />
					</div>
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
