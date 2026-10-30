// frontend/src/components/WelcomeView.jsx
import React from "react";
import {
  LayoutGrid,
  Search,
  Eye,
  ShieldCheck,
  PlusSquare,
  Copy,
  Trash2,
  Server,
  User as UserIcon,
  Activity,
  AlertCircle,
  ExternalLink,
  ArrowRight,
  Sparkles,
  CheckCircle2
} from "lucide-react";

// frontend/src/config/aboutConfig.js
var ABOUT_CONFIG = Object.freeze({
  rexaEdge: {
    name: "RexaEdge",
    tagline: "The AI Edge for Your ERP",
    description: "RexaEdge is a web portal for SAP Bill of Materials. View, validate, create, copy and delete BOMs, with access controlled per user and per SAP server."
  },
  company: {
    name: "Next IT Point Intellectual Services Pvt. Ltd.",
    productLine: "RexaEdge is a product of Next IT Point.",
    websiteUrl: "https://www.nextitpoint.com",
    websiteLabel: "www.nextitpoint.com"
  },
  footer: {
    productName: "RexaEdge",
    companyName: "Next IT Point",
    text: (year = (/* @__PURE__ */ new Date()).getFullYear()) => `\xA9 ${year} RexaEdge \xB7 a product of Next IT Point`
  }
});

// shared/modules.js
var BOM_APP_KEYS = Object.freeze({
  DISPLAY: "bom.display",
  VALIDATE: "bom.validate",
  CREATE: "bom.create",
  COPY: "bom.copy",
  DELETE: "bom.delete"
});
var BOM_APP_LIST = Object.freeze([
  {
    key: "bom.display",
    label: "Display BOM",
    shortName: "Display",
    description: "View BOM components, header data, and multi-level hierarchy structure."
  },
  {
    key: "bom.validate",
    label: "Validate BOM",
    shortName: "Validate",
    description: "Pre-flight verification of material and BOM readiness in SAP."
  },
  {
    key: "bom.create",
    label: "Create BOM",
    shortName: "Create",
    description: "Create single and bulk Bills of Materials in SAP (implies Display).",
    implies: ["bom.display"]
  },
  {
    key: "bom.copy",
    label: "Copy BOM",
    shortName: "Copy",
    description: "Copy single and bulk Bills of Materials across plants (implies Display).",
    implies: ["bom.display"]
  },
  {
    key: "bom.delete",
    label: "Delete BOM",
    shortName: "Delete",
    description: "Delete Bills of Materials directly in SAP with pre-checks (implies Display).",
    implies: ["bom.display"]
  }
]);
var ALL_BOM_APPS = Object.freeze(BOM_APP_LIST.map((a) => a.key));
var MODULE_REGISTRY = [
  {
    key: "bom",
    label: "Bill of Materials",
    status: "available",
    group: "Production Planning",
    desc: "Create, copy, change, display and delete BOMs",
    iconName: "Layers",
    kpiNum: "5",
    kpiLabel: "features",
    subView: "bom_operations",
    // The specific UI actions / route tabs that belong to this module:
    actions: ["create_bom", "bulk_create_bom", "copy_bom", "bulk_bom", "delete_bom", "bom_explorer", "validate_bom"],
    apps: BOM_APP_LIST,
    subApps: [
      {
        id: "create_group",
        title: "Create BOM",
        desc: "Create a single BOM or many from a file",
        iconName: "FolderPlus",
        isGroup: true,
        subView: "bom_create_operations",
        children: [
          {
            id: "create",
            title: "Create Single BOM",
            desc: "Create new BOM header and components",
            iconName: "PlusSquare",
            action: "create_bom"
          },
          {
            id: "bulk_create",
            title: "Create Bulk BOM",
            desc: "Upload file to create multiple BOMs sequentially",
            iconName: "FilePlus",
            action: "bulk_create_bom"
          }
        ]
      },
      {
        id: "copy_group",
        title: "Copy BOM",
        desc: "Copy a single BOM or many at once",
        iconName: "Files",
        isGroup: true,
        subView: "bom_copy_operations",
        children: [
          {
            id: "copy",
            title: "Copy Single BOM",
            desc: "Copy a BOM from source to target",
            iconName: "Copy",
            action: "copy_bom"
          },
          {
            id: "bulk",
            title: "Copy Bulk BOM",
            desc: "Upload a spreadsheet to copy multiple BOMs across plants",
            iconName: "FileSpreadsheet",
            action: "bulk_bom"
          }
        ]
      },
      {
        id: "display",
        title: "Display BOM",
        desc: "Read BOM header and components",
        iconName: "Eye",
        action: "bom_explorer"
      },
      {
        id: "validate",
        title: "Validate BOM",
        desc: "Pre-flight validation of material and BOM in SAP",
        iconName: "ShieldCheck",
        action: "validate_bom"
      },
      {
        id: "delete",
        title: "Delete BOM",
        desc: "Delete a BOM (confirmation required)",
        iconName: "Trash2",
        danger: true,
        action: "delete_bom"
      }
    ]
  },
  {
    key: "material_master",
    label: "Material Master",
    status: "coming_soon",
    group: "Master Data",
    desc: "Material data maintenance",
    iconName: "Package",
    actions: [],
    apps: []
  },
  {
    key: "routing",
    label: "Routing",
    status: "coming_soon",
    group: "Production Planning",
    desc: "Task lists and operations",
    iconName: "Wrench",
    actions: [],
    apps: []
  },
  {
    key: "purchase_orders",
    label: "Purchase Orders",
    status: "coming_soon",
    group: "Procurement",
    desc: "Purchase order management and tracking",
    iconName: "ShoppingCart",
    actions: [],
    apps: []
  },
  {
    key: "production_orders",
    label: "Production Orders",
    status: "coming_soon",
    group: "Production Planning",
    desc: "Order release and confirmation",
    iconName: "TrendingUp",
    actions: [],
    apps: []
  }
];
var MODULES_BY_KEY = Object.freeze(
  MODULE_REGISTRY.reduce((acc, mod) => {
    acc[mod.key] = mod;
    return acc;
  }, {})
);
var MODULE_KEYS = Object.freeze(
  MODULE_REGISTRY.reduce((acc, mod) => {
    acc[mod.key.toUpperCase()] = mod.key;
    return acc;
  }, {})
);
function normalizePermissions(rawPerms = []) {
  if (!rawPerms || !Array.isArray(rawPerms)) return [];
  const set = new Set(rawPerms);
  MODULE_REGISTRY.forEach((mod) => {
    (mod.apps || []).forEach((app) => {
      if (set.has(app.key) && Array.isArray(app.implies)) {
        app.implies.forEach((impliedKey) => set.add(impliedKey));
      }
    });
  });
  if (set.has("bom.create") || set.has("bom.copy") || set.has("bom.delete")) {
    set.add("bom.display");
  }
  return Array.from(set);
}

// frontend/src/components/WelcomeView.jsx
var QUICK_LAUNCH_FEATURES = [
  {
    key: "bom.display",
    id: "display",
    title: "Display BOM",
    desc: "View BOM components, header data, and structure",
    icon: Eye,
    action: "bom_explorer"
  },
  {
    key: "bom.validate",
    id: "validate",
    title: "Validate BOM",
    desc: "Pre-flight check before you create or modify",
    icon: ShieldCheck,
    action: "validate_bom"
  },
  {
    key: "bom.create",
    id: "create",
    title: "Create BOM",
    desc: "Create single or bulk Bills of Materials",
    icon: PlusSquare,
    action: "create_bom"
  },
  {
    key: "bom.copy",
    id: "copy",
    title: "Copy BOM",
    desc: "Copy single or bulk BOMs across plants",
    icon: Copy,
    action: "copy_bom"
  },
  {
    key: "bom.delete",
    id: "delete",
    title: "Delete BOM",
    desc: "Delete BOMs with safety pre-checks",
    icon: Trash2,
    action: "delete_bom",
    danger: true
  }
];
function WelcomeView({
  user,
  selectedServer,
  sapSession,
  userPermissions = [],
  userRole = "user",
  availableServers = [],
  onOpenAction,
  onOpenApplications,
  onOpenAdmin
}) {
  const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
  const displayName = user?.name || user?.full_name || user?.email || "User";
  const effectivePerms = userRole === "admin" ? ALL_BOM_APPS : normalizePermissions(
    Array.isArray(userPermissions) ? userPermissions : userPermissions?.permissions || userPermissions?.actions || []
  );
  const permittedFeatures = QUICK_LAUNCH_FEATURES.filter(
    (feat) => userRole === "admin" ? true : effectivePerms.includes(feat.key)
  );
  const hasServers = Array.isArray(availableServers) && availableServers.length > 0;
  const hasSelectedServer = Boolean(selectedServer);
  const formatConnectionStatus = () => {
    if (!sapSession) return { text: "CHECKING SAP...", statusClass: "checking" };
    if (sapSession.mode === "RFC" && sapSession.connected) {
      return {
        text: `SAP RFC ONLINE${sapSession.latencyMs ? ` (${sapSession.latencyMs}ms)` : ""}`,
        statusClass: "connected"
      };
    }
    if (sapSession.code === "SELECTED_SESSION_UNAVAILABLE") {
      return { text: "SELECTED SESSION DISCONNECTED", statusClass: "disconnected" };
    }
    if (sapSession.status === "CONNECTED" || sapSession.status === "AVAILABLE") {
      return { text: "SAP CONNECTED", statusClass: "connected" };
    }
    if (sapSession.status === "CHECKING") {
      return { text: "CHECKING SAP...", statusClass: "checking" };
    }
    if (sapSession.status === "BUSY") {
      return { text: "SAP BUSY", statusClass: "busy" };
    }
    if (sapSession.status === "SERVER_UNAVAILABLE") {
      return { text: "SAP SERVER UNAVAILABLE", statusClass: "server_unavailable" };
    }
    if (sapSession.status === "DISCONNECTED" || sapSession.status === "SESSION_NOT_FOUND") {
      return { text: "SAP DISCONNECTED", statusClass: "disconnected" };
    }
    return {
      text: `SAP ${sapSession.status || "UNKNOWN"}`,
      statusClass: (sapSession.status || "checking").toLowerCase()
    };
  };
  const connStatus = formatConnectionStatus();
  const sessionUser = sapSession?.selectedUser || sapSession?.user || null;
  return /* @__PURE__ */ React.createElement("div", { className: "rexa-welcome-page", "data-testid": "welcome-page" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-welcome-header" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-welcome-title-group" }, /* @__PURE__ */ React.createElement("h1", { className: "rexa-welcome-greeting", "data-testid": "welcome-greeting" }, "Welcome, ", displayName), /* @__PURE__ */ React.createElement("p", { className: "rexa-welcome-sub" }, "Web portal for SAP Bill of Materials \xB7 View, validate, create, copy and delete")), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "sap-btn sap-btn-primary rexa-welcome-apps-btn",
      onClick: onOpenApplications,
      title: "Open Applications launchpad",
      "data-testid": "open-applications-btn"
    },
    /* @__PURE__ */ React.createElement(LayoutGrid, { size: 16 }),
    /* @__PURE__ */ React.createElement("span", null, "Open Applications")
  )), /* @__PURE__ */ React.createElement("div", { className: "rexa-welcome-strip", role: "region", "aria-label": "How it works" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-strip-step" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-strip-num" }, "1"), /* @__PURE__ */ React.createElement("div", { className: "rexa-strip-content" }, /* @__PURE__ */ React.createElement("span", { className: "rexa-strip-title" }, "Search with F4"), /* @__PURE__ */ React.createElement("span", { className: "rexa-strip-desc" }, "find materials and plants"))), /* @__PURE__ */ React.createElement("div", { className: "rexa-strip-step" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-strip-num" }, "2"), /* @__PURE__ */ React.createElement("div", { className: "rexa-strip-content" }, /* @__PURE__ */ React.createElement("span", { className: "rexa-strip-title" }, "Validate"), /* @__PURE__ */ React.createElement("span", { className: "rexa-strip-desc" }, "check before you create"))), /* @__PURE__ */ React.createElement("div", { className: "rexa-strip-step" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-strip-num" }, "3"), /* @__PURE__ */ React.createElement("div", { className: "rexa-strip-content" }, /* @__PURE__ */ React.createElement("span", { className: "rexa-strip-title" }, "Create or copy"), /* @__PURE__ */ React.createElement("span", { className: "rexa-strip-desc" }, "single or in bulk from Excel")))), /* @__PURE__ */ React.createElement("div", { className: "rexa-welcome-grid" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-welcome-col" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-card rexa-status-card", "data-testid": "status-card" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-card-header" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-card-title-wrap" }, /* @__PURE__ */ React.createElement(Activity, { size: 16, color: "var(--sap-primary, #0070f2)" }), /* @__PURE__ */ React.createElement("h2", { className: "rexa-card-title" }, "SAP System Status")), /* @__PURE__ */ React.createElement("span", { className: "rexa-card-subtitle" }, "Header connection state")), /* @__PURE__ */ React.createElement("div", { className: "rexa-status-items" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-status-item" }, /* @__PURE__ */ React.createElement("span", { className: "rexa-status-label" }, "Active Server"), /* @__PURE__ */ React.createElement("div", { className: "rexa-status-value", title: selectedServer?.name || "No server" }, selectedServer ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", null, selectedServer.name), selectedServer.environment && /* @__PURE__ */ React.createElement("span", { className: `rexa-env-tag ${selectedServer.environment === "PROD" ? "prod" : ""}` }, selectedServer.environment)) : /* @__PURE__ */ React.createElement("span", { style: { color: "var(--sap-text-muted)" } }, "No Server"))), /* @__PURE__ */ React.createElement("div", { className: "rexa-status-item" }, /* @__PURE__ */ React.createElement("span", { className: "rexa-status-label" }, "Connection"), /* @__PURE__ */ React.createElement("div", { className: "rexa-status-value" }, /* @__PURE__ */ React.createElement("span", { className: `rexa-status-dot ${connStatus.statusClass}` }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11.5 } }, connStatus.text))), /* @__PURE__ */ React.createElement("div", { className: "rexa-status-item" }, /* @__PURE__ */ React.createElement("span", { className: "rexa-status-label" }, "Session User"), /* @__PURE__ */ React.createElement("div", { className: "rexa-status-value" }, /* @__PURE__ */ React.createElement(UserIcon, { size: 13, color: "var(--sap-text-muted)" }), /* @__PURE__ */ React.createElement("span", null, sessionUser || "None"))))), /* @__PURE__ */ React.createElement("div", { className: "rexa-card rexa-quick-card", "data-testid": "quick-launch-card" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-card-header" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-card-title-wrap" }, /* @__PURE__ */ React.createElement(LayoutGrid, { size: 16, color: "var(--sap-primary, #0070f2)" }), /* @__PURE__ */ React.createElement("h2", { className: "rexa-card-title" }, "Quick Launch")), /* @__PURE__ */ React.createElement("span", { className: "rexa-card-subtitle" }, "Permitted BOM operations")), !hasServers ? (
    /* No servers available */
    /* @__PURE__ */ React.createElement("div", { className: "rexa-empty-quick", "data-testid": "quick-empty-no-server" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-empty-quick-icon" }, /* @__PURE__ */ React.createElement(AlertCircle, { size: 22 })), /* @__PURE__ */ React.createElement("h3", { className: "rexa-empty-quick-title" }, "No Permitted Servers"), /* @__PURE__ */ React.createElement("p", { className: "rexa-empty-quick-text" }, "No SAP servers assigned to your account. Please contact an administrator to request access."))
  ) : permittedFeatures.length === 0 ? (
    /* Server exists but 0 permitted features */
    /* @__PURE__ */ React.createElement("div", { className: "rexa-empty-quick", "data-testid": "quick-empty-no-perms" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-empty-quick-icon" }, /* @__PURE__ */ React.createElement(AlertCircle, { size: 22 })), /* @__PURE__ */ React.createElement("h3", { className: "rexa-empty-quick-title" }, "No Features Enabled"), /* @__PURE__ */ React.createElement("p", { className: "rexa-empty-quick-text" }, "There are currently no functional features enabled for this SAP server. Please select another server or contact an administrator to grant access."))
  ) : (
    /* Permitted Features Grid */
    /* @__PURE__ */ React.createElement("div", { className: "rexa-quick-grid", "data-testid": "quick-launch-grid" }, permittedFeatures.map((feat) => {
      const Icon = feat.icon;
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          key: feat.id,
          type: "button",
          className: `rexa-quick-tile ${feat.danger ? "danger" : ""}`,
          onClick: () => onOpenAction(feat.action),
          "data-testid": `quick-tile-${feat.id}`,
          title: `Open ${feat.title}`
        },
        /* @__PURE__ */ React.createElement("div", { className: "rexa-quick-tile-icon" }, /* @__PURE__ */ React.createElement(Icon, { size: 18, strokeWidth: 1.8 })),
        /* @__PURE__ */ React.createElement("span", { className: "rexa-quick-tile-name" }, feat.title),
        /* @__PURE__ */ React.createElement("span", { className: "rexa-quick-tile-desc" }, feat.desc)
      );
    }))
  )), userRole === "admin" && /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "rexa-admin-card",
      onClick: onOpenAdmin,
      "data-testid": "admin-quick-card",
      title: "Open Enterprise Administration & Permissions"
    },
    /* @__PURE__ */ React.createElement("div", { className: "rexa-admin-left" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-admin-icon" }, /* @__PURE__ */ React.createElement(ShieldCheck, { size: 18 })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "rexa-admin-title" }, "Enterprise Administration"), /* @__PURE__ */ React.createElement("p", { className: "rexa-admin-desc" }, "Manage SAP servers, user permissions, and security"))),
    /* @__PURE__ */ React.createElement(ArrowRight, { size: 16, color: "#4338ca" })
  )), /* @__PURE__ */ React.createElement("div", { className: "rexa-welcome-col" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-card", "data-testid": "about-rexaedge-card" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-card-header" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-card-title-wrap" }, /* @__PURE__ */ React.createElement(Sparkles, { size: 16, color: "var(--sap-primary, #0070f2)" }), /* @__PURE__ */ React.createElement("h2", { className: "rexa-card-title" }, "About ", ABOUT_CONFIG.rexaEdge.name))), /* @__PURE__ */ React.createElement("div", { className: "rexa-tagline-badge" }, /* @__PURE__ */ React.createElement("span", null, ABOUT_CONFIG.rexaEdge.tagline)), /* @__PURE__ */ React.createElement("p", { className: "rexa-about-text" }, ABOUT_CONFIG.rexaEdge.description)), /* @__PURE__ */ React.createElement("div", { className: "rexa-card", "data-testid": "about-company-card" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-card-header" }, /* @__PURE__ */ React.createElement("div", { className: "rexa-card-title-wrap" }, /* @__PURE__ */ React.createElement(Server, { size: 16, color: "var(--sap-primary, #0070f2)" }), /* @__PURE__ */ React.createElement("h2", { className: "rexa-card-title" }, "About Next IT Point"))), /* @__PURE__ */ React.createElement("h3", { className: "rexa-company-name" }, ABOUT_CONFIG.company.name), /* @__PURE__ */ React.createElement("p", { className: "rexa-company-sub" }, ABOUT_CONFIG.company.productLine), /* @__PURE__ */ React.createElement(
    "a",
    {
      href: ABOUT_CONFIG.company.websiteUrl,
      target: "_blank",
      rel: "noopener noreferrer",
      className: "rexa-external-link",
      "data-testid": "company-website-link",
      title: "Visit Next IT Point website (opens in new tab)"
    },
    /* @__PURE__ */ React.createElement("span", null, ABOUT_CONFIG.company.websiteLabel),
    /* @__PURE__ */ React.createElement(ExternalLink, { size: 13 })
  )))), /* @__PURE__ */ React.createElement("footer", { className: "rexa-welcome-footer", "data-testid": "welcome-footer" }, ABOUT_CONFIG.footer.text(currentYear)));
}
export {
  WelcomeView as default
};
