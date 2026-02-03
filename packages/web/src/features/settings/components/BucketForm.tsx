/**
 * Form for creating or editing a bucket.
 */

import { useForm } from '@tanstack/react-form';
import { HelpCircle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SLUG_REGEX, slugify } from '@/lib/bucket-utils';
import type { UserBucket } from '../api/user-bucket';

interface BucketFormProps {
	bucket?: UserBucket; // If provided, we're editing
	onSubmit: (data: BucketFormData) => Promise<void>;
	onCancel: () => void;
	isPending: boolean;
}

export interface BucketFormData {
	slug: string;
	name: string;
	description: string;
}

export function BucketForm({ bucket, onSubmit, onCancel, isPending }: BucketFormProps) {
	const isEditing = !!bucket;
	const [autoSlug, setAutoSlug] = useState(!isEditing);

	const form = useForm({
		defaultValues: {
			slug: bucket?.slug ?? '',
			name: bucket?.name ?? '',
			description: bucket?.description ?? '',
		},
		onSubmit: async ({ value }) => {
			await onSubmit({
				slug: value.slug,
				name: value.name,
				description: value.description,
			});
		},
	});

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			className="space-y-4"
		>
			<form.Field
				name="name"
				validators={{
					onChange: ({ value }) => {
						if (!value.trim()) return 'Name is required';
						if (value.length > 64) return 'Name must be 64 characters or less';
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
								// Auto-generate slug from name if not editing and not manually edited
								if (autoSlug && !isEditing) {
									form.setFieldValue('slug', slugify(e.target.value));
								}
							}}
							onBlur={field.handleBlur}
							placeholder="e.g., Backend Patterns"
							maxLength={64}
							disabled={isPending}
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
						if (value.length < 2) return 'Slug must be at least 2 characters';
						if (!SLUG_REGEX.test(value)) return 'Slug must be lowercase letters, numbers, and hyphens only';
						if (value.length > 32) return 'Slug must be 32 characters or less';
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
							maxLength={32}
							disabled={isPending || isEditing}
						/>
						{field.state.meta.errors.length > 0 && <FieldError>{field.state.meta.errors[0]}</FieldError>}
						{isEditing && <p className="text-xs text-muted-foreground mt-1">Slug cannot be changed after creation.</p>}
					</Field>
				)}
			</form.Field>

			<form.Field
				name="description"
				validators={{
					onChange: ({ value }) => {
						if (!value.trim()) return 'Description is required';
						if (value.length > 256) return 'Description must be 256 characters or less';
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
							maxLength={256}
							disabled={isPending}
						/>
						{field.state.meta.errors.length > 0 && <FieldError>{field.state.meta.errors[0]}</FieldError>}
						<p className="text-xs text-muted-foreground mt-1">Used by AI to categorize terms.</p>
					</Field>
				)}
			</form.Field>

			<div className="flex items-center justify-end gap-3 pt-4">
				<Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
					Cancel
				</Button>
				<Button type="submit" disabled={isPending}>
					{isPending ? 'Saving...' : isEditing ? 'Update Bucket' : 'Create Bucket'}
				</Button>
			</div>
		</form>
	);
}
