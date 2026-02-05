import { Link } from '@tanstack/react-router';
import { Eye, Hash, Server, Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const COLLECTION_ITEMS = [
	{
		icon: Hash,
		label: 'URL Hash',
		description: 'SHA-256 hash of normalized URLs (client-side)',
		collected: true,
		detail: 'Used to identify learning artifacts without storing full URLs',
	},
	{
		icon: Server,
		label: 'Host',
		description: 'Website hostname (e.g., docs.react.dev)',
		collected: true,
		detail: 'Powers source breakdowns in your dashboard',
	},
	{
		icon: Eye,
		label: 'Path & Title Hints',
		description: 'Optional URL path and page titles',
		collected: 'optional',
		detail: 'Improves context; can be redacted if you prefer',
	},
	{
		icon: Shield,
		label: 'Page Body Content',
		description: 'HTML, text, or code from pages',
		collected: false,
		detail: 'Never read, transmitted, or stored',
	},
] as const;

const TELEMETRY_ITEMS = [
	'Learning session timestamps',
	'Active time estimates (heartbeat-based)',
	'Window focus and tab activity signals',
	'Device ID (extension installation)',
	'Topic classifications (manual or heuristic)',
] as const;

export function PublicPrivacyPage() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
				<p className="mt-1 text-sm text-muted-foreground">Last updated: January 2026</p>
			</div>

			{/* Main Privacy Disclosure Card */}
			<Card>
				<CardHeader>
					<CardTitle>What We Collect</CardTitle>
					<CardDescription>How your data is handled when using Append</CardDescription>
				</CardHeader>
				<CardContent className="space-y-8">
					{/* What We Collect */}
					<section>
						<p className="text-sm text-muted-foreground leading-relaxed mb-6">
							Append collects the minimum data needed to power your learning dashboard.
						</p>

						<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 mb-8">
							{COLLECTION_ITEMS.map((item) => (
								<div key={item.label} className="flex gap-3">
									<div className="mt-0.5">
										<item.icon className="size-4 text-muted-foreground/50" />
									</div>
									<div className="flex-1 space-y-1.5">
										<div className="flex items-center gap-2 flex-wrap">
											<span className="text-sm font-medium">{item.label}</span>
											{item.collected === true && (
												<span className="inline-flex items-center rounded-md bg-foreground/5 px-2 py-0.5 text-xs font-medium text-foreground ring-1 ring-inset ring-foreground/10">
													Collected
												</span>
											)}
											{item.collected === 'optional' && (
												<span className="inline-flex items-center rounded-md bg-foreground/[0.03] px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
													Optional
												</span>
											)}
											{item.collected === false && (
												<span className="inline-flex items-center rounded-md bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground/70">
													Never
												</span>
											)}
										</div>
										<p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
										<p className="text-xs text-muted-foreground/80 leading-relaxed">{item.detail}</p>
									</div>
								</div>
							))}
						</div>

						<div>
							<p className="text-sm font-medium mb-4">Additional telemetry data:</p>
							<ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
								{TELEMETRY_ITEMS.map((item) => (
									<li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground leading-relaxed">
										<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
										<span>{item}</span>
									</li>
								))}
							</ul>
						</div>
					</section>

					<div className="border-t border-border" />

					{/* URL Normalization & Hashing */}
					<section>
						<h3 className="text-sm font-medium mb-1">URL Normalization & Hashing</h3>
						<p className="text-sm text-muted-foreground leading-relaxed mb-6">Your extension never sends full URLs to our servers.</p>

						<p className="text-sm text-muted-foreground leading-relaxed mb-4">URLs are normalized and hashed client-side before transmission:</p>
						<ol className="space-y-2 text-sm text-muted-foreground leading-relaxed ml-4 mb-6">
							<li className="flex items-start gap-2.5">
								<span className="font-medium text-foreground">1.</span>
								<span>
									Fragment (<code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-foreground/90">#...</code>) is stripped
								</span>
							</li>
							<li className="flex items-start gap-2.5">
								<span className="font-medium text-foreground">2.</span>
								<span>
									Query string (<code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-foreground/90">?...</code>) is stripped
								</span>
							</li>
							<li className="flex items-start gap-2.5">
								<span className="font-medium text-foreground">3.</span>
								<span>Hostname is lowercased</span>
							</li>
							<li className="flex items-start gap-2.5">
								<span className="font-medium text-foreground">4.</span>
								<span>
									SHA-256 hash is computed on your device and <strong>only the hash</strong> is transmitted
								</span>
							</li>
						</ol>

						<div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
							<p className="text-sm text-muted-foreground leading-relaxed">
								<span className="font-medium text-foreground">Example:</span>{' '}
								<code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-foreground/90">
									https://docs.react.dev/learn/state#updating-objects
								</code>{' '}
								becomes <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-foreground/90">host=docs.react.dev</code> +{' '}
								<code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-foreground/90">url_hash=abc123...</code>
							</p>
						</div>
					</section>

					<div className="border-t border-border" />

					{/* How We Estimate Learning Time */}
					<section>
						<h3 className="text-sm font-medium mb-1">How We Estimate Learning Time</h3>
						<p className="text-sm text-muted-foreground leading-relaxed mb-6">
							Activity time is derived from heartbeat signals and is always a best-effort estimate.
						</p>

						<p className="text-sm text-muted-foreground leading-relaxed mb-4">
							Your extension sends a heartbeat every 30 seconds while you're actively learning. We credit time based on:
						</p>
						<ul className="space-y-2 text-sm text-muted-foreground leading-relaxed ml-4 mb-6">
							<li className="flex items-start gap-2.5">
								<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
								<span>Window focus status</span>
							</li>
							<li className="flex items-start gap-2.5">
								<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
								<span>Tab activity (visible/active)</span>
							</li>
							<li className="flex items-start gap-2.5">
								<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
								<span>User idle detection (via Chrome APIs)</span>
							</li>
						</ul>

						<div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
							<p className="text-sm text-muted-foreground leading-relaxed">
								If you switch tabs, minimize the window, or go idle, no learning time is credited for that period.
							</p>
						</div>
					</section>
				</CardContent>
			</Card>

			{/* Your Data, Your Control Card */}
			<Card>
				<CardHeader>
					<CardTitle>Your Data, Your Control</CardTitle>
					<CardDescription>Manage and export your data</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<p className="text-sm text-muted-foreground leading-relaxed">
						All telemetry events are stored append-only and never modified or deleted without your explicit action. When you sign in, you can:
					</p>

					<ul className="space-y-2 text-sm text-muted-foreground leading-relaxed ml-4">
						<li className="flex items-start gap-2.5">
							<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
							<span>Export your complete event history as NDJSON</span>
						</li>
						<li className="flex items-start gap-2.5">
							<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
							<span>Delete your account and all associated data (self-serve in Settings when signed in)</span>
						</li>
					</ul>

					<div className="rounded-lg border border-border/50 bg-accent/30 p-4">
						<p className="text-sm text-muted-foreground">
							Ready to get started?{' '}
							<Link to="/sign-in" className="font-medium text-foreground hover:underline">
								Sign in
							</Link>{' '}
							or{' '}
							<Link to="/try" className="font-medium text-foreground hover:underline">
								try without an account
							</Link>
							.
						</p>
					</div>
				</CardContent>
			</Card>

			{/* Contact */}
			<Card>
				<CardHeader>
					<CardTitle>Contact</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground leading-relaxed">
						For privacy inquiries or data requests, please contact us at{' '}
						<a href="mailto:privacy@append.at" className="font-medium text-foreground hover:underline">
							privacy@append.at
						</a>
						.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
