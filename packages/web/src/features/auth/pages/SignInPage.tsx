import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { signIn } from '../api/auth-client';
import { useAuth } from '../hooks/use-auth';

export function SignInPage() {
	const { data: session, isPending } = useAuth();
	const navigate = useNavigate();

	// Redirect to batch/new when authenticated
	useEffect(() => {
		if (!isPending && session) {
			navigate({ to: '/batch' });
		}
	}, [isPending, session, navigate]);

	// Show loading while auth is pending
	if (isPending) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
				<p className="text-muted-foreground">Loading...</p>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-6">
			<Card className="w-full max-w-xs py-5">
				<CardHeader className="px-5 text-center">
					<img src="/android-chrome-192x192.png" alt="append logo" className="mx-auto mb-1 h-10 w-10 rounded-lg" />
					<p className="text-xs text-muted-foreground/70">Sign in or create an account</p>
				</CardHeader>
				<CardContent className="flex justify-center px-5">
					<Button
						variant="outline"
						className="w-fit h-8 px-2 text-xs"
						onClick={() =>
							signIn.social({
								provider: 'google',
								callbackURL: `${window.location.origin}/batch`,
							})
						}
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="mr-2 h-3.5 w-3.5">
							<title>Google logo</title>
							<path
								d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
								fill="currentColor"
							/>
						</svg>
						Continue with Google
					</Button>
				</CardContent>
			</Card>
			<p className="mt-4 text-xs text-muted-foreground">
				<Link to="/demo" className="hover:text-foreground">
					Try demo
				</Link>
				<span className="mx-2 text-border">•</span>
				<Link to="/try" className="hover:text-foreground">
					Try without account
				</Link>
			</p>
			<p className="mt-2 text-xs text-muted-foreground/70">
				<Link to="/privacy" className="hover:text-muted-foreground">
					Privacy
				</Link>
				<span className="mx-2 text-border/70">•</span>
				<Link to="/terms" className="hover:text-muted-foreground">
					Terms
				</Link>
			</p>
		</div>
	);
}
