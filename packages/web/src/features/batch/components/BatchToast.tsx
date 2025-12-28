export function BatchToast({ message }: { message: string | null }) {
	if (!message) return null;
	return (
		<div className="fixed top-4 right-4 z-50 px-4 py-3 bg-amber-900/90 border border-amber-700 rounded-lg text-amber-200 shadow-lg">
			{message}
		</div>
	);
}
