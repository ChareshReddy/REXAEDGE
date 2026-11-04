import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from '../context/RouterContext';

/**
 * Shared Fiori Page Header Component
 * Layout (top to bottom):
 * 1. Full-width white breadcrumb bar (48px high, edge-to-edge #FFFFFF, no border, no shadow)
 * 2. Cream title section (#FFF8F2) with:
 *    - Optional orange back button (40x40px #EB6301) before heading when parent page exists
 *    - Title (28px bold navy #0f2744, 12px gap from back button)
 *    - Subtitle (15px slate-600 #475569, aligned under heading text with 52px left margin when back button present)
 *    - Children (tabs, filters, etc. at bottom edge)
 */
export default function FioriPageHeader({
  title,
  subtitle,
  onBack,
  backTitle,
  isLocked = false,
  breadcrumbs,
  systemKey,
  extraTitleContent,
  children,
  className = '',
  style = {}
}) {
  const isProductsPage = title === 'Products';

  const renderBreadcrumbItem = (b) => {
    if (b.path || b.to) {
      return (
        <Link to={b.path || b.to} className="fiori-bc-link">
          {b.label}
        </Link>
      );
    }
    if (b.onClick) {
      return (
        <button
          type="button"
          className="fiori-bc-link"
          onClick={b.onClick}
        >
          {b.label}
        </button>
      );
    }
    return <span className="fiori-bc-current">{b.label}</span>;
  };

  const hasBreadcrumbs = Array.isArray(breadcrumbs) && breadcrumbs.length > 0;
  const hasParent =
    Array.isArray(breadcrumbs) &&
    breadcrumbs.length >= 2 &&
    title !== 'Home' &&
    title !== 'Sign In';
  const parentItem = hasParent ? breadcrumbs[breadcrumbs.length - 2] : null;

  const renderBackButton = () => {
    if (!hasParent || !parentItem) return null;
    const parentLabel = parentItem.label || backTitle?.replace(/^Back to\s+/i, '') || 'previous page';
    const tooltipText = `Back to ${parentLabel}`;

    if (parentItem.path || parentItem.to) {
      return (
        <Link
          to={parentItem.path || parentItem.to}
          className="fiori-ph-orange-back"
          title={tooltipText}
          aria-label={tooltipText}
        >
          <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.2} />
        </Link>
      );
    }

    const handleClick = parentItem.onClick || onBack;
    return (
      <button
        type="button"
        onClick={handleClick}
        className="fiori-ph-orange-back"
        title={tooltipText}
        aria-label={tooltipText}
        disabled={isLocked}
      >
        <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.2} />
      </button>
    );
  };

  return (
    <div className={`fiori-ph-container ${className}`} style={style}>
      {/* 1. Full-width White Breadcrumb Bar */}
      {hasBreadcrumbs && (
        <div className="fiori-bc-bar">
          <div className="fiori-bc-bar-inner">
            <nav className="fiori-bc" aria-label="Breadcrumb">
              {breadcrumbs.length <= 2 ? (
                breadcrumbs.map((b, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <span className="fiori-bc-sep">›</span>}
                    {renderBreadcrumbItem(b)}
                  </React.Fragment>
                ))
              ) : (
                <>
                  <span className="fiori-bc-desktop">
                    {breadcrumbs.map((b, idx) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="fiori-bc-sep">›</span>}
                        {renderBreadcrumbItem(b)}
                      </React.Fragment>
                    ))}
                  </span>
                  <span className="fiori-bc-mobile">
                    {renderBreadcrumbItem(breadcrumbs[0])}
                    <span className="fiori-bc-sep">›</span>
                    <span
                      className="fiori-bc-collapsed"
                      title={breadcrumbs.slice(1, -1).map((b) => b.label).join(' › ')}
                    >
                      …
                    </span>
                    <span className="fiori-bc-sep">›</span>
                    {renderBreadcrumbItem(breadcrumbs[breadcrumbs.length - 1])}
                  </span>
                </>
              )}
            </nav>
          </div>
        </div>
      )}

      {/* 2. Page Title Section (Cream Background) */}
      <div className="fiori-ph">
        <div className="sap-layout-header-inner">
          <div className="fiori-ph-title-row">
            <div className="fiori-ph-title-group">
              {renderBackButton()}
              <h1 className={`fiori-ph-title ${isProductsPage ? 'fiori-ph-title-products' : ''}`}>
                {title}
              </h1>
            </div>
            {extraTitleContent}
          </div>

          {subtitle && (
            <p
              className="fiori-ph-subtitle sap-layout-subtitle"
              style={hasParent ? { marginLeft: '52px' } : undefined}
            >
              {subtitle}
            </p>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}
