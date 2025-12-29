import { useForm } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useRef } from 'react';
import * as v from 'valibot';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { ApiRequestError } from '@/lib/api-client';
import { createBatch } from '../api/create-batch';

const TERM_MIN = 1;
const TERM_MAX = 200;

function parseTerms(input: string): string[] {
	return input
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

const termsSchema = v.pipe(
	v.string(),
	v.transform((s) => parseTerms(s)),
	v.minLength(TERM_MIN, `At least ${TERM_MIN} term is required`),
	v.maxLength(TERM_MAX, `At most ${TERM_MAX} terms are allowed`)
);

function getBatchErrorMessage(err: unknown): string {
	if (err instanceof ApiRequestError) {
		if (err.code === 'IDEMPOTENCY_CONFLICT') {
			return 'Request conflict. Please modify your input and try again.';
		}
		if (err.code === 'UNAUTHORIZED') {
			return 'Your session has expired. Please sign in again.';
		}
		return err.message;
	}
	return 'An unexpected error occurred. Please try again.';
}

export function BatchNewPage() {
	const navigate = useNavigate();

	// Track clientRequestId: generate once per submit attempt, regenerate on edit after failure
	const clientRequestIdRef = useRef<string | null>(null);
	const hasFailedRef = useRef(false);

	const form = useForm({
		defaultValues: {
			terms: '',
		},
		validators: {
			onSubmit: v.object({ terms: termsSchema }),
		},
		onSubmit: async ({ value }) => {
			// Generate clientRequestId if we don't have one
			if (!clientRequestIdRef.current) {
				clientRequestIdRef.current = crypto.randomUUID();
			}

			try {
				const response = await createBatch({
					terms: value.terms,
					clientRequestId: clientRequestIdRef.current,
				});

				// Success - navigate to the batch page
				navigate({ to: '/batch/$batchId', params: { batchId: response.id } });
			} catch (err: unknown) {
				hasFailedRef.current = true;
				throw new Error(getBatchErrorMessage(err));
			}
		},
	});

	const handleTermsChange = useCallback((_value: string) => {
		// If user edits after a failure, clear the clientRequestId so we generate a new one
		if (hasFailedRef.current) {
			clientRequestIdRef.current = null;
			hasFailedRef.current = false;
		}
	}, []);

	const termCount = parseTerms(form.state.values.terms).length;

	return (
		<div className="max-w-2xl">
			<h2 className="text-xl font-semibold">Capture New Batch</h2>
			<p className="mt-2 text-zinc-400">Enter your terms, one per line. Brain dump welcome — duplicates and rough ideas are fine.</p>

			<form
				className="mt-6"
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
			>
				<FieldGroup>
					<form.Field name="terms">
						{(field) => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
							const hasFormError = form.state.errors.length > 0;
							return (
								<Field data-invalid={isInvalid}>
									<FieldLabel htmlFor={field.name} className="sr-only">
										Terms
									</FieldLabel>
									<Textarea
										id={field.name}
										name={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => {
											field.handleChange(e.target.value);
											handleTermsChange(e.target.value);
										}}
										placeholder="Enter terms here, one per line..."
										className="h-64 resize-none font-mono text-sm"
										disabled={form.state.isSubmitting}
										aria-invalid={isInvalid}
									/>
									<div className="flex items-center justify-between">
										<FieldDescription className={termCount >= TERM_MIN && termCount <= TERM_MAX ? '' : 'text-amber-500'}>
											{termCount} term{termCount !== 1 ? 's' : ''}
										</FieldDescription>
										<FieldDescription>
											{TERM_MIN}–{TERM_MAX} terms required
										</FieldDescription>
									</div>
									{isInvalid && <FieldError errors={field.state.meta.errors?.map((e) => (typeof e === 'string' ? e : e?.message))} />}
									{hasFormError &&
										(() => {
											const err = form.state.errors[0];
											let msg: string | undefined;
											if (typeof err === 'string') {
												msg = err;
											} else if (err && typeof err === 'object' && 'message' in err) {
												msg = typeof err.message === 'string' ? err.message : undefined;
											}
											return msg ? <p className="text-sm text-destructive">{msg}</p> : null;
										})()}
								</Field>
							);
						}}
					</form.Field>
				</FieldGroup>

				<div className="mt-4">
					<Button type="submit" className="w-full" disabled={form.state.isSubmitting}>
						{form.state.isSubmitting ? 'Submitting...' : 'Submit Batch'}
					</Button>
				</div>
			</form>
		</div>
	);
}
