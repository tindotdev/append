import { Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BUCKET_COLORS } from '@/lib/bucket-colors';
import { cn } from '@/lib/utils';

interface BucketColorPickerProps {
	currentColor: string | null;
	onColorChange: (color: string | null) => void;
	children: React.ReactNode;
}

export function BucketColorPicker({ currentColor, onColorChange, children }: BucketColorPickerProps) {
	return (
		<Popover>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent className="w-64" align="start">
				<div className="space-y-2">
					<p className="text-sm font-medium">Choose a color</p>
					<div className="grid grid-cols-7 gap-2">
						{BUCKET_COLORS.map((color) => (
							<button
								key={color.label}
								type="button"
								className={cn(
									'h-8 w-8 rounded-full transition-all',
									'hover:scale-110 hover:ring-2 hover:ring-offset-2 hover:ring-ring',
									'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring',
									color.value === currentColor && 'ring-2 ring-offset-2 ring-ring',
									!color.value && 'border-2 border-dashed border-muted-foreground/50'
								)}
								style={{
									backgroundColor: color.value || 'transparent',
								}}
								onClick={() => onColorChange(color.value)}
								title={color.label}
							>
								{color.value === currentColor && <Check className="h-4 w-4 mx-auto text-primary-foreground" />}
								{!color.value && <span className="text-xs text-muted-foreground">×</span>}
							</button>
						))}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
