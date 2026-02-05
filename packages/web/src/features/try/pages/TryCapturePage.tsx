import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useTryActions, useTryBuckets } from '../hooks';
import type { TryBucketSlug } from '../types';

export function TryCapturePage() {
	const navigate = useNavigate();
	const { buckets } = useTryBuckets();
	const { upsertTryTerm } = useTryActions();

	const defaultBucket = useMemo<TryBucketSlug>(() => buckets[0]?.slug ?? 'foundations', [buckets]);
	const [bucket, setBucket] = useState<TryBucketSlug>(defaultBucket);
	const [term, setTerm] = useState('');
	const [definition, setDefinition] = useState('');

	return (
		<div className="w-full space-y-4">
			<div>
				<h2 className="text-xl font-semibold">Try Append</h2>
				<p className="mt-1 text-sm text-muted-foreground">Create terms locally. Sign up only when you want to save and use AI suggestions.</p>
			</div>

			<Card className="w-full">
				<CardHeader>
					<CardTitle>Create a term</CardTitle>
					<CardDescription>Stored in this browser until you create an account.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="try-term">Term</Label>
						<Input id="try-term" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. idempotency key" autoComplete="off" />
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="try-bucket">Bucket</Label>
						<Select value={bucket} onValueChange={(v) => setBucket(v as TryBucketSlug)}>
							<SelectTrigger id="try-bucket">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{buckets.map((b) => (
									<SelectItem key={b.slug} value={b.slug}>
										{b.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="try-definition">Definition</Label>
						<Textarea
							id="try-definition"
							value={definition}
							onChange={(e) => setDefinition(e.target.value)}
							placeholder="Write a short explanation future-you will understand."
							rows={4}
						/>
					</div>

					<div className="flex items-center gap-2">
						<Button
							onClick={() => {
								const trimmedTerm = term.trim();
								const trimmedDef = definition.trim();
								if (!trimmedTerm) {
									toast.error('Term is required.');
									return;
								}
								if (!trimmedDef) {
									toast.error('Definition is required.');
									return;
								}
								const res = upsertTryTerm({ displayTerm: trimmedTerm, definition: trimmedDef, bucket });
								toast.success(res.created ? 'Term added' : 'Term updated');
								setTerm('');
								setDefinition('');
								navigate({ to: '/try/bucket/$slug', params: { slug: bucket }, search: { term: undefined } });
							}}
						>
							Add term
						</Button>
						<Button
							variant="outline"
							onClick={() => navigate({ to: '/try/bucket/$slug', params: { slug: bucket }, search: { term: undefined } })}
						>
							View bucket
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
