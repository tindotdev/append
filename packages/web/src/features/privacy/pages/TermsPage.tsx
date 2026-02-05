import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function TermsPage() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Terms of Service</h1>
				<p className="mt-1 text-sm text-muted-foreground">Last updated: February 2026</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Agreement to Terms</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
					<p>
						By accessing or using Append ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms,
						please do not use the Service.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Description of Service</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
					<p>Append is a learning telemetry service that helps you track and understand your learning habits. The Service consists of:</p>
					<ul className="space-y-2 ml-4">
						<li className="flex items-start gap-2.5">
							<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
							<span>A browser extension that collects anonymized learning activity data</span>
						</li>
						<li className="flex items-start gap-2.5">
							<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
							<span>A web dashboard for viewing and managing your learning data</span>
						</li>
						<li className="flex items-start gap-2.5">
							<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
							<span>APIs for data export and integration</span>
						</li>
					</ul>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>User Accounts</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
					<p>
						To use certain features of the Service, you must create an account using a supported authentication provider (currently Google). You
						are responsible for:
					</p>
					<ul className="space-y-2 ml-4">
						<li className="flex items-start gap-2.5">
							<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
							<span>Maintaining the security of your account credentials</span>
						</li>
						<li className="flex items-start gap-2.5">
							<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
							<span>All activities that occur under your account</span>
						</li>
						<li className="flex items-start gap-2.5">
							<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
							<span>Notifying us immediately of any unauthorized use</span>
						</li>
					</ul>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Acceptable Use</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
					<p>You agree not to:</p>
					<ul className="space-y-2 ml-4">
						<li className="flex items-start gap-2.5">
							<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
							<span>Use the Service for any unlawful purpose</span>
						</li>
						<li className="flex items-start gap-2.5">
							<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
							<span>Attempt to gain unauthorized access to the Service or its systems</span>
						</li>
						<li className="flex items-start gap-2.5">
							<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
							<span>Interfere with or disrupt the Service or servers</span>
						</li>
						<li className="flex items-start gap-2.5">
							<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
							<span>Reverse engineer, decompile, or disassemble the Service</span>
						</li>
						<li className="flex items-start gap-2.5">
							<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
							<span>Use automated systems to access the Service in a manner that exceeds reasonable use</span>
						</li>
					</ul>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Intellectual Property</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
					<p>
						The Service and its original content, features, and functionality are owned by Append and are protected by international copyright,
						trademark, and other intellectual property laws.
					</p>
					<p>
						Your learning data remains yours. You retain all rights to your data and may export or delete it at any time through the Service.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Service Availability</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
					<p>
						We strive to maintain high availability but do not guarantee uninterrupted access to the Service. We reserve the right to modify,
						suspend, or discontinue the Service (or any part thereof) at any time, with or without notice.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Limitation of Liability</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
					<p>
						To the maximum extent permitted by law, Append shall not be liable for any indirect, incidental, special, consequential, or punitive
						damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other
						intangible losses resulting from:
					</p>
					<ul className="space-y-2 ml-4">
						<li className="flex items-start gap-2.5">
							<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
							<span>Your use or inability to use the Service</span>
						</li>
						<li className="flex items-start gap-2.5">
							<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
							<span>Any unauthorized access to or use of our servers</span>
						</li>
						<li className="flex items-start gap-2.5">
							<span className="mt-1.5 size-1 rounded-full bg-muted-foreground/30 shrink-0" />
							<span>Any interruption or cessation of transmission to or from the Service</span>
						</li>
					</ul>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Disclaimer of Warranties</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
					<p>
						The Service is provided "as is" and "as available" without warranties of any kind, either express or implied, including but not
						limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Changes to Terms</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
					<p>
						We reserve the right to modify these terms at any time. We will provide notice of significant changes by posting the new terms on this
						page and updating the "Last updated" date. Your continued use of the Service after such changes constitutes acceptance of the new
						terms.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Termination</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
					<p>
						You may terminate your account at any time by requesting account deletion through the Service. We may terminate or suspend your
						account and access to the Service immediately, without prior notice, for conduct that we believe violates these Terms or is harmful to
						other users, us, or third parties.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Governing Law</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
					<p>These Terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law principles.</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Contact</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
					<p>
						If you have any questions about these Terms, please contact us at{' '}
						<a href="mailto:legal@append.at" className="font-medium text-foreground hover:underline">
							legal@append.at
						</a>
						.
					</p>
					<div className="rounded-lg border border-border/50 bg-accent/30 p-4 mt-4">
						<p>
							See also our{' '}
							<Link to="/privacy" className="font-medium text-foreground hover:underline">
								Privacy Policy
							</Link>{' '}
							for information about how we collect and use your data.
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
