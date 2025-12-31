# UI Improvements Roadmap

High-level plan for enhancing the Append UI with shadcn/ui components.

## Current State

### Existing shadcn/ui Components

```
packages/web/src/components/ui/
├── button.tsx
├── dropdown-menu.tsx
├── field.tsx
├── input.tsx
├── label.tsx
├── select.tsx
└── textarea.tsx
```

### UI Patterns in Use

- Custom inline styles for status badges
- Native `<select>` elements in some places
- Manual loading spinners (`animate-spin` divs)
- Inline error/success states with custom styling
- FilePond for file uploads (import feature)

---

## Improvement Opportunities by Feature

### 1. Import Feature (`features/import/`)

| Component | Current | Improvement |
|-----------|---------|-------------|
| **Select** | Native `<select>` for bucket mapping | Use existing shadcn Select |
| **Card** | Manual `div` with borders | Add Card component |
| **Badge** | Inline text with counts | Add Badge for warnings, counts |
| **Alert** | Manual styled divs | Add Alert for parsing warnings |
| **Progress** | None | Add Progress for upload/commit |
| **Skeleton** | "Loading..." text | Add Skeleton for preview loading |
| **Sonner** | None | Add toast for success/error |
| **Collapsible** | None | Expand to show parsed entries |
| **Table** | None | Preview entries in table format |

### 2. Batch Feature (`features/batch/`)

| Component | Current | Improvement |
|-----------|---------|-------------|
| **Badge** | `getStatusBadge()` with inline classes | Standardize with Badge component |
| **Card** | Manual borders/backgrounds | Use Card for batch items |
| **Empty** | Custom empty states | Add Empty component |
| **Skeleton** | "Loading..." text | Add Skeleton for list loading |
| **Button** | Mix of styled buttons | Consistent Button usage |
| **Pagination** | "Load more" button | Consider Pagination component |

### 3. Settings Feature (`features/settings/`)

| Component | Current | Improvement |
|-----------|---------|-------------|
| **Dialog** | None for confirmations | Add Dialog for delete confirmation |
| **Alert** | None | Add Alert for destructive actions |
| **Separator** | Manual dividers | Use Separator component |
| **Form** | Manual form handling | Consider Form wrapper |

### 4. Search Feature

| Component | Current | Improvement |
|-----------|---------|-------------|
| **Command** | None | Add Command for quick search |
| **Combobox** | None | Searchable bucket filter |
| **Empty** | Basic empty state | Standardize Empty component |

### 5. Global/Layout

| Component | Current | Improvement |
|-----------|---------|-------------|
| **Navigation Menu** | Custom NavLink | Consider Navigation Menu |
| **Breadcrumb** | None | Add for deep navigation |
| **Kbd** | None | Keyboard shortcut hints |
| **Sonner** | None | Global toast provider |
| **Tooltip** | None | Help text on icons |

---

## Priority Tiers

### Tier 1: Quick Wins (Low Effort, High Impact)

1. **Badge** - Replace inline badge styling across app
2. **Card** - Wrap content sections consistently
3. **Alert** - Standardize error/warning/success states
4. **Skeleton** - Replace "Loading..." text
5. **Sonner** - Global toast notifications

### Tier 2: Feature Enhancement

1. **Select** - Replace remaining native selects (Import page)
2. **Dialog** - Confirmation dialogs for destructive actions
3. **Table** - Preview tables, data display
4. **Progress** - Upload/commit progress indicators
5. **Empty** - Consistent empty state component

### Tier 3: UX Polish

1. **Collapsible/Accordion** - Expandable sections
2. **Tooltip** - Contextual help
3. **Command** - Quick search/navigation (Cmd+K)
4. **Breadcrumb** - Navigation context
5. **Kbd** - Keyboard shortcut display

---

## Implementation Notes

### Adding New Components

```bash
# Example: Add Card component
pnpm --filter @append/web dlx shadcn@latest add card
```

### Recommended Installation Order

```bash
# Tier 1
pnpm --filter @append/web dlx shadcn@latest add badge card alert skeleton sonner

# Tier 2
pnpm --filter @append/web dlx shadcn@latest add dialog table progress

# Tier 3
pnpm --filter @append/web dlx shadcn@latest add collapsible accordion tooltip command
```

### Sonner Setup

After adding Sonner, wrap the app in `providers.tsx`:

```tsx
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
```

---

## Design Tokens

Current theme uses Zinc scale for dark mode:

- Background: `zinc-900`, `zinc-950`
- Borders: `zinc-800`, `zinc-700`
- Text: `zinc-100` (primary), `zinc-400` (secondary), `zinc-500` (muted)
- Accent: `blue-500`, `blue-600`
- Success: `green-400`, `green-900`
- Warning: `yellow-400`, `yellow-500`
- Error: `red-400`, `red-800`

Ensure shadcn components are configured with matching CSS variables.

---

## Related

- [shadcn/ui documentation](https://ui.shadcn.com/)
- [Radix Primitives](https://www.radix-ui.com/primitives)
