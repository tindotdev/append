import { BUCKET_TITLES, type Bucket } from '@append/contracts/types';
import { Download, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface BucketDetailDrawerProps {
	bucket: Bucket | null;
	onClose: () => void;
	onDownload: (bucket: Bucket) => void;
	isDownloading?: boolean;
}

export function BucketDetailDrawer({ bucket, onClose, onDownload, isDownloading }: BucketDetailDrawerProps) {
	return (
		<Sheet open={!!bucket} onOpenChange={(open) => !open && onClose()}>
			<SheetContent side="right" className="sm:max-w-md overflow-y-auto">
				{bucket && (
					<>
						<SheetHeader>
							<div className="flex items-center justify-between">
								<div className="flex-1">
									<SheetTitle>{BUCKET_TITLES[bucket]}</SheetTitle>
									<SheetDescription className="mt-1">{bucket}.md</SheetDescription>
								</div>
								<Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6">
									<X className="h-4 w-4" />
								</Button>
							</div>
						</SheetHeader>

						<Separator className="my-4" />

						{/* Bucket Info */}
						<div className="space-y-4">
							<div>
								<h3 className="text-sm font-medium text-muted-foreground mb-3">Bucket Information</h3>
								<div className="space-y-2">
									<div className="flex items-center justify-between p-2 rounded-md bg-accent/50">
										<span className="text-sm text-muted-foreground">Bucket</span>
										<span className="text-sm font-medium">{bucket}</span>
									</div>
								</div>
							</div>

							<Separator />

							{/* Preview Note */}
							<div className="rounded-lg border bg-card p-4">
								<div className="flex items-start gap-3">
									<FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
									<div className="flex-1">
										<p className="text-sm font-medium">Markdown Export</p>
										<p className="text-xs text-muted-foreground mt-1">
											Download this bucket as a markdown file with all terms and their definitions.
										</p>
									</div>
								</div>
							</div>

							{/* Download Actions */}
							<div className="space-y-2">
								<Button onClick={() => onDownload(bucket)} disabled={isDownloading} className="w-full" size="lg">
									{isDownloading ? (
										<>
											<span className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
											Downloading...
										</>
									) : (
										<>
											<Download className="mr-2 h-4 w-4" />
											Download Markdown
										</>
									)}
								</Button>
							</div>

							{/* Additional Info */}
							<div className="pt-4 border-t">
								<p className="text-xs text-muted-foreground">
									The export will include all terms currently in the {BUCKET_TITLES[bucket]} bucket, formatted as markdown with headers and
									definitions.
								</p>
							</div>
						</div>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}
