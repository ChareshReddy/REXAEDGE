/**
 * ============================================================================
 * REXAEDGE FRONTEND ROUTING CONFIGURATION — SINGLE SOURCE OF TRUTH
 * ============================================================================
 * All routes, breadcrumbs, hierarchy, titles, access guards, and redirects
 * are defined in this registry.
 * No hardcoded path strings should exist outside this configuration.
 * ============================================================================
 */

export const ROUTE_IDS = Object.freeze({
  SIGN_IN: 'signin',
  HOME: 'home',
  ABOUT: 'about',
  CONTACT: 'contact',
  PRODUCTS: 'products',
  BOM_OPERATIONS: 'bomOperations',
  BOM_CREATE_HUB: 'bomCreateHub',
  BOM_CREATE_SINGLE: 'bomCreateSingle',
  BOM_CREATE_BULK: 'bomCreateBulk',
  BOM_COPY_HUB: 'bomCopyHub',
  BOM_COPY_SINGLE: 'bomCopySingle',
  BOM_COPY_BULK: 'bomCopyBulk',
  BOM_DISPLAY: 'bomDisplay',
  BOM_VALIDATE: 'bomValidate',
  BOM_DELETE: 'bomDelete',
  ADMIN: 'admin',
  ADMIN_USERS: 'adminUsers',
  ADMIN_SERVERS: 'adminServers',
  ADMIN_PERMISSIONS: 'adminPermissions',
  ADMIN_LOGS_AUDIT: 'adminLogsAudit',
  ADMIN_LOGS_ERRORS: 'adminLogsErrors',
  DEV_DESIGN_SYSTEM: 'devDesignSystem',
  ACCESS_DENIED: 'accessDenied',
  NOT_FOUND: 'notFound'
});

export const ROUTES = Object.freeze({
  [ROUTE_IDS.SIGN_IN]: {
    id: ROUTE_IDS.SIGN_IN,
    path: '/signin',
    title: 'Sign In · RexaEdge',
    breadcrumb: 'Sign In',
    access: 'public',
    parent: null
  },
  [ROUTE_IDS.ABOUT]: {
    id: ROUTE_IDS.ABOUT,
    path: '/about',
    title: 'About Us · RexaEdge',
    breadcrumb: 'About Us',
    access: 'authenticated',
    parent: ROUTE_IDS.HOME
  },
  [ROUTE_IDS.CONTACT]: {
    id: ROUTE_IDS.CONTACT,
    path: '/contact',
    title: 'Contact Us · RexaEdge',
    breadcrumb: 'Contact Us',
    access: 'authenticated',
    parent: ROUTE_IDS.HOME
  },
  [ROUTE_IDS.HOME]: {
    id: ROUTE_IDS.HOME,
    path: '/home',
    title: 'Home · RexaEdge ERP',
    breadcrumb: 'Home',
    access: 'authenticated',
    parent: null
  },
  [ROUTE_IDS.PRODUCTS]: {
    id: ROUTE_IDS.PRODUCTS,
    path: '/products',
    title: 'Products · RexaEdge',
    breadcrumb: 'Products',
    access: 'authenticated',
    parent: ROUTE_IDS.HOME
  },
  [ROUTE_IDS.BOM_OPERATIONS]: {
    id: ROUTE_IDS.BOM_OPERATIONS,
    path: '/products/bom',
    title: 'Bill of Materials · RexaEdge',
    breadcrumb: 'BOM management',
    access: 'authenticated',
    module: 'bom',
    parent: ROUTE_IDS.HOME
  },
  [ROUTE_IDS.BOM_CREATE_HUB]: {
    id: ROUTE_IDS.BOM_CREATE_HUB,
    path: '/products/bom/create',
    title: 'Create BOM · RexaEdge',
    breadcrumb: 'Create BOM',
    access: 'authenticated',
    module: 'bom',
    parent: ROUTE_IDS.BOM_OPERATIONS
  },
  [ROUTE_IDS.BOM_CREATE_SINGLE]: {
    id: ROUTE_IDS.BOM_CREATE_SINGLE,
    path: '/products/bom/create/single',
    title: 'Create Single BOM · RexaEdge',
    breadcrumb: 'Create Single BOM',
    access: 'authenticated',
    module: 'bom',
    feature: 'bom.create',
    parent: ROUTE_IDS.BOM_CREATE_HUB
  },
  [ROUTE_IDS.BOM_CREATE_BULK]: {
    id: ROUTE_IDS.BOM_CREATE_BULK,
    path: '/products/bom/create/bulk',
    title: 'Bulk Create BOM · RexaEdge',
    breadcrumb: 'Bulk Upload BOMs',
    access: 'authenticated',
    module: 'bom',
    feature: 'bom.create',
    parent: ROUTE_IDS.BOM_CREATE_HUB
  },
  [ROUTE_IDS.BOM_COPY_HUB]: {
    id: ROUTE_IDS.BOM_COPY_HUB,
    path: '/products/bom/copy',
    title: 'Copy BOM · RexaEdge',
    breadcrumb: 'Copy BOM',
    access: 'authenticated',
    module: 'bom',
    parent: ROUTE_IDS.BOM_OPERATIONS
  },
  [ROUTE_IDS.BOM_COPY_SINGLE]: {
    id: ROUTE_IDS.BOM_COPY_SINGLE,
    path: '/products/bom/copy/single',
    title: 'Copy Single BOM · RexaEdge',
    breadcrumb: 'Copy Single BOM',
    access: 'authenticated',
    module: 'bom',
    feature: 'bom.copy',
    parent: ROUTE_IDS.BOM_COPY_HUB
  },
  [ROUTE_IDS.BOM_COPY_BULK]: {
    id: ROUTE_IDS.BOM_COPY_BULK,
    path: '/products/bom/copy/bulk',
    title: 'Bulk Copy BOM · RexaEdge',
    breadcrumb: 'Bulk Copy BOMs',
    access: 'authenticated',
    module: 'bom',
    feature: 'bom.copy',
    parent: ROUTE_IDS.BOM_COPY_HUB
  },
  [ROUTE_IDS.BOM_DISPLAY]: {
    id: ROUTE_IDS.BOM_DISPLAY,
    path: '/products/bom/display',
    title: 'Display BOM · RexaEdge',
    breadcrumb: 'Display BOM',
    access: 'authenticated',
    module: 'bom',
    feature: 'bom.display',
    parent: ROUTE_IDS.BOM_OPERATIONS
  },
  [ROUTE_IDS.BOM_VALIDATE]: {
    id: ROUTE_IDS.BOM_VALIDATE,
    path: '/products/bom/validate',
    title: 'Validate BOM · RexaEdge',
    breadcrumb: 'Validate BOM',
    access: 'authenticated',
    module: 'bom',
    feature: 'bom.validate',
    parent: ROUTE_IDS.BOM_OPERATIONS
  },
  [ROUTE_IDS.BOM_DELETE]: {
    id: ROUTE_IDS.BOM_DELETE,
    path: '/products/bom/delete',
    title: 'Delete BOM · RexaEdge',
    breadcrumb: 'Delete BOM',
    access: 'authenticated',
    module: 'bom',
    feature: 'bom.delete',
    parent: ROUTE_IDS.BOM_OPERATIONS
  },
  [ROUTE_IDS.ADMIN]: {
    id: ROUTE_IDS.ADMIN,
    path: '/admin',
    title: 'System & User Management · RexaEdge',
    breadcrumb: 'Enterprise Administration',
    access: 'admin',
    redirect: '/admin/users',
    parent: ROUTE_IDS.HOME
  },
  [ROUTE_IDS.ADMIN_USERS]: {
    id: ROUTE_IDS.ADMIN_USERS,
    path: '/admin/users',
    title: 'Users · System & User Management',
    breadcrumb: 'Users',
    access: 'admin',
    adminTab: 'users',
    parent: ROUTE_IDS.ADMIN
  },
  [ROUTE_IDS.ADMIN_SERVERS]: {
    id: ROUTE_IDS.ADMIN_SERVERS,
    path: '/admin/servers',
    title: 'SAP Servers · System & User Management',
    breadcrumb: 'SAP Servers',
    access: 'admin',
    adminTab: 'servers',
    parent: ROUTE_IDS.ADMIN
  },
  [ROUTE_IDS.ADMIN_PERMISSIONS]: {
    id: ROUTE_IDS.ADMIN_PERMISSIONS,
    path: '/admin/permissions',
    title: 'Access Permissions · System & User Management',
    breadcrumb: 'Permissions',
    access: 'admin',
    adminTab: 'permissions',
    parent: ROUTE_IDS.ADMIN
  },
  [ROUTE_IDS.ADMIN_LOGS_AUDIT]: {
    id: ROUTE_IDS.ADMIN_LOGS_AUDIT,
    path: '/admin/logs/audit',
    title: 'Audit Logs · System & User Management',
    breadcrumb: 'Audit Logs',
    access: 'admin',
    adminTab: 'activity-logs',
    adminSubTab: 'audit',
    parent: ROUTE_IDS.ADMIN
  },
  [ROUTE_IDS.ADMIN_LOGS_ERRORS]: {
    id: ROUTE_IDS.ADMIN_LOGS_ERRORS,
    path: '/admin/logs/errors',
    title: 'Error Logs · System & User Management',
    breadcrumb: 'Error Logs',
    access: 'admin',
    adminTab: 'activity-logs',
    adminSubTab: 'errors',
    parent: ROUTE_IDS.ADMIN
  },
  [ROUTE_IDS.DEV_DESIGN_SYSTEM]: {
    id: ROUTE_IDS.DEV_DESIGN_SYSTEM,
    path: '/dev/design-system',
    title: 'Design System Showcase · RexaEdge Dev',
    breadcrumb: 'Design System',
    access: 'dev',
    parent: ROUTE_IDS.HOME
  },
  [ROUTE_IDS.ACCESS_DENIED]: {
    id: ROUTE_IDS.ACCESS_DENIED,
    path: '/access-denied',
    title: 'Access Denied · RexaEdge',
    breadcrumb: 'Access Denied',
    access: 'public',
    parent: ROUTE_IDS.HOME
  },
  [ROUTE_IDS.NOT_FOUND]: {
    id: ROUTE_IDS.NOT_FOUND,
    path: '/404',
    title: 'Page Not Found · RexaEdge',
    breadcrumb: 'Page Not Found',
    access: 'public',
    parent: ROUTE_IDS.HOME
  }
});

/**
 * Legacy URL Redirects Map
 * Any hit to these legacy paths is instantly replaced with the new canonical path.
 */
export const LEGACY_REDIRECTS = Object.freeze({
  '/create_bom': '/products/bom/create/single',
  '/bulk_create_bom': '/products/bom/create/bulk',
  '/copy_bom': '/products/bom/copy/single',
  '/bulk_bom': '/products/bom/copy/bulk',
  '/bom_explorer': '/products/bom/display',
  '/validate_bom': '/products/bom/validate',
  '/delete_bom': '/products/bom/delete',
  '/bom': '/products/bom',
  '/products': '/home',
  '/launchpad': '/home',
  '/admin': '/admin/users',
  '/admin/logs': '/admin/logs/audit',
  '/admin/activity-logs': '/admin/logs/audit'
});

/**
 * Mapping from module action names to route IDs
 */
export const ACTION_TO_ROUTE_ID = Object.freeze({
  create_bom: ROUTE_IDS.BOM_CREATE_SINGLE,
  bulk_create_bom: ROUTE_IDS.BOM_CREATE_BULK,
  copy_bom: ROUTE_IDS.BOM_COPY_SINGLE,
  bulk_bom: ROUTE_IDS.BOM_COPY_BULK,
  bom_explorer: ROUTE_IDS.BOM_DISPLAY,
  validate_bom: ROUTE_IDS.BOM_VALIDATE,
  delete_bom: ROUTE_IDS.BOM_DELETE
});

/**
 * Mapping from FioriLaunchpad subView keys to route IDs
 */
export const SUBVIEW_TO_ROUTE_ID = Object.freeze({
  home: ROUTE_IDS.PRODUCTS,
  bom_operations: ROUTE_IDS.BOM_OPERATIONS,
  bom_create_operations: ROUTE_IDS.BOM_CREATE_HUB,
  bom_copy_operations: ROUTE_IDS.BOM_COPY_HUB
});

/**
 * Normalizes any pathname by lowercasing and trimming trailing slashes.
 */
export function normalizePath(path = '') {
  if (typeof path !== 'string') return '/';
  const clean = path.trim().toLowerCase();
  if (clean === '' || clean === '/') return '/';
  return clean.replace(/\/+$/, '');
}

/**
 * Validates that a path is strictly internal to prevent open redirect vulnerabilities.
 */
export function isInternalPath(path) {
  if (typeof path !== 'string') return false;
  const trimmed = path.trim();
  // Must start with single slash, not double slash (//evil.com), and no protocol (javascript:, https:)
  return trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes(':');
}

/**
 * Resolves any legacy redirect for a given pathname.
 */
export function resolveLegacyRedirect(pathname) {
  const normalized = normalizePath(pathname);
  if (LEGACY_REDIRECTS[normalized]) {
    return LEGACY_REDIRECTS[normalized];
  }
  return null;
}

/**
 * Look up a route definition by its id.
 */
export function getRouteById(routeId) {
  return ROUTES[routeId] || null;
}

/**
 * Look up a route definition by its path.
 */
export function getRouteByPath(pathname) {
  const normalized = normalizePath(pathname);
  const direct = Object.values(ROUTES).find((r) => r.path === normalized);
  if (direct) return direct;
  const legacy = resolveLegacyRedirect(normalized);
  if (legacy) {
    return Object.values(ROUTES).find((r) => r.path === legacy) || null;
  }
  return null;
}

/**
 * Generates an internal URL for a given route ID with optional query params.
 */
export function routeTo(routeId, queryParams = {}) {
  const route = getRouteById(routeId);
  const basePath = route ? route.path : '/home';
  if (!queryParams || Object.keys(queryParams).length === 0) {
    return basePath;
  }
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  }
  const queryString = searchParams.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

/**
 * Computes the breadcrumb trail hierarchy for a given route ID.
 */
export function getBreadcrumbsForRoute(routeId) {
  const crumbs = [];
  let curr = getRouteById(routeId);

  while (curr) {
    crumbs.unshift({
      id: curr.id,
      label: curr.breadcrumb,
      path: curr.path
    });
    curr = curr.parent ? getRouteById(curr.parent) : null;
  }

  // Ensure 'Home' is always the first breadcrumb if not already present
  if (crumbs.length > 0 && crumbs[0].id !== ROUTE_IDS.HOME && crumbs[0].id !== ROUTE_IDS.SIGN_IN) {
    const home = getRouteById(ROUTE_IDS.HOME);
    crumbs.unshift({
      id: home.id,
      label: home.breadcrumb,
      path: home.path
    });
  }

  return crumbs;
}
