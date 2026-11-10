/**
 * ============================================================================
 * MODULE REGISTRY - SINGLE SOURCE OF TRUTH
 * ============================================================================
 * Defines all system modules, their keys, labels, lifecycle status,
 * UI grouping, and associated operational views.
 *
 * Adding a future module (Ex. Routing) only requires:
 * 1. An entry in this registry with its actions/subApps
 * 2. Its backend routes guarded with requireModuleAccess(moduleKey)
 * ============================================================================
 */

export const MODULE_STATUS = {
  AVAILABLE: 'available',
  COMING_SOON: 'coming_soon'
};

/**
 * ============================================================================
 * BOM APP PERMISSIONS & DEFINITIONS
 * ============================================================================
 */
export const BOM_APP_KEYS = Object.freeze({
  DISPLAY: 'bom.display',
  VALIDATE: 'bom.validate',
  CREATE: 'bom.create',
  COPY: 'bom.copy',
  DELETE: 'bom.delete'
});

export const BOM_APP_LIST = Object.freeze([
  {
    key: 'bom.display',
    label: 'Display BOM',
    shortName: 'Display',
    description: 'View BOM components, header data, and multi-level hierarchy structure.'
  },
  {
    key: 'bom.validate',
    label: 'Validate BOM',
    shortName: 'Validate',
    description: 'Pre-flight verification of material and BOM readiness in SAP.'
  },
  {
    key: 'bom.create',
    label: 'Create BOM',
    shortName: 'Create',
    description: 'Create single and bulk Bills of Materials in SAP (implies Display).',
    implies: ['bom.display']
  },
  {
    key: 'bom.copy',
    label: 'Copy BOM',
    shortName: 'Copy',
    description: 'Copy single and bulk Bills of Materials across plants (implies Display).',
    implies: ['bom.display']
  },
  {
    key: 'bom.delete',
    label: 'Delete BOM',
    shortName: 'Delete',
    description: 'Delete Bills of Materials directly in SAP with pre-checks (implies Display).',
    implies: ['bom.display']
  }
]);

export const ALL_BOM_APPS = Object.freeze(BOM_APP_LIST.map((a) => a.key));

export const MODULE_REGISTRY = [
  {
    key: 'bom',
    label: 'Bill of Materials',
    status: 'available',
    group: 'Production Planning',
    desc: 'Create, copy, change, display and delete BOMs',
    iconName: 'Layers',
    kpiNum: '5',
    kpiLabel: 'features',
    subView: 'bom_operations',
    // The specific UI actions / route tabs that belong to this module:
    actions: ['create_bom', 'bulk_create_bom', 'copy_bom', 'bulk_bom', 'delete_bom', 'bom_explorer', 'validate_bom'],
    apps: BOM_APP_LIST,
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
            desc: 'Upload a spreadsheet to copy multiple BOMs across plants',
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
    actions: [],
    apps: []
  },
  {
    key: 'routing',
    label: 'Routing',
    status: 'coming_soon',
    group: 'Production Planning',
    desc: 'Task lists and operations',
    iconName: 'Route',
    actions: [],
    apps: []
  },
  {
    key: 'purchase_orders',
    label: 'Purchase Orders',
    status: 'coming_soon',
    group: 'Procurement',
    desc: 'Purchase order management and tracking',
    iconName: 'ShoppingCart',
    actions: [],
    apps: []
  },
  {
    key: 'production_orders',
    label: 'Production Orders',
    status: 'coming_soon',
    group: 'Production Planning',
    desc: 'Order release and confirmation',
    iconName: 'Factory',
    actions: [],
    apps: []
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
 * Returns all app keys available in the system across all available modules
 */
export function getAllAvailableAppKeys() {
  return MODULE_REGISTRY
    .filter((mod) => mod.status === MODULE_STATUS.AVAILABLE && Array.isArray(mod.apps))
    .flatMap((mod) => mod.apps.map((app) => app.key));
}

/**
 * Implied permission rule:
 * bom.create, bom.copy, and bom.delete imply bom.display.
 * Also dynamically applies any `app.implies` defined in MODULE_REGISTRY.
 */
export function normalizePermissions(rawPerms = []) {
  if (!rawPerms || !Array.isArray(rawPerms)) return [];
  const set = new Set(rawPerms);

  // Dynamic implied rules from all module app definitions
  MODULE_REGISTRY.forEach((mod) => {
    (mod.apps || []).forEach((app) => {
      if (set.has(app.key) && Array.isArray(app.implies)) {
        app.implies.forEach((impliedKey) => set.add(impliedKey));
      }
    });
  });

  // Backward compatibility / explicit safety check for BOM write apps implying bom.display
  if (set.has('bom.create') || set.has('bom.copy') || set.has('bom.delete')) {
    set.add('bom.display');
  }

  return Array.from(set);
}

/**
 * Returns structured summary data for feature permissions:
 * - text: Compact representation (Ex. "Display", "Display, Validate", "All (5)", "None")
 * - pillCount: Extra features beyond the first 2 (Ex. 2 for "Display, Validate +2")
 * - isNone: true if 0 features granted
 * - isAll: true if all features granted
 * - tooltip: Full accessible list of granted features
 */
export function getPermissionsSummaryParts(perms = []) {
  const norm = normalizePermissions(perms);
  if (!norm || norm.length === 0) {
    return {
      text: 'None',
      pillCount: 0,
      isNone: true,
      isAll: false,
      tooltip: 'No features granted'
    };
  }

  const activeModules = MODULE_REGISTRY.filter(
    (mod) => Array.isArray(mod.apps) && mod.apps.length > 0
  );

  const matchedModules = activeModules.filter((mod) =>
    mod.apps.some((a) => norm.includes(a.key))
  );

  if (matchedModules.length === 0) {
    return {
      text: 'None',
      pillCount: 0,
      isNone: true,
      isAll: false,
      tooltip: 'No features granted'
    };
  }

  const isMultiModule = matchedModules.length > 1;
  const moduleTexts = [];
  const tooltipParts = [];
  let totalPillCount = 0;
  let allModulesFull = true;

  matchedModules.forEach((mod) => {
    const totalApps = mod.apps.length;
    const matchedApps = mod.apps.filter((app) => norm.includes(app.key));
    const isModuleAll = matchedApps.length === totalApps;
    if (!isModuleAll) allModulesFull = false;

    const fullNames = matchedApps.map((a) => a.label);
    const shortNames = matchedApps.map((a) => a.shortName || a.label);

    tooltipParts.push(`${mod.label}: ${fullNames.join(', ')}`);

    const prefix = isMultiModule ? `${mod.label}: ` : '';

    if (isModuleAll) {
      moduleTexts.push(`${prefix}All (${totalApps})`);
    } else if (matchedApps.length <= 2) {
      moduleTexts.push(`${prefix}${shortNames.join(', ')}`);
    } else {
      const firstTwo = shortNames.slice(0, 2).join(', ');
      const rem = matchedApps.length - 2;
      totalPillCount += rem;
      moduleTexts.push(`${prefix}${firstTwo}`);
    }
  });

  return {
    text: moduleTexts.join('; '),
    pillCount: totalPillCount,
    isNone: false,
    isAll: allModulesFull && !isMultiModule,
    tooltip: tooltipParts.join(' | ')
  };
}

/**
 * Formats a clean, readable summary column string:
 * Ex. "Display, Validate +2", "All (5)" when everything is granted, "None" when nothing is.
 */
export function formatPermissionsSummary(perms = []) {
  const parts = getPermissionsSummaryParts(perms);
  if (parts.pillCount > 0) {
    return `${parts.text} +${parts.pillCount}`;
  }
  return parts.text;
}

/**
 * Resolves which app key owns a given tab or action (Ex. 'bulk_create_bom' -> 'bom.create')
 */
export function getAppKeyForAction(action) {
  if (!action) return null;
  if (action === 'create_bom' || action === 'bulk_create_bom') return 'bom.create';
  if (action === 'copy_bom' || action === 'bulk_bom') return 'bom.copy';
  if (action === 'delete_bom') return 'bom.delete';
  if (action === 'bom_explorer') return 'bom.display';
  if (action === 'validate_bom') return 'bom.validate';
  return null;
}

/**
 * Resolves which app key controls a launchpad card
 */
export function getAppKeyForCard(card) {
  if (!card) return null;
  if (card.id === 'create_group' || card.id === 'create' || card.id === 'bulk_create') return 'bom.create';
  if (card.id === 'copy_group' || card.id === 'copy' || card.id === 'bulk') return 'bom.copy';
  if (card.id === 'delete') return 'bom.delete';
  if (card.id === 'display') return 'bom.display';
  if (card.id === 'validate') return 'bom.validate';
  return getAppKeyForAction(card.action);
}

/**
 * Returns true if the given module key exists in the registry and is available
 */
export function isModuleAvailable(moduleKey) {
  const mod = MODULES_BY_KEY[moduleKey];
  return Boolean(mod && mod.status === MODULE_STATUS.AVAILABLE);
}

/**
 * Resolves which module key owns a specific UI tab/action (Ex. 'copy_bom' -> 'bom')
 */
export function getModuleKeyForAction(action) {
  const found = MODULE_REGISTRY.find((mod) => mod.actions && mod.actions.includes(action));
  return found ? found.key : null;
}

/**
 * Evaluates whether a user has access to a specific card or group card.
 * - Group card is visible if at least one of its children is permitted.
 * - Leaf card is visible if permitted by role/permissions list.
 * - If user is admin, all cards are permitted.
 * - If user has 0 permissions, returns false.
 */
export function hasCardPermission(card, userPermissions, userRole) {
  if (userRole === 'admin') return true;
  if (!userPermissions) return false;
  const rawList = Array.isArray(userPermissions)
    ? userPermissions
    : (userPermissions.permissions || userPermissions.actions || []);
  if (rawList.length === 0) return false;

  const perms = normalizePermissions(rawList);
  if (perms.length === 0) return false;

  if (perms.includes('*')) return true;

  // Group cards: visible if at least one child is permitted
  if (card.children && card.children.length > 0) {
    return card.children.some((child) => hasCardPermission(child, perms, userRole));
  }

  // Modern app-level permission check
  const appKey = getAppKeyForCard(card);
  if (appKey && perms.includes(appKey)) {
    return true;
  }

  // Legacy action or ID matching
  if (card.id && perms.includes(card.id)) return true;
  if (card.action && perms.includes(card.action)) return true;

  return false;
}
