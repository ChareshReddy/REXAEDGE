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

  return (
    <div
      className={cn(
        'rx-card bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] relative text-left',
        isTinted ? 'rx-card-tinted-header !p-0 overflow-hidden' : 'p-5 xl:p-6',
        className
      )}
      style={accentTop ? { borderTop: accentTop } : undefined}
    >
      {hasHeader && (
        <div
          data-full-bleed-band={isTinted ? 'true' : undefined}
          className={cn(
            'rx-form-section-header flex flex-col sm:flex-row sm:items-center justify-between gap-2',
            isTinted
              ? 'rx-form-section-header-tinted !m-0 px-6 py-4 bg-[var(--color-blue-100)] border-b border-[var(--color-blue-200)] w-full'
              : 'pb-3 mb-4 border-b border-[var(--color-border)]'
          )}
          style={isTinted && accentTop ? { margin: '0 -1px 0 -1px', width: 'calc(100% + 2px)' } : undefined}
        >
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              {title && (
                <h3
                  className={cn(
                    'rx-form-section-title leading-tight text-[var(--color-navy-900)]',
                    isTinted ? 'text-[18px] font-semibold' : 'text-base font-semibold'
                  )}
                >
                  {title}
                </h3>
              )}
              {badge && <div className="inline-flex items-center">{badge}</div>}
            </div>
            {description && (
              <p className="rx-form-section-desc text-xs text-[var(--color-text-secondary)] mt-1 leading-normal">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 self-start sm:self-center">{actions}</div>}
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
