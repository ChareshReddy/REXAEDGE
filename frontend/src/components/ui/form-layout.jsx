import React from 'react';
import { cn } from '@/lib/utils';
import './ui.css';

/**
 * Enterprise FormSection component (stack of section cards)
 * Header row: title (16px semibold), description 4px below it (13px muted),
 * 12px padding below description before divider, then divider,
 * then 16px gap before first field in body.
 * Body: 16px row and column gap.
 * Card padding: 20px (24px at >= 1280px).
 * Section badges vertically centered with title, 8px gap.
 */
export function FormSection({
  title,
  description,
  badge = null,
  actions = null,
  children,
  className = '',
  bodyClassName = '',
  accentTop = null,
  tintedHeader = true
}) {
  const hasHeader = Boolean(title || description || badge || actions);
  const isTinted = Boolean(tintedHeader && hasHeader);

  // If description carries data (counts, numbers, showing/found), display inline on same row in 13px muted.
  // Purely descriptive subtitles (e.g. "Material and plant specification...") are omitted on card headers.
  const hasDataDesc = Boolean(
    description && (
      /\d/.test(description) ||
      /BOM\(s\)|component\(s\)|item\(s\)|row\(s\)|showing|found/i.test(description)
    )
  );

  return (
    <div
      className={cn(
        'rx-card bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-none relative text-left',
        isTinted ? 'rx-card-tinted-header !p-0 overflow-hidden' : 'p-4',
        className
      )}
      style={accentTop ? { borderTop: accentTop } : undefined}
    >
      {hasHeader && (
        <div
          data-full-bleed-band={isTinted ? 'true' : undefined}
          data-testid="rx-card-header"
          className={cn(
            'rx-form-section-header flex flex-row items-center justify-between gap-2',
            isTinted
              ? 'rx-form-section-header-tinted !m-0 px-4 h-12 min-h-[48px] max-h-[48px] bg-[var(--card-header-bg)] border-b border-[var(--card-header-border)] w-full'
              : 'pb-3 mb-4 border-b border-[var(--color-border)]'
          )}
          style={isTinted && accentTop ? { margin: '0 -1px 0 -1px', width: 'calc(100% + 2px)' } : undefined}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {title && (
              <h3
                className={cn(
                  'rx-form-section-title text-[16px] font-semibold text-[var(--card-header-text,#0B2D57)] leading-none shrink-0',
                  !isTinted && 'text-base'
                )}
              >
                {title}
              </h3>
            )}
            {hasDataDesc && (
              <span className="rx-card-header-data text-[13px] text-[var(--card-header-text,#0B2D57)] font-normal truncate">
                {description}
              </span>
            )}
            {badge && <div className="inline-flex items-center shrink-0">{badge}</div>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div
        className={cn(
          'rx-form-section-body',
          isTinted ? 'rx-form-section-body-tinted' : 'flex flex-col gap-4',
          bodyClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Responsive FormGrid component
 * 3 columns at 1280px and up, 2 columns from 900px, 1 column below.
 * 16px column gap, 16px row gap.
 */
export function FormGrid({ children, className = '' }) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 min-[900px]:grid-cols-2 xl:grid-cols-3 gap-4',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * FormActions component
 * Sits at bottom of card.
 * Secondary/reset on left, primary on right.
 */
export function FormActions({
  children,
  left = null,
  right = null,
  className = ''
}) {
  return (
    <div
      className={cn(
        'sap-card-action-row rx-form-actions mt-6 pt-4 border-t border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3',
        className
      )}
    >
      <div className="flex items-center gap-3">
        {left}
      </div>
      <div className="flex items-center gap-3 ml-auto">
        {right || children}
      </div>
    </div>
  );
}

/**
 * FormPage container (max 1440px, 24px gutter, 20px gap between cards)
 */
export function FormPage({ children, className = '' }) {
  return (
    <div
      className={cn(
        'w-full max-w-[1440px] px-6 py-6 flex flex-col gap-5 text-left',
        className
      )}
    >
      {children}
    </div>
  );
}
