import { Download, Puzzle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function InstallInstructionsPanel({ downloadUrl }: { downloadUrl?: string }) {
	return (
		<Card className="mb-4 bg-card/50">
			<CardHeader className="gap-1">
				<CardTitle className="flex items-center gap-2 text-sm">
					<Puzzle className="size-4" />
					Try the extension (optional)
				</CardTitle>
				<CardDescription className="text-xs">
					This demo uses synthetic data. Installing the extension is optional and requires Chrome "Developer mode" since it's not from the Web
					Store yet.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3 text-sm">
				{downloadUrl ? (
					<Button size="sm" asChild>
						<a href={downloadUrl} target="_blank" rel="noreferrer">
							<Download className="mr-2 size-4" />
							Download extension (.zip)
						</a>
					</Button>
				) : (
					<p className="text-xs text-muted-foreground">Extension download link not configured.</p>
				)}

				<ol className="list-decimal space-y-1 pl-5 text-xs text-card-foreground">
					<li>Download the zip and unzip it.</li>
					<li>
						Navigate to{' '}
						<button
							type="button"
							onClick={() => {
								navigator.clipboard.writeText('chrome://extensions');
								toast.success('Copied to clipboard');
							}}
							className="font-mono text-xs underline hover:text-card-foreground"
						>
							chrome://extensions
						</button>{' '}
						in your address bar and toggle "Developer mode".
					</li>
					<li>Click "Load unpacked" and select the unzipped folder.</li>
				</ol>

				<p className="text-xs text-muted-foreground">
					Note: Uploading real telemetry requires signing in and pairing a device token. The demo page itself never saves data.
				</p>
			</CardContent>
		</Card>
	);
}
