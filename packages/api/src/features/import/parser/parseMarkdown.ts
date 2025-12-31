/**
 * Parse ENG-LOG markdown format.
 *
 * Format: `- term: definition` (one per line)
 * - Use first `: ` as separator (terms can contain colons in definition)
 * - Skip empty lines and headers
 * - Inbox format (no definition) is parsed but flagged
 */

export interface ParsedEntry {
	/** Original line number (1-based) */
	lineNumber: number;
	/** The term before the colon */
	term: string;
	/** The definition after the colon (empty for inbox items) */
	definition: string;
	/** Whether this is an inbox-style entry (no definition) */
	isInbox: boolean;
}

export interface ParseWarning {
	lineNumber: number;
	message: string;
}

export interface ParseResult {
	entries: ParsedEntry[];
	warnings: ParseWarning[];
}

interface LineParseResult {
	entry?: ParsedEntry;
	warning?: ParseWarning;
}

/**
 * Parse a single line of markdown.
 *
 * @param line - The line to parse
 * @param lineNumber - Line number (1-based)
 * @returns Parsed entry and/or warning
 */
function parseLine(line: string, lineNumber: number): LineParseResult {
	const trimmed = line.trim();

	// Skip empty lines
	if (trimmed === '') {
		return {};
	}

	// Skip markdown headers
	if (trimmed.startsWith('#')) {
		return {
			warning: {
				lineNumber,
				message: 'Skipped header line',
			},
		};
	}

	// Must be a bullet point
	if (!trimmed.startsWith('- ')) {
		return {
			warning: {
				lineNumber,
				message: 'Skipped non-bullet line',
			},
		};
	}

	// Remove bullet prefix
	const content = trimmed.slice(2);

	// Find first `: ` separator (colon followed by space)
	const colonIndex = content.indexOf(': ');

	if (colonIndex === -1) {
		// No colon - inbox format (term only, no definition)
		const term = content.trim();
		if (term === '') {
			return {
				warning: {
					lineNumber,
					message: 'Skipped empty bullet',
				},
			};
		}
		return {
			entry: {
				lineNumber,
				term,
				definition: '',
				isInbox: true,
			},
		};
	}

	// Standard format: term: definition
	const term = content.slice(0, colonIndex).trim();
	const definition = content.slice(colonIndex + 2).trim();

	if (term === '') {
		return {
			warning: {
				lineNumber,
				message: 'Skipped bullet with empty term',
			},
		};
	}

	return {
		entry: {
			lineNumber,
			term,
			definition,
			isInbox: false,
		},
	};
}

/**
 * Parse markdown content into entries.
 *
 * @param content - Raw markdown file content
 * @returns Parsed entries and any warnings
 */
export function parseMarkdown(content: string): ParseResult {
	const lines = content.split('\n');
	const entries: ParsedEntry[] = [];
	const warnings: ParseWarning[] = [];

	for (let i = 0; i < lines.length; i++) {
		const lineNumber = i + 1;
		const line = lines[i];

		const result = parseLine(line, lineNumber);

		if (result.warning) {
			warnings.push(result.warning);
		}

		if (result.entry) {
			entries.push(result.entry);
		}
	}

	return { entries, warnings };
}
