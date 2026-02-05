export function normalizeTerm(term: string): string {
	return term.trim().toLowerCase().replace(/\s+/g, ' ');
}
