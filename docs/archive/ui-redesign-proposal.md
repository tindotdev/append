# UI Redesign Proposal: Linear-Style Single-Page Layout

> Status: **Implemented (Phase 1 Complete)**
> Created: 2026-01-01
> Implemented: 2026-01-01 (commits: a232f06, 6b708c4)
> Archived: 2026-01-01
> Author: Claude (via `/tasks:do`)
>
> **Note**: This proposal has been implemented. Phase 1 (sidebar layout) is complete. See ADR 0015 for the canonical decision record. This document is preserved for historical reference.

## Executive Summary

This document proposes a comprehensive UI redesign to transform append from a multi-page SPA into a Linear-inspired single-page application with persistent sidebar navigation, dense keyboard-optimized UI, and support for future multi-panel workflows.

**Key Benefits**:

- Persistent sidebar reduces context switching
- Dense, keyboard-first UI improves productivity
- Incremental, low-risk migration path
- No URL or route changes required
- All existing functionality preserved

---

## Component Decisions (Finalized)

### shadcn/ui Blocks Selected

| Component | Block | Install Command |
|-----------|-------|-----------------|
| **Sidebar** | `sidebar-07` | `npx shadcn@latest add sidebar-07` |
| **Login** | `login-03` | `npx shadcn@latest add login-03` |

### Sidebar: sidebar-07

**Why sidebar-07:**
- Collapses to 64px icon-only mode (`collapsible="icon"`)
- Matches our Linear-style mockups exactly
- Simple structure (not overengineered with nested levels)
- Works with our `Cmd+\` toggle shortcut plan

**Key Features:**
- `SidebarProvider` - Manages collapse state
- `useSidebar()` hook - `state`, `open`, `toggleSidebar`, `isMobile`
- `SidebarRail` - Hover to toggle (optional)
- Separate CSS variables for sidebar theming

**What it installs:**
- `components/ui/sidebar.tsx` - Core sidebar components
- `hooks/use-mobile.tsx` - Mobile detection hook
- Example layout showing icon-collapse pattern

### Login: login-03

**Why login-03:**
- Clean muted background with centered card
- Easily adaptable for Google SSO-only (no email/password form)
- Polished, modern aesthetic

**Adaptation needed:**
- Remove email/password form fields
- Keep only "Sign in with Google" button
- Retain card layout and branding

### Configuration

**Existing shadcn setup** (`packages/web/components.json`):
- Style: `new-york`
- Base color: `zinc`
- Icons: `lucide`
- CSS variables: enabled

**Sidebar CSS variables to add** (`src/main.css`):
```css
--sidebar-background: ...
--sidebar-foreground: ...
--sidebar-primary: ...
--sidebar-accent: ...
--sidebar-border: ...
```

---

## Current Architecture Analysis

### Overview

The web app is currently structured as a **multi-page SPA** using TanStack Router with distinct routes:

- `/sign-in` - Authentication (public)
- `/batch/new` - Primary capture screen (default landing)
- `/batch/:batchId` - Batch review/edit
- `/batch` - Batch list
- `/bucket/:slug` - Bucket feed view
- `/search` - Search interface
- `/import` - Import wizard
- `/export` - Export interface
- `/settings` - Settings management

### Current Layout Pattern

```
┌─────────────────────────────────────────────────┐
│ Header: [Logo] [Buckets▾] [Nav] [Capture] [User]│
├─────────────────────────────────────────────────┤
│                                                 │
│              <Outlet for Routes>                │
│                                                 │
│          (Full page changes per route)          │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Complete View & Component Inventory

### Pages (Route-Level Components)

#### Auth Feature

- **SignInPage** (`features/auth/pages/SignInPage.tsx`)
  - Google OAuth sign-in button
  - "append" branding
  - Minimal design

#### Batch Feature (Core Workflow)

- **BatchNewPage** (`features/batch/pages/BatchNewPage.tsx`)
  - Primary capture interface
  - Default landing page for authenticated users

- **BatchDetailPage** (`features/batch/pages/BatchDetailPage.tsx`)
  - Review and edit batch details
  - Candidate list with AI suggestions

- **BatchListPage** (`features/batch/pages/BatchListPage.tsx`)
  - View all batches

- **SearchPage** (`features/batch/pages/SearchPage.tsx`)
  - Search functionality

#### Bucket Feature

- **BucketFeedPage** (`features/bucket/pages/BucketFeedPage.tsx`)
  - Display bucket feed items

#### Import Feature

- **ImportPage** (`features/import/pages/ImportPage.tsx`)
  - File upload wizard
  - Preview and commit flow

#### Export Feature

- **ExportPage** (`features/export/pages/ExportPage.tsx`)
  - Export configuration and download

#### Settings Feature

- **SettingsPage** (`features/settings/pages/SettingsPage.tsx`)
  - Bucket management
  - User settings

### Layout Components

- **ProtectedLayout** (`components/layouts/ProtectedLayout.tsx`)
  - Sticky header with navigation
  - Command palette (Cmd+K)
  - User authentication UI
  - Main content outlet

### Feature-Specific Components

#### Batch Components

- BatchHeader
- CandidateList
- CandidateRow
- CandidateHeader
- CandidateActions
- CandidateInputs
- SuggestedValues
- EmptyState
- LoadingState
- ErrorState

#### Import Components

- FileUploader

#### Settings Components

- BucketManager
- BucketForm
- BucketList

### Shared UI Components (shadcn/ui based)

- alert, badge, breadcrumb, button, card
- collapsible, command, dialog, dropdown-menu
- field, input, kbd, label, progress
- select, separator, skeleton, sonner
- table, textarea, tooltip

## Analysis: Opportunities for Single-Page Redesign

### Current Pain Points

1. **Context switching**: Each feature requires full page navigation
2. **Lost context**: Moving between capture → review → feed loses working context
3. **Header redundancy**: Same header on every page
4. **No parallel workflows**: Can't view feed while capturing
5. **Command palette underutilized**: Good quick nav, but full-page switches break flow

### Modern Single-Page Patterns (Linear-inspired)

Linear's success comes from:

- **Persistent sidebar** for quick context switching
- **Multi-panel layout** allowing parallel workflows
- **Keyboard-first navigation** (already have Cmd+K)
- **Contextual right panels** for details without losing main view
- **Inline editing** reducing modal dialogs
- **Focus mode** hiding chrome when needed

## Recommended Design: Linear-Style Single-Page Layout

### Overview

Transform the append web app from multi-page navigation to a Linear-inspired single-page shell with:

- **Persistent left sidebar** for navigation (240px expanded, 64px collapsed)
- **Main content area** that supports single views and future split panels
- **Dense, keyboard-friendly UI** with compact spacing and typography
- **Deep-linkable URLs** maintaining all existing routes

### Key Design Decisions

1. **Capture-first workflow**: BatchNewPage remains the primary focal point (default landing)
2. **Persistent sidebar navigation**: Always-visible left sidebar replaces top header nav
3. **Incremental migration**: Phase 1 focuses on layout shell, Phase 2 adds detail panels (optional)
4. **No route changes**: All existing URLs remain exactly the same
5. **Dense UI**: Tighter spacing, smaller text sizes, more content per screen

### Layout Architecture

```
┌────────────────────────────────────────────────────────────┐
│                      AppShell                              │
│  ┌──────────┬──────────────────────────────────────────┐  │
│  │          │                                          │  │
│  │ Sidebar  │         PrimaryPanel                     │  │
│  │ (240px)  │         (flex-1)                         │  │
│  │          │                                          │  │
│  │  [Logo]  │  <Outlet> - TanStack Router content      │  │
│  │          │                                          │  │
│  │ Capture  │  - BatchNewPage (capture-first)          │  │
│  │ Search   │  - BatchListPage                         │  │
│  │ Batches  │  - BucketFeedPage                        │  │
│  │ ───────  │  - SearchPage                            │  │
│  │ Buckets: │  - ImportPage                            │  │
│  │  • Found │  - ExportPage                            │  │
│  │  • Ideas │  - SettingsPage                          │  │
│  │ ───────  │                                          │  │
│  │ Import   │                                          │  │
│  │ Export   │  (Future: DetailPanel slides from right) │  │
│  │          │                                          │  │
│  │ [User]   │                                          │  │
│  │ Settings │                                          │  │
│  └──────────┴──────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
AppShell (replaces ProtectedLayout)
├── Sidebar
│   ├── SidebarHeader (logo, collapse button)
│   ├── SidebarNav
│   │   ├── SidebarItem (Capture) [shortcut: C]
│   │   ├── SidebarItem (Search) [shortcut: /]
│   │   ├── SidebarItem (Batches) [shortcut: G B]
│   │   ├── SidebarSeparator
│   │   ├── SidebarSection (Buckets, collapsible)
│   │   │   ├── SidebarItem (per bucket)
│   │   ├── SidebarSeparator
│   │   ├── SidebarItem (Import) [shortcut: G I]
│   │   └── SidebarItem (Export) [shortcut: G E]
│   └── SidebarFooter (user menu, settings)
└── MainContent
    └── PrimaryPanel
        └── <Outlet /> (TanStack Router)
```

### Keyboard Shortcuts

| Key     | Action                                     |
| ------- | ------------------------------------------ |
| `C`     | Navigate to Capture (/batch/new)           |
| `/`     | Navigate to Search (or focus search input) |
| `G B`   | Go to Batches                              |
| `G I`   | Go to Import                               |
| `G S`   | Go to Settings                             |
| `Cmd+K` | Command palette (existing)                 |
| `Cmd+\` | Toggle sidebar collapse                    |
| `Esc`   | Close detail panel (future phase)          |

### Visual Style: Dense/Compact

**Current → New**

- Header nav → Sidebar nav
- `py-10` spacing → `py-6` spacing
- `text-xl` headings → `text-lg` headings
- Full-width pages → Max-width containers with consistent padding
- Large touch targets → Compact, keyboard-optimized (Linear-style)

**Sidebar Item Styling**:

- Default: `text-zinc-400` (dim)
- Hover: `text-zinc-100 bg-zinc-900/60` (highlighted)
- Active: `text-zinc-100 bg-zinc-900 font-medium` (bold, persistent highlight)
- Keyboard focus: `ring-2 ring-zinc-700`

### Implementation Plan

#### Phase 1: Layout Shell (Recommended Start)

**Scope**: Replace top header with sidebar, maintain all existing functionality
**Effort**: 1-2 days
**Risk**: Low

**New Components**:

1. `AppShell.tsx` - Main layout container (replaces ProtectedLayout)
2. `Sidebar.tsx` - Navigation sidebar with buckets list
3. `SidebarItem.tsx` - Reusable nav item with active states
4. `SidebarSection.tsx` - Collapsible section for buckets
5. `PanelContainer.tsx` - Wrapper for page content
6. `use-sidebar-state.ts` - Sidebar collapse state (localStorage persistence)
7. `use-keyboard-shortcuts.ts` - Global keyboard navigation

**Files to Modify**:

1. `packages/web/src/routes/protected.tsx` - Swap `ProtectedLayout` → `AppShell`
2. `packages/web/src/lib/navigation.ts` - Add icon/shortcut metadata

**Page Adjustments** (reduce spacing for density):

- `BatchNewPage.tsx` - Remove page title, reduce padding
- `BatchListPage.tsx` - Reduce heading size, spacing
- `BucketFeedPage.tsx` - Reduce spacing
- `SettingsPage.tsx` - Reduce heading size
- `ImportPage.tsx` - Reduce spacing
- `SearchPage.tsx` - Reduce spacing

**Responsive Behavior**:

- Desktop (>1024px): Sidebar expanded by default
- Tablet (768-1024px): Sidebar collapsed by default
- Mobile (<768px): Sidebar hidden, accessible via drawer overlay

#### Phase 2: Detail Panel (Optional Future Phase)

**Scope**: Add slide-in detail panel from right for batch details, settings
**Effort**: 2-3 days
**Risk**: Medium

**New Components**:

- `DetailPanel.tsx` - Slide-in panel from right
- `PanelContext.tsx` - Panel state management
- `BatchDetailPanel.tsx` - Compact batch detail for side panel
- `SettingsPanel.tsx` - Compact settings for side panel

**URL Strategy**: Use search params for deep linking

```
/batch/new                    // Primary: Capture
/batch/new?detail=abc123      // Primary: Capture + Detail: Batch abc123
/bucket/foundations?settings  // Primary: Feed + Detail: Settings
```

### Critical Files

**Phase 1 - Must Create**:

- `/packages/web/src/components/layouts/AppShell.tsx`
- `/packages/web/src/components/layouts/Sidebar.tsx`
- `/packages/web/src/components/layouts/SidebarItem.tsx`
- `/packages/web/src/components/layouts/SidebarSection.tsx`
- `/packages/web/src/components/layouts/PanelContainer.tsx`
- `/packages/web/src/hooks/use-sidebar-state.ts`
- `/packages/web/src/hooks/use-keyboard-shortcuts.ts`

**Phase 1 - Must Modify**:

- `/packages/web/src/routes/protected.tsx` (swap layout component)
- `/packages/web/src/lib/navigation.ts` (add metadata)

**Phase 1 - Polish (page spacing)**:

- `/packages/web/src/features/batch/pages/BatchNewPage.tsx`
- `/packages/web/src/features/batch/pages/BatchListPage.tsx`
- `/packages/web/src/features/bucket/pages/BucketFeedPage.tsx`
- `/packages/web/src/features/settings/pages/SettingsPage.tsx`
- `/packages/web/src/features/import/pages/ImportPage.tsx`
- `/packages/web/src/features/batch/pages/SearchPage.tsx`

### Testing Strategy

**Layout Tests**:

- Sidebar collapse/expand state management
- LocalStorage persistence across sessions
- Responsive breakpoint behavior
- Keyboard navigation (Tab, Arrow keys)

**Integration Tests**:

- Route navigation updates active sidebar item
- Keyboard shortcuts trigger correct navigation
- Direct URL access highlights correct sidebar item
- All existing page functionality remains intact

**Accessibility**:

- ARIA landmarks (`role="navigation"`, `role="main"`)
- Keyboard focus management
- Skip-to-content link
- Screen reader announcements

### Risk Mitigation

1. **No route path changes** - All URLs remain identical
2. **Incremental approach** - Phase 1 is low-risk layout swap
3. **Feature flag option** - Can gate behind `VITE_LINEAR_LAYOUT` env var
4. **Full regression testing** - Run existing test suite after swap
5. **Rollback plan** - Keep ProtectedLayout, single-line revert in protected.tsx

### Success Metrics

- All existing routes/functionality work unchanged
- Sidebar navigation feels responsive and intuitive
- Keyboard shortcuts improve workflow speed
- UI feels denser, more information visible
- Mobile/tablet responsive behavior works smoothly

---

## ASCII Mockups

### Mockup 1: Default View - Capture Page (Desktop, Sidebar Expanded)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
├─────────────────┬────────────────────────────────────────────────────────┤
│                 │                                                        │
│  append    [≡]  │  Capture New Batch                                     │
│                 │                                                        │
│  ┌───────────┐  │  ┌──────────────────────────────────────────────┐     │
│  │ ⊕ Capture │  │  │ Paste your entries here...                   │     │
│  │     C     │  │  │                                              │     │
│  └───────────┘  │  │ • Buy milk                                   │     │
│                 │  │ • Read Linear design patterns                │     │
│  ┌───────────┐  │  │ • Review PR #123                             │     │
│  │ 🔍 Search │  │  │                                              │     │
│  │     /     │  │  └──────────────────────────────────────────────┘     │
│  └───────────┘  │                                                        │
│                 │  [Create Batch]                                        │
│  ┌───────────┐  │                                                        │
│  │ 📥 Batches│  │                                                        │
│  └───────────┘  │  Recent Batches                                        │
│                 │  ┌────────────────────────────────────────────┐       │
│  ─────────────  │  │ Batch #42 • 3 items • 2 min ago           │       │
│                 │  ├────────────────────────────────────────────┤       │
│  Buckets        │  │ Batch #41 • 5 items • 1 hour ago          │       │
│                 │  └────────────────────────────────────────────┘       │
│  ⌄ Foundations  │                                                        │
│  • 📁 Ideas     │                                                        │
│  • 📁 Journal   │                                                        │
│                 │                                                        │
│  ─────────────  │                                                        │
│                 │                                                        │
│  📤 Import      │                                                        │
│  📥 Export      │                                                        │
│                 │                                                        │
│                 │                                                        │
│                 │                                                        │
│  ─────────────  │                                                        │
│  👤 user@ex.com │                                                        │
│  ⚙  Settings    │                                                        │
│  🚪 Sign Out    │                                                        │
└─────────────────┴────────────────────────────────────────────────────────┘
  [240px]         [flexible, centered max-width content]
```

### Mockup 2: Batch List View (Dense Layout)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
├─────────────────┬────────────────────────────────────────────────────────┤
│                 │                                                        │
│  append    [≡]  │  Batches                                               │
│                 │                                                        │
│  ┌───────────┐  │  ┌────────────────────────────────────────────────┐   │
│  │   Capture │  │  │ #42 • Morning Capture    3 items   2 min ago  │   │
│  └───────────┘  │  │ All accepted • Bucket: Ideas                  │   │
│                 │  ├────────────────────────────────────────────────┤   │
│  ┌───────────┐  │  │ #41 • Quick Notes        5 items   1 hour ago │   │
│  │   Search  │  │  │ 2 pending • Bucket: Journal                   │   │
│  └───────────┘  │  ├────────────────────────────────────────────────┤   │
│                 │  │ #40 • Reading List       8 items   3 hours ago│   │
│  ┌───────────┐  │  │ All accepted • Bucket: Ideas                  │   │
│  │ ▶ Batches │  │  ├────────────────────────────────────────────────┤   │
│  └───────────┘  │  │ #39 • Meeting Notes      2 items   Yesterday  │   │
│                 │  │ All accepted • Bucket: Work                   │   │
│  ─────────────  │  ├────────────────────────────────────────────────┤   │
│                 │  │ #38 • Ideas Dump        12 items   2 days ago │   │
│  Buckets        │  │ 1 pending • Bucket: Foundations               │   │
│                 │  └────────────────────────────────────────────────┘   │
│  ⌄ Foundations  │                                                        │
│  • Ideas        │  [Load more...]                                        │
│  • Journal      │                                                        │
│                 │                                                        │
│  ─────────────  │                                                        │
│                 │                                                        │
│  Import         │                                                        │
│  Export         │                                                        │
│                 │                                                        │
│                 │                                                        │
│  ─────────────  │                                                        │
│  user@ex.com    │                                                        │
│  Settings       │                                                        │
│  Sign Out       │                                                        │
└─────────────────┴────────────────────────────────────────────────────────┘
```

### Mockup 3: Bucket Feed View

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
├─────────────────┬────────────────────────────────────────────────────────┤
│                 │                                                        │
│  append    [≡]  │  Ideas                                   [Capture +]   │
│                 │  ─────────────────────────────────────────────────     │
│  ┌───────────┐  │                                                        │
│  │   Capture │  │  📝 Read Linear design patterns          2 min ago    │
│  └───────────┘  │     Batch #42 • Morning Capture                        │
│                 │                                                        │
│  ┌───────────┐  │  💡 Build side project with AI SDK        1 hour ago  │
│  │   Search  │  │     Batch #41 • Quick Notes                            │
│  └───────────┘  │                                                        │
│                 │  🎨 Redesign append UI/UX                 3 hours ago  │
│  ┌───────────┐  │     Batch #40 • Reading List                           │
│  │   Batches │  │                                                        │
│  └───────────┘  │  📚 Write ADR for layout redesign         3 hours ago  │
│                 │     Batch #40 • Reading List                           │
│  ─────────────  │                                                        │
│                 │  🧪 Experiment with TanStack Router       2 days ago   │
│  Buckets        │     Batch #38 • Ideas Dump                             │
│                 │                                                        │
│  ⌄ Foundations  │  📖 Document new feature                  2 days ago   │
│  ▶ Ideas        │     Batch #38 • Ideas Dump                             │
│  • Journal      │                                                        │
│                 │  [Load more...]                                        │
│  ─────────────  │                                                        │
│                 │                                                        │
│  Import         │                                                        │
│  Export         │                                                        │
│                 │                                                        │
│                 │                                                        │
│  ─────────────  │                                                        │
│  user@ex.com    │                                                        │
│  Settings       │                                                        │
│  Sign Out       │                                                        │
└─────────────────┴────────────────────────────────────────────────────────┘
```

### Mockup 4: Sidebar Collapsed (Desktop)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
├────┬─────────────────────────────────────────────────────────────────────┤
│    │                                                                     │
│ ap │  Capture New Batch                                                  │
│ [≡]│                                                                     │
│    │  ┌───────────────────────────────────────────────────────────┐     │
│ ⊕  │  │ Paste your entries here...                                │     │
│    │  │                                                           │     │
│ 🔍 │  │ • Buy milk                                                │     │
│    │  │ • Read Linear design patterns                            │     │
│ 📥 │  │ • Review PR #123                                          │     │
│    │  │                                                           │     │
│ ── │  └───────────────────────────────────────────────────────────┘     │
│    │                                                                     │
│ 📁 │  [Create Batch]                                                     │
│ 📁 │                                                                     │
│ 📁 │                                                                     │
│    │  Recent Batches                                                     │
│ ── │  ┌─────────────────────────────────────────────────┐               │
│    │  │ Batch #42 • 3 items • 2 min ago                │               │
│ 📤 │  ├─────────────────────────────────────────────────┤               │
│ 📥 │  │ Batch #41 • 5 items • 1 hour ago               │               │
│    │  └─────────────────────────────────────────────────┘               │
│    │                                                                     │
│ ── │                                                                     │
│ 👤 │                                                                     │
│ ⚙  │                                                                     │
│ 🚪 │                                                                     │
└────┴─────────────────────────────────────────────────────────────────────┘
[64px] [flexible, more content area]
```

### Mockup 5: Mobile View (Sidebar Hidden)

```
┌──────────────────────────────┐
│ [☰] append        [user ▾]  │
├──────────────────────────────┤
│                              │
│  Capture New Batch           │
│                              │
│  ┌────────────────────────┐  │
│  │ Paste entries here...  │  │
│  │                        │  │
│  │ • Buy milk             │  │
│  │ • Read Linear...       │  │
│  │ • Review PR #123       │  │
│  │                        │  │
│  └────────────────────────┘  │
│                              │
│  [Create Batch]              │
│                              │
│  Recent Batches              │
│  ┌────────────────────────┐  │
│  │ #42 • 3 items • 2m ago │  │
│  ├────────────────────────┤  │
│  │ #41 • 5 items • 1h ago │  │
│  └────────────────────────┘  │
│                              │
└──────────────────────────────┘

Sidebar accessible via [☰] hamburger:
┌──────────────────────────────┐
│ [×] Sidebar                  │
├──────────────────────────────┤
│                              │
│  append                      │
│                              │
│  ⊕  Capture              C   │
│  🔍 Search               /   │
│  📥 Batches                  │
│                              │
│  ─────────────────────       │
│                              │
│  Buckets                     │
│  ⌄ Foundations               │
│    • Ideas                   │
│    • Journal                 │
│                              │
│  ─────────────────────       │
│                              │
│  📤 Import                   │
│  📥 Export                   │
│                              │
│  ─────────────────────       │
│                              │
│  👤 user@example.com         │
│  ⚙  Settings                 │
│  🚪 Sign Out                 │
│                              │
└──────────────────────────────┘
```

### Mockup 6: Future - Split View with Detail Panel

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                                                                  │
├─────────────────┬────────────────────────────────────┬────────────────────────────┤
│                 │                                    │                            │
│  append    [≡]  │  Batches                           │  Batch #42 Detail    [×]   │
│                 │                                    │                            │
│  ┌───────────┐  │  ┌──────────────────────────────┐ │  Morning Capture           │
│  │   Capture │  │  │ ▶ #42 • 3 items • 2 min ago │ │  Created: 2 min ago        │
│  └───────────┘  │  │ Morning Capture • Ideas      │ │                            │
│                 │  ├──────────────────────────────┤ │  ┌──────────────────────┐  │
│  ┌───────────┐  │  │ #41 • 5 items • 1 hour ago  │ │  │ ✓ Buy milk           │  │
│  │   Search  │  │  │ Quick Notes • Journal       │ │  │   Bucket: Ideas      │  │
│  └───────────┘  │  ├──────────────────────────────┤ │  ├──────────────────────┤  │
│                 │  │ #40 • 8 items • 3 hours ago │ │  │ ✓ Read Linear...     │  │
│  ┌───────────┐  │  │ Reading List • Ideas        │ │  │   Bucket: Ideas      │  │
│  │ ▶ Batches │  │  ├──────────────────────────────┤ │  ├──────────────────────┤  │
│  └───────────┘  │  │ #39 • 2 items • Yesterday   │ │  │ ⏳ Review PR #123    │  │
│                 │  │ Meeting Notes • Work        │ │  │   Bucket: (pending)  │  │
│  ─────────────  │  └──────────────────────────────┘ │  │   [Accept] [Reject]  │  │
│                 │                                    │  └──────────────────────┘  │
│  Buckets        │  [Load more...]                   │                            │
│                 │                                    │  [Retry AI Suggestions]    │
│  ⌄ Foundations  │                                    │  [Accept All]              │
│  • Ideas        │                                    │                            │
│  • Journal      │                                    │                            │
│                 │                                    │                            │
│  ─────────────  │                                    │                            │
│                 │                                    │                            │
│  Import         │                                    │                            │
│  Export         │                                    │                            │
│                 │                                    │                            │
│                 │                                    │                            │
│  ─────────────  │                                    │                            │
│  user@ex.com    │                                    │                            │
│  Settings       │                                    │                            │
│  Sign Out       │                                    │                            │
└─────────────────┴────────────────────────────────────┴────────────────────────────┘
  [240px]          [flex-1, list view]                  [384px, detail panel]
```

### Mockup 7: Search View with Keyboard Focus

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
├─────────────────┬────────────────────────────────────────────────────────┤
│                 │                                                        │
│  append    [≡]  │  Search                                                │
│                 │                                                        │
│  ┌───────────┐  │  ┌──────────────────────────────────────────────┐     │
│  │   Capture │  │  │ 🔍 linear design patterns            [×]     │     │
│  └───────────┘  │  └──────────────────────────────────────────────┘     │
│                 │                                                        │
│  ┌───────────┐  │  Found 12 results                                     │
│  │ ▶ Search  │  │                                                        │
│  │     /     │  │  ┌────────────────────────────────────────────┐       │
│  └───────────┘  │  │ 💡 Read Linear design patterns             │       │
│                 │  │    Batch #42 • Ideas • 2 min ago           │       │
│  ┌───────────┐  │  ├────────────────────────────────────────────┤       │
│  │   Batches │  │  │ 🎨 Implement Linear-style sidebar          │       │
│  └───────────┘  │  │    Batch #38 • Ideas • 2 days ago          │       │
│                 │  ├────────────────────────────────────────────┤       │
│  ─────────────  │  │ 📚 Study Linear's keyboard shortcuts       │       │
│                 │  │    Batch #35 • Journal • 1 week ago        │       │
│  Buckets        │  └────────────────────────────────────────────┘       │
│                 │                                                        │
│  ⌄ Foundations  │  [Load more...]                                        │
│  • Ideas        │                                                        │
│  • Journal      │  Filters: [All Buckets ▾] [All Time ▾]                │
│                 │                                                        │
│  ─────────────  │                                                        │
│                 │                                                        │
│  Import         │                                                        │
│  Export         │                                                        │
│                 │                                                        │
│                 │                                                        │
│  ─────────────  │                                                        │
│  user@ex.com    │                                                        │
│  Settings       │                                                        │
│  Sign Out       │                                                        │
└─────────────────┴────────────────────────────────────────────────────────┘

Keyboard: "/" focuses search input, ESC clears, arrows navigate results
```

---

## Summary

This design transforms append into a **Linear-style single-page application** while maintaining all existing functionality:

✅ **Capture-first** workflow with BatchNewPage as default landing
✅ **Persistent sidebar** navigation replacing top header
✅ **Dense, keyboard-optimized** UI with shortcuts (C, /, G+B, etc.)
✅ **No URL changes** - all existing routes work identically
✅ **Incremental migration** - Phase 1 is low-risk layout swap
✅ **Responsive design** - Works on desktop, tablet, mobile
✅ **Future-ready** for split-view panels (Phase 2)

The mockups above show the redesigned interface in various states, demonstrating how the sidebar, navigation, and content areas work together to create a cohesive, productive user experience inspired by Linear's proven patterns.

## Implementation Checklist

### Phase 0: Component Installation

```bash
cd packages/web

# Install sidebar-07 block (core sidebar components)
npx shadcn@latest add sidebar-07

# Install login-03 block (polished login page)
npx shadcn@latest add login-03
```

**Post-install verification:**
- [ ] `components/ui/sidebar.tsx` exists
- [ ] `hooks/use-mobile.tsx` exists
- [ ] Sidebar CSS variables added to `main.css`
- [ ] `pnpm typecheck` passes

### Phase 1: Layout Shell Implementation

**Step 1.1: Create AppShell layout**
- [ ] Create `components/layouts/AppShell.tsx`
  - Wrap with `SidebarProvider`
  - Use `collapsible="icon"` mode
  - Include `SidebarInset` for main content
- [ ] Create `components/layouts/AppSidebar.tsx`
  - Header: Logo + collapse toggle
  - Nav: Capture, Search, Batches
  - Section: Buckets (collapsible, dynamic)
  - Nav: Import, Export
  - Footer: User menu, Settings, Sign out

**Step 1.2: Wire up routing**
- [ ] Update `routes/protected.tsx` to use `AppShell`
- [ ] Update `lib/navigation.ts` with icon/shortcut metadata
- [ ] Test all routes render correctly in new layout

**Step 1.3: Add keyboard shortcuts**
- [ ] Create `hooks/use-keyboard-shortcuts.ts`
- [ ] Implement: `C` → Capture, `/` → Search, `G B` → Batches
- [ ] Implement: `G I` → Import, `G S` → Settings
- [ ] Implement: `Cmd+\` → Toggle sidebar

**Step 1.4: Polish page density**
- [ ] `BatchNewPage.tsx` - Reduce spacing, remove redundant title
- [ ] `BatchListPage.tsx` - Reduce heading size
- [ ] `BucketFeedPage.tsx` - Reduce spacing
- [ ] `SettingsPage.tsx` - Reduce heading size
- [ ] `ImportPage.tsx` - Reduce spacing
- [ ] `SearchPage.tsx` - Reduce spacing

**Step 1.5: Update SignInPage**
- [ ] Adapt `login-03` pattern for Google SSO only
- [ ] Remove email/password form fields
- [ ] Keep card layout with "Sign in with Google" button
- [ ] Ensure redirect flow still works

### Phase 1 Verification

- [ ] All routes work (`/batch/new`, `/batch`, `/bucket/:slug`, etc.)
- [ ] Sidebar collapses/expands correctly
- [ ] Sidebar state persists in localStorage
- [ ] Mobile: Sidebar hidden, hamburger menu works
- [ ] Tablet: Sidebar collapsed by default
- [ ] Keyboard shortcuts functional
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` succeeds

### Phase 2: Detail Panel (Deferred)

_To be planned after Phase 1 is complete and validated._

---

## Files to Create/Modify Summary

### New Files (Phase 1)
```
packages/web/src/
├── components/layouts/
│   ├── AppShell.tsx          # Main layout with SidebarProvider
│   └── AppSidebar.tsx        # Sidebar navigation component
├── hooks/
│   └── use-keyboard-shortcuts.ts  # Global keyboard navigation
└── (sidebar.tsx, use-mobile.tsx installed by shadcn)
```

### Modified Files (Phase 1)
```
packages/web/src/
├── routes/protected.tsx      # Swap ProtectedLayout → AppShell
├── lib/navigation.ts         # Add icon/shortcut metadata
├── main.css                  # Sidebar CSS variables (auto-added)
├── features/auth/pages/SignInPage.tsx  # Adapt login-03 pattern
├── features/batch/pages/BatchNewPage.tsx
├── features/batch/pages/BatchListPage.tsx
├── features/batch/pages/SearchPage.tsx
├── features/bucket/pages/BucketFeedPage.tsx
├── features/settings/pages/SettingsPage.tsx
└── features/import/pages/ImportPage.tsx
```

### Preserved Files (No Changes)
- All API integration code
- All TanStack Query hooks
- All route paths/URLs
- Core business logic
