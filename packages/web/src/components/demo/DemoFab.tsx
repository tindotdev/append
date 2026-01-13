import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { regenerateTelemetrySample } from '@/features/dashboard/telemetry/actions';

export function DemoFab() {
	const [isBusy, setIsBusy] = useState(false);

	return (
		<Button
			variant="outline"
			size="icon"
			className="fixed bottom-4 right-4 z-40 size-9 rounded-full border-zinc-800 bg-zinc-950/80 shadow-sm backdrop-blur-sm hover:bg-zinc-900"
			title="Regenerate demo data"
			disabled={isBusy}
			onClick={async () => {
				setIsBusy(true);
				try {
					await regenerateTelemetrySample();
					toast.success('Demo data regenerated');
				} catch (err) {
					console.error(err);
					toast.error('Failed to regenerate demo data');
				} finally {
					setIsBusy(false);
				}
			}}
		>
			<RotateCcw className="size-4" />
		</Button>
	);
}
