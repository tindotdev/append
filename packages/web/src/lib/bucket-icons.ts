/**
 * Bucket icon registry - maps icon names to Lucide components
 * Used to render bucket icons from stored icon names
 */

import type { LucideIcon } from 'lucide-react';
import {
	Archive,
	BookOpen,
	Briefcase,
	Calendar,
	Clock,
	Code,
	Cpu,
	Database,
	FileText,
	Folder,
	FolderOpen,
	GitBranch,
	Inbox,
	Layers,
	Mail,
	Package,
	Server,
	ShoppingCart,
	Terminal,
	Users,
} from 'lucide-react';

export const BUCKET_ICON_MAP: Record<string, LucideIcon> = {
	FolderOpen,
	Folder,
	Archive,
	Briefcase,
	Code,
	Database,
	BookOpen,
	FileText,
	Layers,
	Package,
	Server,
	Terminal,
	Inbox,
	Mail,
	ShoppingCart,
	Users,
	Calendar,
	Clock,
	GitBranch,
	Cpu,
};

/**
 * Get a Lucide icon component by name
 * Returns FolderOpen as default if icon not found
 */
export function getBucketIcon(iconName?: string | null): LucideIcon {
	if (!iconName) return FolderOpen;
	return BUCKET_ICON_MAP[iconName] || FolderOpen;
}
