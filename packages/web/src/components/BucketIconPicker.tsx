// Curated bucket-related icons (20 icons for minimal bundle size)
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
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type IconComponent = React.ComponentType<{ className?: string }>;

type PickItem = { kind: 'emoji'; value: string; label?: string } | { kind: 'icon'; value: string; label: string; component: IconComponent };

// Curated list of bucket icons (20 icons) - exported for reuse
export const BUCKET_ICONS: PickItem[] = [
	{ kind: 'icon', value: 'FolderOpen', label: 'Folder Open', component: FolderOpen },
	{ kind: 'icon', value: 'Folder', label: 'Folder', component: Folder },
	{ kind: 'icon', value: 'Archive', label: 'Archive', component: Archive },
	{ kind: 'icon', value: 'Briefcase', label: 'Briefcase', component: Briefcase },
	{ kind: 'icon', value: 'Code', label: 'Code', component: Code },
	{ kind: 'icon', value: 'Database', label: 'Database', component: Database },
	{ kind: 'icon', value: 'BookOpen', label: 'Book', component: BookOpen },
	{ kind: 'icon', value: 'FileText', label: 'Document', component: FileText },
	{ kind: 'icon', value: 'Layers', label: 'Layers', component: Layers },
	{ kind: 'icon', value: 'Package', label: 'Package', component: Package },
	{ kind: 'icon', value: 'Server', label: 'Server', component: Server },
	{ kind: 'icon', value: 'Terminal', label: 'Terminal', component: Terminal },
	{ kind: 'icon', value: 'Inbox', label: 'Inbox', component: Inbox },
	{ kind: 'icon', value: 'Mail', label: 'Mail', component: Mail },
	{ kind: 'icon', value: 'ShoppingCart', label: 'Shopping', component: ShoppingCart },
	{ kind: 'icon', value: 'Users', label: 'Users', component: Users },
	{ kind: 'icon', value: 'Calendar', label: 'Calendar', component: Calendar },
	{ kind: 'icon', value: 'Clock', label: 'Clock', component: Clock },
	{ kind: 'icon', value: 'GitBranch', label: 'Git', component: GitBranch },
	{ kind: 'icon', value: 'Cpu', label: 'CPU', component: Cpu },
];

// Default emoji recents (fallback if no recents in localStorage)
const DEFAULT_EMOJI_RECENTS: PickItem[] = [
	{ kind: 'emoji', value: '✅' },
	{ kind: 'emoji', value: '🔥' },
	{ kind: 'emoji', value: '✨' },
	{ kind: 'emoji', value: '🎉' },
	{ kind: 'emoji', value: '👍' },
	{ kind: 'emoji', value: '📚' },
	{ kind: 'emoji', value: '💡' },
	{ kind: 'emoji', value: '🚀' },
];

const RECENTS_KEY = 'bucket_icon_emoji_recents_v1';
const RECENTS_MAX = 24;

function loadRecents(): PickItem[] {
	try {
		const raw = localStorage.getItem(RECENTS_KEY);
		if (!raw) return DEFAULT_EMOJI_RECENTS;
		const parsed = JSON.parse(raw) as PickItem[];
		return Array.isArray(parsed) ? parsed.slice(0, RECENTS_MAX) : DEFAULT_EMOJI_RECENTS;
	} catch {
		return DEFAULT_EMOJI_RECENTS;
	}
}

function saveRecents(items: PickItem[]) {
	try {
		localStorage.setItem(RECENTS_KEY, JSON.stringify(items.slice(0, RECENTS_MAX)));
	} catch {
		// Ignore storage errors
	}
}

function upsertRecent(list: PickItem[], item: PickItem): PickItem[] {
	const key = `${item.kind}:${item.value}`;
	const next = [item, ...list.filter((x) => `${x.kind}:${x.value}` !== key)];
	return next.slice(0, RECENTS_MAX);
}

export interface BucketIconPickerProps {
	currentIcon?: string | null;
	onIconChange: (icon: string | null) => void;
	children?: React.ReactNode; // Custom trigger element
}

export function BucketIconPicker({ currentIcon, onIconChange, children }: BucketIconPickerProps) {
	const [open, setOpen] = React.useState(false);
	const [recents, setRecents] = React.useState<PickItem[]>([]);
	const [iconQuery, setIconQuery] = React.useState('');
	const [emojiQuery, setEmojiQuery] = React.useState('');

	React.useEffect(() => setRecents(loadRecents()), []);

	const filteredIcons = React.useMemo(() => {
		const q = iconQuery.trim().toLowerCase();
		if (!q) return BUCKET_ICONS;
		return BUCKET_ICONS.filter((i) => i.kind === 'icon' && i.label.toLowerCase().includes(q));
	}, [iconQuery]);

	const filteredEmojiRecents = React.useMemo(() => {
		const q = emojiQuery.trim();
		if (!q) return recents.filter((x) => x.kind === 'emoji');
		return recents.filter((x) => x.kind === 'emoji' && (x.value.includes(q) || x.label?.includes(q)));
	}, [emojiQuery, recents]);

	function pick(item: PickItem) {
		const next = upsertRecent(recents, item);
		setRecents(next);
		saveRecents(next);

		if (item.kind === 'emoji') {
			onIconChange(item.value);
		} else {
			onIconChange(item.value); // Store icon component name
		}

		setOpen(false);
	}

	function clearRecents() {
		setRecents(DEFAULT_EMOJI_RECENTS);
		saveRecents(DEFAULT_EMOJI_RECENTS);
	}

	// Default trigger if no children provided
	const trigger = children || (
		<Button variant="ghost" size="icon" aria-label="Change bucket icon">
			{currentIcon ? (
				// Try to render current icon if it exists in our list
				(() => {
					const iconItem = BUCKET_ICONS.find((i) => i.kind === 'icon' && i.value === currentIcon);
					if (iconItem && iconItem.kind === 'icon') {
						const IconComponent = iconItem.component;
						return <IconComponent className="h-4 w-4" />;
					}
					// If it's an emoji or unknown icon, just display the value
					return <span className="text-sm">{currentIcon}</span>;
				})()
			) : (
				<FolderOpen className="h-4 w-4" />
			)}
		</Button>
	);

	return (
		<Popover open={open} onOpenChange={setOpen} modal={false}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>

			<PopoverContent
				className="w-80 p-0"
				align="end"
				onCloseAutoFocus={(e) => {
					e.preventDefault();
				}}
			>
				<Tabs defaultValue="icons" className="w-full">
					<div className="flex items-center justify-between border-b px-2 py-2">
						<TabsList className="h-8">
							<TabsTrigger value="icons" className="h-7 px-2 text-xs">
								Icons
							</TabsTrigger>
							<TabsTrigger value="emoji" className="h-7 px-2 text-xs">
								Emoji
							</TabsTrigger>
						</TabsList>

						<Button variant="ghost" size="sm" onClick={clearRecents} className="h-7 text-xs">
							Clear
						</Button>
					</div>

					<TabsContent value="icons" className="m-0">
						<div className="p-2">
							<Input value={iconQuery} onChange={(e) => setIconQuery(e.target.value)} placeholder="Search icons…" className="h-8" />
						</div>
						<ScrollArea className="h-56 px-2 pb-2">
							<div className="grid grid-cols-8 gap-1">
								{filteredIcons.map((item) => {
									if (item.kind !== 'icon') return null;
									const IconComponent = item.component;
									return (
										<Button key={item.value} variant="ghost" size="icon" className="h-9 w-9" onClick={() => pick(item)} title={item.label}>
											<IconComponent className="h-4 w-4" />
										</Button>
									);
								})}
							</div>
						</ScrollArea>
					</TabsContent>

					<TabsContent value="emoji" className="m-0">
						<div className="p-2">
							<Input value={emojiQuery} onChange={(e) => setEmojiQuery(e.target.value)} placeholder="Search recents…" className="h-8" />
						</div>

						<ScrollArea className="h-40 px-2 pb-2">
							<div className="grid grid-cols-8 gap-1">
								{filteredEmojiRecents.length ? (
									filteredEmojiRecents.map((item) => (
										<Button
											key={`${item.kind}:${item.value}`}
											variant="ghost"
											size="icon"
											className="h-9 w-9 text-lg"
											onClick={() => pick(item)}
											title={item.label ?? item.value}
										>
											{item.value}
										</Button>
									))
								) : (
									<div className="col-span-8 p-2 text-sm text-muted-foreground">
										No recent emoji. Use your system picker, then they'll show up here.
									</div>
								)}
							</div>
						</ScrollArea>

						<div className="border-t px-3 py-2 text-xs text-muted-foreground">
							Tip: system emoji picker — macOS <kbd>Ctrl</kbd>+<kbd>⌘</kbd>+<kbd>Space</kbd>, Windows <kbd>Win</kbd>+<kbd>.</kbd>
						</div>
					</TabsContent>
				</Tabs>
			</PopoverContent>
		</Popover>
	);
}

// Submenu version for use inside DropdownMenus
export interface BucketIconPickerMenuProps {
	onIconChange: (icon: string) => void;
	children: React.ReactNode; // The trigger element (usually DropdownMenuSubTrigger)
}

export function BucketIconPickerMenu({ onIconChange, children }: BucketIconPickerMenuProps) {
	return (
		<DropdownMenuSub>
			{children}
			<DropdownMenuSubContent className="w-56 p-2">
				<div className="grid grid-cols-8 gap-1">
					{BUCKET_ICONS.map((item) => {
						if (item.kind !== 'icon') return null;
						const IconComponent = item.component;
						return (
							<Button key={item.value} variant="ghost" size="icon" className="h-8 w-8" onClick={() => onIconChange(item.value)} title={item.label}>
								<IconComponent className="h-4 w-4" />
							</Button>
						);
					})}
				</div>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
