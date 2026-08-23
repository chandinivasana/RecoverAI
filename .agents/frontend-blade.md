# Frontend conventions — Razorpay Blade

The RecoverAI frontend is built on **`@razorpay/blade`** (Razorpay's production design
system) so it matches the real Razorpay dashboard and can be integrated into it with
minimal friction. This is the org-standard path: production Blade UIs are built with
the Blade MCP (`@razorpay/blade-mcp`); its knowledge base documents every component.

## Non-negotiables

1. **Read the Blade doc before using a component.** The Blade MCP knowledge base is
   the source of truth for props and patterns (component docs, the Dashboard pattern,
   `general/AvailableIcons.md`, `general/ChartColorSystem.md`). Never guess a prop or
   an icon name — verify it. Locally the KB can be fetched via
   `npm pack @razorpay/blade-mcp && tar -xzf razorpay-blade-mcp-*.tgz` → `package/knowledgebase/`.
2. **Imports**: components from `@razorpay/blade/components`, theme tokens from
   `@razorpay/blade/tokens`. Icons are components too (verify against AvailableIcons).
3. **Layout with `Box`** and token-valued props (`padding="spacing.5"`,
   `gap="spacing.3"`, `backgroundColor="surface.background.gray.subtle"`). **No
   Tailwind classes and no `var(--*)` CSS variables in Blade components.** Never
   hardcode hex/hsla colors — tokens only.
4. **Money is rendered with `<Amount />`** (INR, Indian digit grouping built in).
5. **Feedback**: `useToast` + the root `ToastContainer` (already mounted in
   `src/lib/AppProviders.tsx` — never add another). No `alert()` anywhere.
6. **Status color language** (consistent across the app):
   - `recovered` → `positive` · `failed` → `negative` · `escalated_to_human` → `notice`
   - `processing_recovery` → `information` · `stopped`/`permanently_failed` → neutral gray
7. **Dark mode** comes from Blade's `colorScheme` on `BladeProvider`
   (toggled via `useColorScheme()` from `src/lib/AppProviders.tsx`) — components never
   implement their own dark variants.
8. **Client components**: keep `'use client'` at the top (the app is API-driven).
9. **Honesty in UI**: never render a hardcoded verdict, rate, or seal. Verdicts,
   metrics, and chain status always come from API responses; synthetic data is
   labeled synthetic; thin cohorts show their real COLLECTING state.
10. Charts follow `general/ChartColorSystem.md`; use Blade chart components where
    they exist, otherwise style the charting lib from `useTheme()` tokens.

## App structure

- `src/lib/AppProviders.tsx` — BladeProvider + fonts + color scheme + ToastContainer.
- `src/lib/StyledComponentsRegistry.tsx` — styled-components v5 SSR registry (App Router).
- `src/components/AppShell.tsx` — Blade `TopNav` + `SideNav` per the canonical
  Dashboard pattern (this is the Razorpay-dashboard look).
- `frontend/.npmrc` sets `legacy-peer-deps=true` — Blade declares react-native peers
  that web consumers don't install. Keep it.
- styled-components is pinned to v5 (Blade's peer range). React 19/Next 16 verified.
