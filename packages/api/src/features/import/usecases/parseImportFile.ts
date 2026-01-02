import { parseMarkdown } from '../parser/parseMarkdown';
import { getFileContent, type ListedFile } from './uploadFiles';

export interface ParsedImportFile {
	filename: string;
	r2Key: string;
	entries: ReturnType<typeof parseMarkdown>['entries'];
	warnings: ReturnType<typeof parseMarkdown>['warnings'];
}

export async function parseImportFile(r2: R2Bucket, obj: ListedFile): Promise<ParsedImportFile | null> {
	const content = await getFileContent(r2, obj.key);
	if (!content) {
		return null;
	}

	// Extract filename from R2 key
	const filename = obj.key.split('/').pop() ?? obj.key;
	const { entries, warnings } = parseMarkdown(content);

	return {
		filename,
		r2Key: obj.key,
		entries,
		warnings,
	};
}
