'use client';

import type * as React from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface DetailDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	subtitle?: string;
	children: React.ReactNode;
	className?: string;
}

export function DetailDrawer({ open, onOpenChange, title, subtitle, children, className }: DetailDrawerProps) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className={cn('w-full sm:max-w-[400px]', className)}>
				<SheetHeader>
					<SheetTitle>{title}</SheetTitle>
					{subtitle && <SheetDescription>{subtitle}</SheetDescription>}
				</SheetHeader>
				<div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
			</SheetContent>
		</Sheet>
	);
}
