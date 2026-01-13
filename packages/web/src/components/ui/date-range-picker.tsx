import { Calendar as CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DateRangePickerProps {
	from: Date;
	to: Date;
	onRangeChange: (from: Date, to: Date) => void;
	disabled?: boolean;
	className?: string;
}

function formatDateRange(from: Date, to: Date): string {
	const formatDate = (date: Date) => {
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		});
	};

	return `${formatDate(from)} - ${formatDate(to)}`;
}

export function DateRangePicker({ from, to, onRangeChange, disabled, className }: DateRangePickerProps) {
	const [open, setOpen] = useState(false);
	const [date, setDate] = useState<DateRange | undefined>({
		from,
		to,
	});

	const handleSelect = (range: DateRange | undefined) => {
		setDate(range);
		if (range?.from && range?.to) {
			onRangeChange(range.from, range.to);
			// Close popover after both dates are selected
			setOpen(false);
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					disabled={disabled}
					className={cn('w-full justify-start text-left font-normal', !date && 'text-muted-foreground', className)}
				>
					<CalendarIcon className="mr-2 h-4 w-4" />
					{date?.from ? formatDateRange(date.from, date.to || date.from) : <span>Pick a date range</span>}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar mode="range" defaultMonth={date?.from} selected={date} onSelect={handleSelect} numberOfMonths={2} />
			</PopoverContent>
		</Popover>
	);
}
