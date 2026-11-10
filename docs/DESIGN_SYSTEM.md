# RexaEdge Enterprise Design System ("Beautiful Blues")

## Overview
The RexaEdge Design System provides a modern, high-contrast, professional enterprise appearance aligning with the RexaEdge brand identity (navy `#00204E` and subtle crimson status accents). Designed specifically for SAP data-dense workflows, it optimizes readability, consistent spatial hierarchy, accessibility (WCAG AA), and 125% Windows display scaling.

---

## 1. Color Palette

### Primary "Beautiful Blues"
| Token Name | Hex Code | Description / Usage |
| :--- | :--- | :--- |
| `--color-navy-900` | `#00204E` | Headings, dark brand surfaces, primary text emphasis |
| `--color-navy-800` | `#05396B` | Dark hover & active pressed states |
| `--color-blue-600` | `#02579A` | Primary action buttons, active navigation, key links |
| `--color-blue-400` | `#6699B8` | Secondary icons, subtle navigational accents |
| `--color-blue-200` | `#B3CDE0` | Focus rings, selected card outlines |
| `--color-blue-100` | `#DCE8F1` | Selected table row highlights, soft pill backgrounds |
| `--color-blue-50` | `#EEF4F9` | Table header backgrounds, hover rows, card strip panels |

### Neutral Surfaces & Borders
| Token Name | Hex Code | Description / Usage |
| :--- | :--- | :--- |
| `--color-page-bg` | `#F5F8FB` | Main application canvas |
| `--color-surface` | `#FFFFFF` | Cards, popups, and elevated content panels |
| `--color-border` | `#D9E2EC` | Structural dividers, card borders, table borders |
| `--color-text` | `#0F2742` | Primary readable text |
| `--color-text-secondary` | `#4A5F77` | Field labels, metadata, captions |
| `--color-text-muted` | `#7A8CA3` | Placeholders, disabled states |

### Status Tokens (Strictly Semantic)
Danger red is reserved purely for critical errors and destructive actions—never used as decorative color.
- **Success:** `#15803D` on `#ECFDF3` (Border: `#A6F4C5`)
- **Warning:** `#B45309` on `#FFFBEB` (Border: `#FDE68A`)
- **Info:** `#02579A` on `#EEF4F9` (Border: `#B3CDE0`)
- **Danger:** `#B42318` on `#FEF3F2` (Border: `#FECDCA`)

---

## 2. Typography
- **UI & Controls:** Inter (`400`, `500`, `600`, `700`)
- **SAP Codes & Numerical Data:** JetBrains Mono (`400`, `500`)
- **Scale:** `12px`, `13px`, `14px`, `16px`, `18px`, `20px`, `24px`, `30px`, `36px`
- **Line Heights:** `1.25` (headings), `1.4` (standard UI), `1.5` (prose/help text)

---

## 3. Spatial System & Component Sizes (Desktop Targets)
- **Top Bar:** `64px` height
- **Form Inputs / Selects:** `40px` height (`14px` text)
- **Table Cell Inputs:** `32px` height (`13px` text)
- **Table Rows:** `44px` height (`40px` header row)
- **Buttons:** `40px` standard (`32px` small)
- **F4 Value-Help Trigger:** `28px` in form fields, `24px` inside table cells
- **Sidebar:** `240px` expanded, `72px` collapsed
- **Touch / Coarse Fallback:** Minimum `44px` target size
- **Radii:** `6px` (table controls), `8px` (inputs/buttons), `12px` (cards), `16px` (modals)
- **Shadows:** Soft navy-tinted (`--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-modal`)

---

## 4. Accessibility & Interaction
- **Contrast:** Strict WCAG 2.1 AA compliance (text ≥ 4.5:1, interactive UI ≥ 3:1).
- **Focus:** `2px` solid `#02579A` with `2px` offset (`--focus-ring`).
- **Motion:** `150ms` - `250ms` ease transitions with automatic disabling under `@media (prefers-reduced-motion: reduce)`.
