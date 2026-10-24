/**
 * ============================================================================
 * MODULE REGISTRY - SINGLE SOURCE OF TRUTH
 * ============================================================================
 * Defines all system modules, their keys, labels, lifecycle status,
 * UI grouping, and associated operational views.
 *
 * Adding a future module (e.g. Routing) only requires:
 * 1. An entry in this registry with its actions/subApps
 * 2. Its backend routes guarded with requireModuleAccess(moduleKey)
 * ============================================================================
 */

export const MODULE_STATUS = {
  AVAILABLE: 'available',
  COMING_SOON: 'coming_soon'
};

export const MODULE_REGISTRY = [
  {
    key: 'bom',
    label: 'Bill of Materials',
    status: 'available',
    group: 'Production Planning',
    desc: 'Create, copy, change, display and delete BOMs',
    iconName: 'Layers',
    kpiNum: '5',
    kpiLabel: 'apps',
    subView: 'bom_operations',
    // The specific UI actions / route tabs that belong to this module:
    actions: ['create_bom', 'bulk_create_bom', 'copy_bom', 'bulk_bom', 'delete_bom', 'bom_explorer', 'validate_bom'],
    subApps: [
      {
        id: 'create_group',
        title: 'Create BOM',
        desc: 'Create a single BOM or many from a file',
        iconName: 'FolderPlus',
        isGroup: true,
        subView: 'bom_create_operations',
        children: [
          {
            id: 'create',
            title: 'Create Single BOM',
            desc: 'Create new BOM header and components',
            iconName: 'PlusSquare',
            action: 'create_bom'
          },
          {
            id: 'bulk_create',
            title: 'Create Bulk BOM',
            desc: 'Upload file to create multiple BOMs sequentially',
            iconName: 'FilePlus',
            action: 'bulk_create_bom'
          }
        ]
      },
      {
        id: 'copy_group',
        title: 'Copy BOM',
        desc: 'Copy a single BOM or many at once',
        iconName: 'Files',
        isGroup: true,
        subView: 'bom_copy_operations',
        children: [
          {
            id: 'copy',
            title: 'Copy Single BOM',
            desc: 'Copy a BOM from source to target',
            iconName: 'Copy',
            action: 'copy_bom'
          },
          {
            id: 'bulk',
            title: 'Copy Bulk BOM',
            desc: 'Excel mass upload & batch sequential RFC',
            iconName: 'FileSpreadsheet',
            action: 'bulk_bom'
          }
        ]
      },
      {
        id: 'display',
        title: 'Display BOM',
        desc: 'Read BOM header and components',
        iconName: 'Eye',
        action: 'bom_explorer'
      },
      {
        id: 'validate',
        title: 'Validate BOM',
        desc: 'Pre-flight validation of material and BOM in SAP',
        iconName: 'ShieldCheck',
        action: 'validate_bom'
      },
      {
        id: 'delete',
        title: 'Delete BOM',
        desc: 'Delete a BOM (confirmation required)',
        iconName: 'Trash2',
        danger: true,
        action: 'delete_bom'
      }
    ]
  },
  {
    key: 'material_master',
    label: 'Material Master',
    status: 'coming_soon',
    group: 'Master Data',
    desc: 'Material data maintenance',
    iconName: 'Package',
    actions: []
  },
  {
    key: 'routing',
    label: 'Routing',
    status: 'coming_soon',
    group: 'Production Planning',
    desc: 'Task lists and operations',
    iconName: 'Wrench',
    actions: []
  },
  {
    key: 'purchase_orders',
    label: 'Purchase Orders',
    status: 'coming_soon',
    group: 'Procurement',
    desc: 'Purchase order management and tracking',
    iconName: 'ShoppingCart',
    actions: []
  },
  {
    key: 'production_orders',
    label: 'Production Orders',
    status: 'coming_soon',
    group: 'Production Planning',
    desc: 'Order release and confirmation',
    iconName: 'TrendingUp',
    actions: []
  }
];

// Helper dictionaries derived from the registry
export const MODULES_BY_KEY = Object.freeze(
  MODULE_REGISTRY.reduce((acc, mod) => {
    acc[mod.key] = mod;
    return acc;
  }, {})
);

export const MODULE_KEYS = Object.freeze(
  MODULE_REGISTRY.reduce((acc, mod) => {
    acc[mod.key.toUpperCase()] = mod.key;
    return acc;
  }, {})
);

/**
 * Returns true if the given module key exists in the registry and is available
 */
export function isModuleAvailable(moduleKey) {
  const mod = MODULES_BY_KEY[moduleKey];
  return Boolean(mod && mod.status === MODULE_STATUS.AVAILABLE);
}

/**
 * Resolves which module key owns a specific UI tab/action (e.g. 'copy_bom' -> 'bom')
 */
export function getModuleKeyForAction(action) {
  const found = MODULE_REGISTRY.find((mod) => mod.actions && mod.actions.includes(action));
  return found ? found.key : null;
}

/**
 * Evaluates whether a user has access to a specific card or group card.
 * - Group card is visible if at least one of its children is permitted.
 * - Leaf card is visible if permitted by role/permissions list.
 * - If userPermissions is empty/null, all cards are permitted by default.
 */
export function hasCardPermission(card, userPermissions, userRole) {
  if (userRole === 'admin') return true;
  if (!userPermissions || (Array.isArray(userPermissions) && userPermissions.length === 0)) {
    return true;
  }
  const perms = Array.isArray(userPermissions)
    ? userPermissions
    : (userPermissions.permissions || userPermissions.actions || []);

  if (perms.length === 0) return true;

  if (card.children && card.children.length > 0) {
    return card.children.some((child) => hasCardPermission(child, perms, userRole));
  }

  return (
    perms.includes('*') ||
    perms.includes(card.id) ||
    perms.includes(card.action)
  );
}
