# RexaEdge Project Rules

## Core Frontend Architecture & UI Guidelines

1. **shadcn/ui Base**:
   - Use components from `frontend/src/components/ui/` as the foundational component library.
   - Follow official shadcn/ui composition and patterns.

2. **Design Tokens Only**:
   - All colors, font families, font sizes, spacing, shadows, and radii must come strictly from design tokens defined in `frontend/src/tokens.css` (or CSS variables mapped to them).
   - No hardcoded hex values (`#...`), rgb/rgba values, or arbitrary pixel values in components or CSS overrides.

3. **Scoped CSS Only & No Bare Element Selectors**:
   - All custom CSS must be strictly scoped (e.g., component classes with prefixes like `.rx-`, `.sap-`, `.fl-`, or CSS modules).
   - Never use bare element selectors (e.g., `input`, `button`, `label`, `table`, `select`, `::placeholder`) at the root or global level.

4. **Modal & Popup Behavior**:
   - Popups and modals must NEVER close on outside/backdrop click.
   - Popups close only via explicit user action (Close/Cancel button, Esc key, or completed form action).

5. **Follow Installed Agent Skills**:
   - Adhere to the guidance in `.agents/skills/`:
     - `shadcn`: CLI usage, component installation, and Radix/Tailwind patterns.
     - `frontend-design`: Purposeful enterprise typography, intentional palette, no generic AI-look tells.
     - `web-design-guidelines`: Web interface quality, accessibility, touch targets, and contrast.
     - `vercel-react-best-practices`: Performance optimization, re-render avoidance, and bundle size discipline.
