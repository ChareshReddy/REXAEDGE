import { MODULE_REGISTRY } from './modules.js';

/**
 * ============================================================================
 * SHARED BREADCRUMB BUILDER
 * ============================================================================
 * Generates the standard hierarchical navigation breadcrumb trail for any
 * view or module across RexaEdge ERP:
 *
 * - Home page:                          (empty / no breadcrumb)
 * - Products catalog:                   Home > Products
 * - Module Operations Hub:              Home > Products > <Module Label>
 * - Group Sub-Page (Level 3):           Home > Products > <Module Label> > <Group Title>
 * - Direct Feature Page:                Home > Products > <Module Label> > <Feature Title>
 * - Grouped Feature Page (Single/Bulk): Home > Products > <Module Label> > <Group Title> > <Feature Title>
 * - Enterprise Administration:          Home > Enterprise Administration
 *
 * Future modules (e.g. Routing, Production Orders) automatically inherit this
 * structure via MODULE_REGISTRY without requiring hard-coded breadcrumbs.
 * ============================================================================
 */

/**
 * Returns an array of breadcrumb objects { label, onClick? } suitable for FioriPageHeader.
 *
 * @param {string} viewKey - activeTab or subView identifier (e.g. 'products', 'bom_operations', 'create_bom')
 * @param {Object} [callbacks] - Navigation handlers
 * @param {Function} [callbacks.onNavigateHome] - Navigates to Home page (/home)
 * @param {Function} [callbacks.onNavigateProducts] - Navigates to Products page (/products)
 * @param {Function} [callbacks.onNavigateModule] - Navigates to Module Hub (e.g. /products/bom)
 * @param {Function} [callbacks.onNavigateBom] - Alias for onNavigateModule for BOM
 * @param {Function} [callbacks.onNavigateGroup] - Navigates to group sub-page
 * @param {Function} [callbacks.onBack] - Fallback back navigation
 * @param {Object} [options]
 * @param {boolean} [options.isLocked=false] - Whether clicking should be disabled (e.g. during execution)
 * @returns {Array<{ label: string, onClick?: Function }>}
 */
export function getBreadcrumbTrail(viewKey, callbacks = {}, options = {}) {
  const isLocked = Boolean(options?.isLocked);
  const onHome = isLocked ? undefined : callbacks.onNavigateHome;
  const onProducts = isLocked ? undefined : (callbacks.onNavigateProducts || callbacks.onNavigateHome);
  const onBom = isLocked ? undefined : (callbacks.onNavigateBom || callbacks.onNavigateModule || callbacks.onNavigateProducts);

  // 1. Home page: No breadcrumb
  if (!viewKey || viewKey === 'home') {
    return [];
  }

  // 2. Products page (module catalog)
  if (viewKey === 'products' || viewKey === 'launchpad' || viewKey === 'launchpad_home') {
    return [
      { label: 'Home', onClick: onHome },
      { label: 'Products' }
    ];
  }

  // 3. Enterprise Administration (not under Products)
  if (viewKey === 'admin') {
    return [
      { label: 'Home', onClick: onHome },
      { label: 'Enterprise Administration' }
    ];
  }

  // 4. Module Hub (e.g. 'bom_operations' or future 'routing_operations')
  const matchedModuleBySubView = MODULE_REGISTRY.find(
    (m) => m.subView === viewKey || m.key === viewKey
  );
  if (matchedModuleBySubView) {
    return [
      { label: 'Home', onClick: onHome },
      { label: 'Products', onClick: onProducts },
      { label: matchedModuleBySubView.label }
    ];
  }

  // 5. Group Sub-Page (e.g. 'bom_create_operations', 'bom_copy_operations')
  for (const mod of MODULE_REGISTRY) {
    const groupSubApp = (mod.subApps || []).find((sa) => sa.isGroup && sa.subView === viewKey);
    if (groupSubApp) {
      const onMod = isLocked ? undefined : (callbacks.onNavigateBom || callbacks.onNavigateModule || callbacks.onBack || onProducts);
      return [
        { label: 'Home', onClick: onHome },
        { label: 'Products', onClick: onProducts },
        { label: mod.label, onClick: onMod },
        { label: groupSubApp.title }
      ];
    }
  }

  // 6. Feature Actions (e.g. 'create_bom', 'bulk_create_bom', 'copy_bom', 'bulk_bom', 'bom_explorer', 'validate_bom', 'delete_bom')
  for (const mod of MODULE_REGISTRY) {
    for (const sa of mod.subApps || []) {
      // Check if action matches a child of a group
      if (sa.isGroup && Array.isArray(sa.children)) {
        const childMatch = sa.children.find((c) => c.action === viewKey || c.id === viewKey);
        if (childMatch) {
          const onMod = isLocked ? undefined : (callbacks.onNavigateBom || callbacks.onNavigateModule || onProducts);
          const onGrp = isLocked ? undefined : (callbacks.onNavigateGroup || callbacks.onBack || onMod);
          return [
            { label: 'Home', onClick: onHome },
            { label: 'Products', onClick: onProducts },
            { label: mod.label, onClick: onMod },
            { label: sa.title, onClick: onGrp },
            { label: childMatch.title }
          ];
        }
      }

      // Check if action matches a direct sub-app (Display, Validate, Delete)
      if (sa.action === viewKey || sa.id === viewKey) {
        const onMod = isLocked ? undefined : (callbacks.onNavigateBom || callbacks.onNavigateModule || callbacks.onBack || onProducts);
        return [
          { label: 'Home', onClick: onHome },
          { label: 'Products', onClick: onProducts },
          { label: mod.label, onClick: onMod },
          { label: sa.title }
        ];
      }
    }
  }

  // Fallback for custom or unrecognized views: Home > Products > [viewKey]
  return [
    { label: 'Home', onClick: onHome },
    { label: 'Products', onClick: onProducts },
    { label: String(viewKey) }
  ];
}

/**
 * Returns breadcrumb items as pure descriptors { label, target, isCurrent }
 * for test assertions and validation without needing live function callbacks.
 */
export function getBreadcrumbDescriptors(viewKey) {
  const trail = getBreadcrumbTrail(viewKey, {
    onNavigateHome: () => 'home',
    onNavigateProducts: () => 'products',
    onNavigateBom: () => 'bom_operations',
    onNavigateModule: () => 'module',
    onNavigateGroup: () => 'group',
    onBack: () => 'back'
  });

  return trail.map((item, idx) => ({
    label: item.label,
    isCurrent: idx === trail.length - 1,
    hasLink: Boolean(item.onClick)
  }));
}
