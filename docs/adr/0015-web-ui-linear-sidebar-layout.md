# ADR 0015 — Web UI: Linear-style sidebar layout

Status: Accepted
Date: 2026-01-01
Supersedes: ADR 0005

## Context

The original web app used a top header navigation pattern (ProtectedLayout) that required full-page navigation for each feature. This created context switching friction and limited the ability to view multiple sections simultaneously.

As the app matured with features like batch capture, bucket feeds, import/export, and settings, the need for faster navigation and persistent context became apparent.

## Decision

Replace the top header navigation with a Linear-inspired persistent sidebar layout:

1. **Persistent left sidebar** - Always visible (240px expanded, 64px collapsed)
2. **AppShell component** - New layout wrapper replacing ProtectedLayout
3. **AppSidebar component** - Navigation sidebar based on shadcn/ui sidebar-07 block
4. **Keyboard shortcuts** - C (Capture), / (Search), G+B (Batches), G+I (Import), G+S (Settings)
5. **Dense UI** - Reduced spacing, smaller text sizes, more content per screen
6. **Mobile responsive** - Collapsible sidebar (drawer on mobile)

Architecture:
- shadcn/ui sidebar-07 block (collapsible icon mode)
- SidebarProvider for state management
- Dynamic buckets section with collapsible group
- Command palette (Cmd+K) preserved
- All existing routes unchanged

## Consequences

**Positive:**
- Faster navigation via persistent sidebar + keyboard shortcuts
- Reduced context switching - no full-page reloads
- Better spatial memory - consistent navigation position
- Future-ready for split-panel views (Phase 2)
- Denser UI shows more information per screen

**Neutral:**
- Learning curve for keyboard shortcuts (progressive disclosure via tooltips)
- Sidebar takes ~240px horizontal space (acceptable on modern screens)

**Mitigated Risks:**
- Mobile: Sidebar hidden by default, accessible via hamburger menu
- All URLs remain identical (deep linking preserved)
- Auth gating logic unchanged (still enforced via protected route)

## Implementation Details

**Components Created:**
- `AppShell.tsx` - Main layout with SidebarProvider
- `AppSidebar.tsx` - Customized sidebar-07 with app-specific nav

**Components Removed:**
- `ProtectedLayout.tsx`
- `NavLink.tsx`
- `navigation.ts`
- `nav-main.tsx`, `nav-projects.tsx`, `nav-user.tsx`
- `team-switcher.tsx`
- `login-form.tsx`

**Modified:**
- `protected.tsx` - Routes use AppShell instead of ProtectedLayout
- `SignInPage.tsx` - Adapted login-03 card design for Google SSO

**Keyboard Shortcuts:**
| Key | Action |
|-----|--------|
| C | Navigate to Capture |
| / | Navigate to Search |
| G B | Go to Batches |
| G I | Go to Import |
| G S | Go to Settings |
| Cmd+K | Command palette |

## Alternatives Considered

1. **Keep header navigation** - Rejected: doesn't solve context switching
2. **Tab-based interface** - Rejected: limited to browser tab metaphor, not keyboard-first
3. **Accordion sidebar** - Rejected: sidebar-07's icon collapse is cleaner

## Related

- Design proposal: `docs/archive/ui-redesign-proposal.md` (archived)
- Supersedes: ADR 0005 (protected layout route concept remains, implementation changed)
