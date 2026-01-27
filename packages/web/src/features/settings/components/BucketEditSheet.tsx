/**
 * Sheet for editing an existing bucket from the sidebar.
 */

import { useForm } from '@tanstack/react-form';
import { Palette } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { type UserBucket, useUpdateBucket } from '../api/user-bucket';
import { BucketColorPicker } from './BucketColorPicker';

interface BucketEditSheetProps {
	bucket: UserBucket | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function BucketEditSheet({ bucket, open, onOpenChange }: BucketEditSheetProps) {
	const updateBucketMutation = useUpdateBucket();

	const form = useForm({
		defaultValues: {
			name: bucket?.name ?? '',
			description: bucket?.description ?? '',
			color: bucket?.color ?? null,
		},
		onSubmit: async ({ value }) => {
			if (!bucket) return;

			try {
				await updateBucketMutation.mutateAsync({
					id: bucket.id,
					input: {
						name: value.name,
						description: value.description,
						color: value.color,
					},
				});
				toast.success('Bucket updated successfully');
				onOpenChange(false);
			} catch (_error) {
				toast.error('Failed to update bucket');
			}
		},
	});

	// Reset form when bucket changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: form methods are stable
	useEffect(() => {
		if (bucket) {
			form.reset();
			form.setFieldValue('name', bucket.name);
			form.setFieldValue('description', bucket.description);
			form.setFieldValue('color', bucket.color ?? null);
		}
	}, [bucket]);

	const handleOpenChange = (newOpen: boolean) => {
		if (!newOpen) {
			// Reset form when closing
			form.reset();
		}
		onOpenChange(newOpen);
	};

	if (!bucket) return null;

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetContent className="flex flex-col px-0">
				<SheetHeader className="px-6 pb-6">
					<SheetTitle>Edit Bucket</SheetTitle>
					<SheetDescription>Update bucket details. The slug cannot be changed after creation.</SheetDescription>
				</SheetHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="flex-1 flex flex-col"
				>
					<div className="px-6 space-y-4 flex-1">
						<form.Field
							name="name"
							validators={{
								onChange: ({ value }) => {
									if (!value.trim()) return 'Name is required';
									if (value.length > 100) return 'Name must be 100 characters or less';
									return undefined;
								},
							}}
						>
							{(field) => (
								<Field>
									<FieldLabel htmlFor="bucket-name">Name</FieldLabel>
									<Input
										id="bucket-name"
										type="text"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										placeholder="e.g., Backend Patterns"
										maxLength={100}
										disabled={updateBucketMutation.isPending}
									/>
									{field.state.meta.errors.length > 0 && <FieldError>{field.state.meta.errors[0]}</FieldError>}
								</Field>
							)}
						</form.Field>

						{/* Slug field (disabled, read-only) */}
						<Field>
							<FieldLabel htmlFor="bucket-slug">Slug</FieldLabel>
							<Input id="bucket-slug" type="text" value={bucket.slug} disabled className="bg-muted" />
							<p className="text-xs text-muted-foreground mt-1">Slug cannot be changed after creation.</p>
						</Field>

						<form.Field
							name="description"
							validators={{
								onChange: ({ value }) => {
									if (!value.trim()) return 'Description is required';
									if (value.length > 500) return 'Description must be 500 characters or less';
									return undefined;
								},
							}}
						>
							{(field) => (
								<Field>
									<FieldLabel htmlFor="bucket-description">Description</FieldLabel>
									<Input
										id="bucket-description"
										type="text"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										placeholder="e.g., Server-side patterns, APIs, databases"
										maxLength={500}
										disabled={updateBucketMutation.isPending}
									/>
									{field.state.meta.errors.length > 0 && <FieldError>{field.state.meta.errors[0]}</FieldError>}
									<p className="text-xs text-muted-foreground mt-1">Used by AI to categorize terms.</p>
								</Field>
							)}
						</form.Field>

						<form.Field name="color">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="bucket-color">Color (optional)</FieldLabel>
									<BucketColorPicker currentColor={field.state.value} onColorChange={(color) => field.handleChange(color)}>
										<Button type="button" variant="outline" className="w-full justify-start gap-2" disabled={updateBucketMutation.isPending}>
											<Palette className="size-4" />
											<span className="flex-1 text-left">
												{field.state.value ? (
													<span className="flex items-center gap-2">
														<span className="size-3 rounded-full ring-1 ring-border/50" style={{ backgroundColor: field.state.value }} />
														Color selected
													</span>
												) : (
													'Choose a color'
												)}
											</span>
										</Button>
									</BucketColorPicker>
								</Field>
							)}
						</form.Field>
					</div>

					<div className="flex items-center justify-end gap-3 px-6 py-6 mt-auto border-t">
						<Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={updateBucketMutation.isPending}>
							Cancel
						</Button>
						<Button type="submit" disabled={updateBucketMutation.isPending}>
							{updateBucketMutation.isPending ? 'Updating...' : 'Update Bucket'}
						</Button>
					</div>
				</form>
			</SheetContent>
		</Sheet>
	);
}
