import React from 'react';

/**
 * Enterprise Stat Tiles Summary Strip
 * Small stat tiles (Total rows, Valid, Errors, Warnings) using Beautiful Blues and accessible status tokens.
 * Green/blue/red/amber typography on tinted backgrounds.
 */
export default function BulkStatTiles({
  total = 0,
  valid = 0,
  errors = 0,
  warnings = 0,
  totalLabel = 'Total rows',
  validLabel = 'Ready',
  errorsLabel = 'Errors',
  warningsLabel = 'Skipped',
  activeFilter = 'all',
  onFilterChange,
  className = '',
  style = {}
}) {
  const isTileActive = (id) => {
    if (activeFilter === id) return true;
    if (id === 'ready' && (activeFilter === 'valid' || activeFilter === 'ready')) return true;
    if (id === 'errors' && (activeFilter === 'errors' || activeFilter === 'invalid' || activeFilter === 'error')) return true;
    if (id === 'skipped' && (activeFilter === 'warnings' || activeFilter === 'skipped')) return true;
    return false;
  };

  const tiles = [
    {
      id: 'all',
      filterKey: 'all',
      label: totalLabel,
      count: total,
      bg: 'var(--color-blue-50, #EEF4F9)',
      border: isTileActive('all') ? '2px solid var(--color-blue-600, #02579A)' : '1px solid var(--color-blue-200, #B3CDE0)',
      textColor: 'var(--color-navy-900, #00204E)',
      labelColor: 'var(--color-text-secondary, #4A5F77)'
    },
    {
      id: 'ready',
      filterKey: 'ready',
      label: validLabel,
      count: valid,
      bg: 'var(--color-success-bg, #ECFDF3)',
      border: isTileActive('ready') ? '2px solid var(--color-success, #15803D)' : '1px solid var(--color-success-border, #A6F4C5)',
      textColor: 'var(--color-success, #15803D)',
      labelColor: 'var(--color-success, #15803D)'
    },
    {
      id: 'errors',
      filterKey: 'errors',
      label: errorsLabel,
      count: errors,
      bg: 'var(--color-danger-bg, #FEF3F2)',
      border: isTileActive('errors') ? '2px solid var(--color-danger, #B42318)' : '1px solid var(--color-danger-border, #FECDCA)',
      textColor: 'var(--color-danger, #B42318)',
      labelColor: 'var(--color-danger, #B42318)'
    },
    {
      id: 'skipped',
      filterKey: 'skipped',
      label: warningsLabel,
      count: warnings,
      bg: 'var(--color-warning-bg, #FFFBEB)',
      border: isTileActive('skipped') ? '2px solid var(--color-warning, #B45309)' : '1px solid var(--color-warning-border, #FDE68A)',
      textColor: 'var(--color-warning, #B45309)',
      labelColor: 'var(--color-warning, #B45309)'
    }
  ];

  return (
    <div
      className={`rx-bulk-stat-tiles ${className}`.trim()}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 16,
        width: '100%',
        boxSizing: 'border-box',
        ...style
      }}
    >
      {tiles.map((t) => (
        <div
          key={t.id}
          className={`rx-stat-tile rx-stat-${t.id} ${isTileActive(t.id) ? 'is-active' : ''}`}
          onClick={onFilterChange ? () => onFilterChange(t.filterKey) : undefined}
          style={{
            backgroundColor: t.bg,
            border: t.border,
            borderRadius: 'var(--radius-lg, 12px)',
            padding: '14px 18px',
            cursor: onFilterChange ? 'pointer' : 'default',
            boxSizing: 'border-box',
            transition: 'all var(--transition-fast, 150ms ease)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              fontSize: 'var(--font-size-12, 12px)',
              fontWeight: 500,
              color: t.labelColor,
              textTransform: 'none',
              marginBottom: 4,
              fontFamily: 'var(--font-sans)'
            }}
          >
            {t.label}
          </div>
          <div
            style={{
              fontSize: 'var(--font-size-24, 24px)',
              fontWeight: 700,
              color: t.textColor,
              lineHeight: 1.2,
              fontFamily: 'var(--font-sans)'
            }}
          >
            {t.count}
          </div>
        </div>
      ))}
    </div>
  );
}
