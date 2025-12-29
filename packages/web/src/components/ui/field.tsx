import { Slot } from '@radix-ui/react-slot';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from './label';

/**
 * Field - container for form fields with TanStack Form
 */
function Field({
	className,
	orientation = 'vertical',
	...props
}: React.ComponentProps<'div'> & {
	orientation?: 'vertical' | 'horizontal' | 'responsive';
}) {
	return (
		<div
			data-slot="field"
			data-orientation={orientation}
			className={cn(
				'grid gap-2',
				orientation === 'horizontal' && 'flex flex-row items-center gap-3',
				orientation === 'responsive' && 'flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3',
				className
			)}
			{...props}
		/>
	);
}

/**
 * FieldGroup - groups multiple fields together
 */
function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
	return <div data-slot="field-group" className={cn('grid gap-4 [[data-slot=checkbox-group]_&]:gap-2', className)} {...props} />;
}

/**
 * FieldSet - semantic fieldset wrapper
 */
function FieldSet({ className, ...props }: React.ComponentProps<'fieldset'>) {
	return <fieldset data-slot="field-set" className={cn('grid gap-2', className)} {...props} />;
}

/**
 * FieldLegend - legend for fieldsets
 */
function FieldLegend({
	className,
	variant = 'default',
	...props
}: React.ComponentProps<'legend'> & {
	variant?: 'default' | 'label';
}) {
	return (
		<legend data-slot="field-legend" className={cn('text-sm font-medium', variant === 'label' && 'text-foreground', className)} {...props} />
	);
}

/**
 * FieldLabel - label for form fields
 */
function FieldLabel({ className, asChild, ...props }: React.ComponentProps<typeof Label> & { asChild?: boolean }) {
	const Comp = asChild ? Slot : Label;
	return <Comp data-slot="field-label" className={cn('text-sm font-medium', className)} {...props} />;
}

/**
 * FieldContent - wrapper for field content in horizontal layouts
 */
function FieldContent({ className, ...props }: React.ComponentProps<'div'>) {
	return <div data-slot="field-content" className={cn('grid gap-1 flex-1', className)} {...props} />;
}

/**
 * FieldTitle - title within field content
 */
function FieldTitle({ className, ...props }: React.ComponentProps<'p'>) {
	return <p data-slot="field-title" className={cn('text-sm font-medium', className)} {...props} />;
}

/**
 * FieldDescription - help text for form fields
 */
function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
	return <p data-slot="field-description" className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

/**
 * FieldError - displays validation errors from TanStack Form
 * Accepts various error formats from TanStack Form validators
 */
function FieldError({
	className,
	errors,
	...props
}: React.ComponentProps<'p'> & {
	errors?: Array<{ message?: string } | string | undefined> | undefined;
}) {
	if (!errors || errors.length === 0) return null;

	const firstError = errors[0];
	const message = typeof firstError === 'string' ? firstError : firstError?.message;
	if (!message) return null;

	return (
		<p data-slot="field-error" className={cn('text-sm text-destructive', className)} {...props}>
			{message}
		</p>
	);
}

/**
 * FieldSeparator - visual separator between field groups
 */
function FieldSeparator({ className, ...props }: React.ComponentProps<'hr'>) {
	return <hr data-slot="field-separator" className={cn('border-border', className)} {...props} />;
}

export { Field, FieldGroup, FieldSet, FieldLegend, FieldLabel, FieldContent, FieldTitle, FieldDescription, FieldError, FieldSeparator };
