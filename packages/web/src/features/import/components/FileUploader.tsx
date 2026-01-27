/**
 * FilePond-based file uploader for markdown files.
 */
import FilePondPluginFileValidateSize from 'filepond-plugin-file-validate-size';
import FilePondPluginFileValidateType from 'filepond-plugin-file-validate-type';
import { useCallback, useRef } from 'react';
import { FilePond, registerPlugin } from 'react-filepond';
import { API_URL } from '@/lib/api-rpc';

// Import FilePond styles
import 'filepond/dist/filepond.min.css';

export interface FileUploaderProps {
	onFilesUploaded: (importId: string) => void;
	onError: (error: string) => void;
	disabled?: boolean;
}

const MAX_FILE_SIZE = '1MB';
const MAX_TOTAL_FILE_SIZE = '10MB';
const MAX_FILES = 10;
const ACCEPTED_FILE_TYPES = ['text/markdown'];

// Register plugins once at module level
registerPlugin(FilePondPluginFileValidateSize);
registerPlugin(FilePondPluginFileValidateType);

export function FileUploader({ onFilesUploaded, onError, disabled }: FileUploaderProps) {
	// Generate a single importId for all files in this upload session
	const importIdRef = useRef<string>(crypto.randomUUID());
	const pendingFilesRef = useRef<number>(0);
	const completedFilesRef = useRef<number>(0);
	const hasErrorRef = useRef<boolean>(false);

	// Reset state for new upload session
	const resetSession = useCallback(() => {
		importIdRef.current = crypto.randomUUID();
		pendingFilesRef.current = 0;
		completedFilesRef.current = 0;
		hasErrorRef.current = false;
	}, []);

	return (
		<div className="filepond-wrapper">
			<FilePond
				maxFileSize={MAX_FILE_SIZE}
				maxTotalFileSize={MAX_TOTAL_FILE_SIZE}
				allowMultiple={true}
				maxFiles={MAX_FILES}
				labelIdle='Drag & drop your .md files or <span class="filepond--label-action">Browse</span>'
				disabled={disabled}
				onaddfile={() => {
					// Track how many files are being added
					pendingFilesRef.current++;
				}}
				onremovefile={() => {
					// If user removes a file before upload starts
					if (pendingFilesRef.current > 0) {
						pendingFilesRef.current--;
					}
				}}
				server={{
					url: `${API_URL}/api/import`,
					process: {
						url: '/upload',
						method: 'POST',
						withCredentials: true,
						headers: {
							'X-Import-Id': importIdRef.current,
						},
						ondata: (formData: FormData) => {
							// Add importId to form data as well for reliability
							formData.append('importId', importIdRef.current);
							return formData;
						},
						onload: (_response: string) => {
							completedFilesRef.current++;
							// Only trigger callback when ALL files are uploaded
							if (completedFilesRef.current >= pendingFilesRef.current && !hasErrorRef.current) {
								const importId = importIdRef.current;
								resetSession();
								onFilesUploaded(importId);
							}
							return importIdRef.current;
						},
						onerror: (response: string) => {
							hasErrorRef.current = true;
							try {
								const error = JSON.parse(response);
								onError(error.error?.message || 'Upload failed');
							} catch {
								onError('Upload failed');
							}
						},
					},
				}}
				acceptedFileTypes={ACCEPTED_FILE_TYPES}
				fileValidateTypeDetectType={(file, type) => {
					return new Promise((resolve, reject) => {
						// Browsers often report .md as "text/plain" or empty - detect by extension
						if (/\.(md|markdown)$/i.test(file.name)) return resolve('text/markdown');

						// For other files, keep browser's detected type (will fail validation)
						if (type) return resolve(type);

						reject();
					});
				}}
				fileValidateTypeLabelExpectedTypesMap={{ 'text/markdown': '.md' }}
				labelFileTypeNotAllowed="Only Markdown files (.md) are allowed"
				credits={false}
			/>
			<style>{`
				.filepond-wrapper .filepond--root {
					font-family: inherit;
				}
				.filepond-wrapper .filepond--panel-root {
					background-color: hsl(var(--card));
					border: 1px dashed hsl(var(--border));
					border-radius: 0.5rem;
				}
				.filepond-wrapper .filepond--drop-label {
					color: hsl(var(--muted-foreground));
				}
				.filepond-wrapper .filepond--drop-label label {
					font-size: 0.875rem;
				}
				.filepond-wrapper .filepond--label-action {
					color: hsl(var(--primary));
					text-decoration-color: hsl(var(--primary));
				}
				.filepond-wrapper .filepond--label-action:hover {
					text-decoration: underline;
				}
				.filepond-wrapper .filepond--file-action-button {
					cursor: pointer;
				}
				.filepond-wrapper .filepond--item-panel {
					background-color: hsl(var(--border));
				}
				.filepond-wrapper [data-filepond-item-state='processing-complete'] .filepond--item-panel {
					background-color: hsl(var(--success));
				}
				.filepond-wrapper [data-filepond-item-state='error'] .filepond--item-panel {
					background-color: hsl(var(--destructive));
				}
			`}</style>
		</div>
	);
}
