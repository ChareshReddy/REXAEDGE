import React from 'react';

/**
 * Enterprise Stat Tiles Summary Strip & Interactive Filter
 * Small stat tiles (Total BOMs, Ready, Errors, Skipped) using Beautiful Blues and accessible status tokens.
 * Functions as the single filter control for the Data Preview table in bulk create and copy flows.
 */
export default function BulkStatTiles({
  total = 0,
  valid = 0,
  errors = 0,
  warnings = 0,
  totalLabel = 'Total BOMs',
  validLabel = 'Ready',
  errorsLabel = 'Errors',
  warningsLabel = 'Skipped',
  activeFilter = 'all',
  onFilterChange,
  className = '',
  style = {}
}) {
  const normActive = String(activeFilter || 'all').toLowerCase();

  const isTileActive = (id) => {
    if (id === 'all') {
      return false;
    }
    if (id === 'ready') {
      return normActive === 'ready' || normActive === 'valid';
    }
    if (id === 'errors') {
      return normActive === 'errors' || normActive === 'error' || normActive === 'invalid';
    }
    if (id === 'skipped') {
      return normActive === 'skipped' || normActive === 'warnings';
    }
    return false;
  };

  const tiles = [
    {
      id: 'all',
      filterKey: 'all',
      label: totalLabel,
      count: total,
      bg: 'var(--color-blue-50, #EEF4F9)',
      activeBorder: '2px solid var(--color-blue-600, #02579A)',
      inactiveBorder: '1px solid var(--color-blue-200, #B3CDE0)',
      activeShadow: '0 2px 6px rgba(2, 87, 154, 0.18)',
      textColor: 'var(--color-blue-600, #02579A)',
      labelColor: 'var(--color-text-secondary, #4A5F77)'
    },
    {
      id: 'ready',
      filterKey: 'ready',
      label: validLabel,
      count: valid,
      bg: 'var(--color-success-bg, #ECFDF3)',
      activeBorder: '2px solid var(--color-success, #15803D)',
      inactiveBorder: '1px solid var(--color-success-border, #A6F4C5)',
      activeShadow: '0 2px 6px rgba(21, 128, 61, 0.18)',
      textColor: 'var(--color-success, #15803D)',
      labelColor: 'var(--color-success, #15803D)'
    },
    {
      id: 'errors',
      filterKey: 'errors',
      label: errorsLabel,
      count: errors,
      bg: 'var(--color-danger-bg, #FEF3F2)',
      activeBorder: '2px solid var(--color-danger, #B42318)',
      inactiveBorder: '1px solid var(--color-danger-border, #FECDCA)',
      activeShadow: '0 2px 6px rgba(180, 35, 24, 0.18)',
      textColor: 'var(--color-danger, #B42318)',
      labelColor: 'var(--color-danger, #B42318)'
    },
    {
      id: 'skipped',
      filterKey: 'skipped',
      label: warningsLabel,
      count: warnings,
      bg: 'var(--color-surface-subtle, #F8FAFC)',
      activeBorder: '2px solid var(--color-text-secondary, #4A5F77)',
      inactiveBorder: '1px solid var(--color-border, #D9E2EC)',
      activeShadow: '0 2px 6px rgba(74, 95, 119, 0.18)',
      textColor: 'var(--color-text-secondary, #4A5F77)',
      labelColor: 'var(--color-text-secondary, #4A5F77)'
    }
  ];

  const handleTileClick = (t) => {
    if (!onFilterChange) return;
    if (t.count === 0) return; // Non-clickable when 0 count

    if (t.id === 'all') {
      onFilterChange('all');
      return;
    }

    // Click active card again to clear filter (show all)
    if (isTileActive(t.id)) {
      onFilterChange('all');
    } else {
      onFilterChange(t.filterKey);
    }
  };

  return (
    <div
      className={`rx-bulk-stat-tiles ${className}`.trim()}
      role="group"
      aria-label="Filter BOMs by status"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 16,
        width: '100%',
        boxSizing: 'border-box',
        ...style
      }}
    >
      {tiles.map((t) => {
        const active = isTileActive(t.id);
        const isClickable = Boolean(onFilterChange && t.count > 0);

        return (
          <button
            key={t.id}
            type="button"
            disabled={!isClickable}
            aria-pressed={active}
            aria-label={`${t.label}: ${t.count}`}
            onClick={() => handleTileClick(t)}
            className={`rx-stat-tile rx-stat-${t.id} ${active ? 'is-active' : ''}`}
            style={{
              backgroundColor: t.bg,
              border: active ? t.activeBorder : t.inactiveBorder,
              borderRadius: 'var(--radius-lg, 12px)',
              padding: '14px 18px',
              cursor: isClickable ? 'pointer' : 'not-allowed',
              opacity: t.count === 0 ? 0.55 : 1,
              boxShadow: active ? t.activeShadow : 'none',
              boxSizing: 'border-box',
              transition: 'all var(--transition-fast, 150ms ease)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              textAlign: 'left',
              font: 'inherit',
              userSelect: 'none',
              outline: 'none'
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
          </button>
        );
      })}
    </div>
  );
}
