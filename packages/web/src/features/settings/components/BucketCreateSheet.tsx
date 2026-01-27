/**
 * Sheet for creating a new bucket from the sidebar.
 */

import { useForm } from '@tanstack/react-form';
import { HelpCircle, Palette } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCreateBucket } from '../api/user-bucket';
import { BucketColorPicker } from './BucketColorPicker';

// Slug validation regex: lowercase alphanumeric with hyphens
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface BucketCreateSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 50);
}

export function BucketCreateSheet({ open, onOpenChange }: BucketCreateSheetProps) {
	const [autoSlug, setAutoSlug] = useState(true);
	const createBucketMutation = useCreateBucket();

	const form = useForm({
		defaultValues: {
			slug: '',
			name: '',
			description: '',
			color: null as string | null,
		},
		onSubmit: async ({ value }) => {
			try {
				await createBucketMutation.mutateAsync({
					slug: value.slug,
					name: value.name,
					description: value.description,
					color: value.color,
				});
				toast.success('Bucket created successfully');
				onOpenChange(false);
				// Reset form
				form.reset();
				setAutoSlug(true);
			} catch (_error) {
				toast.error('Failed to create bucket');
			}
		},
	});

	const handleOpenChange = (newOpen: boolean) => {
		if (!newOpen) {
			// Reset form when closing
			form.reset();
			setAutoSlug(true);
		}
		onOpenChange(newOpen);
	};

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetContent className="flex flex-col px-0">
				<SheetHeader className="px-6 pb-6">
					<SheetTitle>Create Bucket</SheetTitle>
					<SheetDescription>Add a new bucket to organize your terms.</SheetDescription>
				</SheetHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="flex-1 flex flex-col"
				>
					<div className="flex-1 overflow-y-auto space-y-5 px-6 pb-4">
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
										onChange={(e) => {
											field.handleChange(e.target.value);
											// Auto-generate slug from name if not manually edited
											if (autoSlug) {
												form.setFieldValue('slug', slugify(e.target.value));
											}
										}}
										onBlur={field.handleBlur}
										placeholder="e.g., Backend Patterns"
										maxLength={100}
										disabled={createBucketMutation.isPending}
									/>
									{field.state.meta.errors.length > 0 && <FieldError>{field.state.meta.errors[0]}</FieldError>}
								</Field>
							)}
						</form.Field>

						<form.Field
							name="slug"
							validators={{
								onChange: ({ value }) => {
									if (!value.trim()) return 'Slug is required';
									if (!SLUG_REGEX.test(value)) return 'Slug must be lowercase letters, numbers, and hyphens only';
									if (value.length > 50) return 'Slug must be 50 characters or less';
									return undefined;
								},
							}}
						>
							{(field) => (
								<Field>
									<div className="flex items-center gap-1.5">
										<FieldLabel htmlFor="bucket-slug">Slug</FieldLabel>
										<Tooltip>
											<TooltipTrigger asChild>
												<HelpCircle className="size-3.5 text-muted-foreground cursor-help" />
											</TooltipTrigger>
											<TooltipContent>
												<p>A URL-friendly identifier. Cannot be changed after creation.</p>
											</TooltipContent>
										</Tooltip>
									</div>
									<Input
										id="bucket-slug"
										type="text"
										value={field.state.value}
										onChange={(e) => {
											field.handleChange(e.target.value.toLowerCase());
											setAutoSlug(false);
										}}
										onBlur={field.handleBlur}
										placeholder="e.g., backend-patterns"
										maxLength={50}
										disabled={createBucketMutation.isPending}
									/>
									{field.state.meta.errors.length > 0 && <FieldError>{field.state.meta.errors[0]}</FieldError>}
								</Field>
							)}
						</form.Field>

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
										disabled={createBucketMutation.isPending}
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
										<Button type="button" variant="outline" className="w-full justify-start gap-2" disabled={createBucketMutation.isPending}>
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
						<Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={createBucketMutation.isPending}>
							Cancel
						</Button>
						<Button type="submit" disabled={createBucketMutation.isPending}>
							{createBucketMutation.isPending ? 'Creating...' : 'Create Bucket'}
						</Button>
					</div>
				</form>
			</SheetContent>
		</Sheet>
	);
}
