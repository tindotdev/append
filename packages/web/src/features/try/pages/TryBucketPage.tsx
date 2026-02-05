import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import type { RowSelectionState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TryBucketTable } from '../components/TryBucketTable';
import { getTryColumns } from '../components/try-columns';
import { useTryActions, useTryBucket, useTryBuckets, useTryBucketTerms } from '../hooks';
import type { TryBucketSlug, TryTerm } from '../types';

export function TryBucketPage() {
	const navigate = useNavigate();
	const { slug } = useParams({ from: '/try/bucket/$slug' });
	const search = useSearch({ from: '/try/bucket/$slug' }) as { term?: string };

	const { bucket } = useTryBucket(slug);
	const { buckets } = useTryBuckets();
	const { terms } = useTryBucketTerms(slug);
	const { deleteTryTerm, moveTryTerm } = useTryActions();

	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [moveOpen, setMoveOpen] = useState(false);
	const [moveTarget, setMoveTarget] = useState<TryTerm | null>(null);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<TryTerm | null>(null);

	const [selectedBucket, setSelectedBucket] = useState<TryBucketSlug | null>(null);

	const filtered = useMemo(() => {
		const q = (search.term ?? '').trim().toLowerCase();
		if (!q) return terms;
		return terms.filter((i) => i.displayTerm.toLowerCase().includes(q) || i.primarySense.text.toLowerCase().includes(q));
	}, [terms, search.term]);

	const columns = useMemo(
		() =>
			getTryColumns({
				onDelete: (item) => {
					setDeleteTarget(item);
					setDeleteOpen(true);
				},
				onMove: (item) => {
					setMoveTarget(item);
					setSelectedBucket(null);
					setMoveOpen(true);
				},
			}),
		[]
	);

	if (!bucket) {
		return (
			<div className="w-full space-y-4">
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink asChild>
								<Link to="/try">Try</Link>
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage>Bucket not found</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
				<Card>
					<CardContent className="py-12 text-center text-muted-foreground">
						Bucket not found.{' '}
						<Button variant="link" onClick={() => navigate({ to: '/try' })}>
							Go back
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	const availableMoveBuckets = buckets.filter((b) => b.slug !== bucket.slug);

	return (
		<div className="w-full space-y-4">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Link to="/try">Try</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>{bucket.name}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<Card>
				<CardHeader className="space-y-2">
					<div className="flex items-center justify-between gap-3">
						<div>
							<CardTitle>{bucket.name}</CardTitle>
							<p className="text-sm text-muted-foreground">{bucket.description}</p>
						</div>
						<Button onClick={() => navigate({ to: '/try' })}>Add a term</Button>
					</div>

					<div className="flex items-center gap-2">
						<Label htmlFor="try-search" className="sr-only">
							Search
						</Label>
						<Input
							id="try-search"
							placeholder="Search terms…"
							value={search.term ?? ''}
							onChange={(e) =>
								navigate({
									to: '/try/bucket/$slug',
									params: { slug: bucket.slug },
									search: { term: e.target.value || undefined },
									replace: true,
								})
							}
						/>
					</div>
				</CardHeader>
				<CardContent>
					<TryBucketTable columns={columns} data={filtered} rowSelection={rowSelection} onRowSelectionChange={setRowSelection} />
				</CardContent>
			</Card>

			<Dialog
				open={moveOpen}
				onOpenChange={(open) => {
					if (!open) {
						setMoveOpen(false);
						setMoveTarget(null);
						setSelectedBucket(null);
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Move to bucket</DialogTitle>
						<DialogDescription>Select a destination bucket.</DialogDescription>
					</DialogHeader>

					<div className="py-2">
						{availableMoveBuckets.length === 0 ? (
							<p className="text-sm text-muted-foreground">No other buckets available.</p>
						) : (
							<Select value={selectedBucket ?? ''} onValueChange={(v) => setSelectedBucket(v as TryBucketSlug)}>
								<SelectTrigger>
									<SelectValue placeholder="Choose a bucket" />
								</SelectTrigger>
								<SelectContent>
									{availableMoveBuckets.map((b) => (
										<SelectItem key={b.slug} value={b.slug}>
											{b.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setMoveOpen(false)}>
							Cancel
						</Button>
						<Button
							disabled={!selectedBucket || !moveTarget}
							onClick={() => {
								if (!moveTarget || !selectedBucket) return;
								moveTryTerm(moveTarget.termId, selectedBucket);
								setMoveOpen(false);
							}}
						>
							Move
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={deleteOpen}
				onOpenChange={(open) => {
					if (!open) {
						setDeleteOpen(false);
						setDeleteTarget(null);
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Delete term</DialogTitle>
						<DialogDescription>This only deletes local trial data.</DialogDescription>
					</DialogHeader>
					<div className="text-sm">
						Delete <span className="font-medium">{deleteTarget?.displayTerm}</span>?
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteOpen(false)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={!deleteTarget}
							onClick={() => {
								if (!deleteTarget) return;
								deleteTryTerm(deleteTarget.termId);
								setDeleteOpen(false);
							}}
						>
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
