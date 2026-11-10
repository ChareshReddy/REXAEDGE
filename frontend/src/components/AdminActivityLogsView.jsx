import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Search,
  RotateCcw,
  Download,
  Copy,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Calendar,
  Server,
  User,
  Activity,
  Layers,
  ArrowUpDown,
  RefreshCw,
  Clock,
  Shield,
  Code
} from 'lucide-react';
import Tooltip from './Tooltip';
import Notification from './Notification';
import { useToast } from '../context/ToastContext';
import { SearchInput } from './ui/search-input';
import { FormSection } from './ui/form-layout';
import { getAuditLogs, getErrorLogs, getLogDetail, exportLogsCsv, getAvailableServers } from '../services/api';
import { useRouter } from '../context/RouterContext';
import { ROUTE_IDS } from '../config/routes';
import { formatEnvironment } from '../utils/textFormatters';

/**
 * Formats ISO date string to DD Mon YYYY, HH:mm:ss in viewer's local time zone.
 * Consistent 24-hour format matching /^\d{2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}:\d{2}$/
 */
export function formatAuditTimestamp(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString);
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${day} ${month} ${year}, ${hours}:${minutes}:${seconds}`;
  } catch (_) {
    return String(isoString);
  }
}

const formatDateTime = formatAuditTimestamp;

/**
 * Helper to download Blob as a file with given name.
 */
function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 200);
}

/**
 * Returns preset date ISO strings based on range string.
 */
function getDateRangeValues(preset) {
  const now = new Date();
  if (preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    return { startDate: start.toISOString(), endDate: now.toISOString() };
  }
  if (preset === 'yesterday') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  if (preset === '7d') {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { startDate: start.toISOString(), endDate: now.toISOString() };
  }
  if (preset === '30d') {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { startDate: start.toISOString(), endDate: now.toISOString() };
  }
  return { startDate: '', endDate: '' };
}

/**
 * Returns local day start at 00:00:00.000 converted to ISO string.
 */
export function getLocalDayStartIso(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return '';
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Returns local day end inclusive to 23:59:59.999 converted to ISO string.
 */
export function getLocalDayEndIso(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return '';
  const d = new Date(year, month - 1, day, 23, 59, 59, 999);
  return d.toISOString();
}

export default function AdminActivityLogsView({
  availableServers = [], refreshTrigger = 0, initialSubTab = 'audit' }) {
  const toast = useToast();
  let routerContext = null;
  try {
    routerContext = useRouter();
  } catch (_) {}

  const [localActiveSubTab, setLocalActiveSubTab] = useState(initialSubTab);
  const activeSubTab = routerContext?.route?.adminSubTab || localActiveSubTab;

  // Server metadata resolution (supports both prop and lazy-loading)
  const [internalServers, setInternalServers] = useState([]);

  useEffect(() => {
    if (availableServers && availableServers.length > 0) return;
    getAvailableServers()
      .then((srvs) => {
        if (Array.isArray(srvs) && srvs.length > 0) {
          setInternalServers(srvs);
        }
      })
      .catch(() => {});
  }, [availableServers]);

  const activeServerList = useMemo(() => {
    return availableServers && availableServers.length > 0 ? availableServers : internalServers;
  }, [availableServers, internalServers]);

  const formatServerDisplay = useCallback((logItem) => {
    const storedName = logItem?.server_name || logItem?.server_id;
    if (!storedName) {
      return { text: '-', name: '-', type: null, hasServer: false };
    }
    const matched = activeServerList.find(
      (s) =>
        (logItem?.server_id && s.id === logItem.server_id) ||
        (logItem?.server_name && (s.name === logItem.server_name || s.system_name === logItem.server_name))
    );
    const rawEnv = matched?.environment || logItem?.server_environment || logItem?.environment;
    if (rawEnv) {
      const formattedType = formatEnvironment(rawEnv);
      const displayName = logItem?.server_name || matched?.name || storedName;
      return {
        text: `${displayName} (${formattedType})`,
        name: displayName,
        type: formattedType,
        hasServer: true
      };
    }
    return {
      text: storedName,
      name: storedName,
      type: null,
      hasServer: true
    };
  }, [activeServerList]);

  // Filter States
  const [datePreset, setDatePreset] = useState('today'); // 'today' | 'yesterday' | '7d' | '30d' | 'custom' | 'all'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [userEmailFilter, setUserEmailFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [serverFilter, setServerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [httpStatusFilter, setHttpStatusFilter] = useState('');

  // Validate custom date range: end date must not be before start date
  const customDateError = useMemo(() => {
    if (datePreset === 'custom' && customStartDate && customEndDate) {
      if (customEndDate < customStartDate) {
        return 'End date cannot be before start date';
      }
    }
    return '';
  }, [datePreset, customStartDate, customEndDate]);

  // Pagination States
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  // Data & Request States
  const [allLogs, setAllLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isNotConfigured, setIsNotConfigured] = useState(false);

  // Sliced / displayed logs: if the API returned all records without server slicing, slice client-side
  const logs = useMemo(() => {
    if (allLogs.length > pageSize) {
      const startIndex = (page - 1) * pageSize;
      return allLogs.slice(startIndex, startIndex + pageSize);
    }
    return allLogs;
  }, [allLogs, page, pageSize]);

  // Detail Drawer State
  const [selectedLog, setSelectedLog] = useState(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  // Copy helper with feedback
  const handleCopyText = (key, text) => {
    if (!text || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(String(text)).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    }).catch(() => {});
  };

  // Build query params based on current filter states
  const activeParams = useMemo(() => {
    const params = {
      page,
      pageSize,
      limit: pageSize
    };

    if (datePreset === 'custom') {
      if (customStartDate && customEndDate && !customDateError) {
        params.startDate = getLocalDayStartIso(customStartDate);
        params.endDate = getLocalDayEndIso(customEndDate);
      }
    } else if (datePreset !== 'all') {
      const { startDate, endDate } = getDateRangeValues(datePreset);
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
    }

    if (userEmailFilter.trim()) params.userEmail = userEmailFilter.trim();
    if (serverFilter) params.serverId = serverFilter;

    if (activeSubTab === 'audit') {
      if (actionFilter) params.action = actionFilter;
      if (statusFilter) params.status = statusFilter;
    } else {
      if (sourceFilter) params.source = sourceFilter;
      if (httpStatusFilter) params.httpStatus = httpStatusFilter;
    }

    return params;
  }, [
    activeSubTab,
    page,
    pageSize,
    datePreset,
    customStartDate,
    customEndDate,
    customDateError,
    userEmailFilter,
    actionFilter,
    sourceFilter,
    serverFilter,
    statusFilter,
    httpStatusFilter
  ]);

  // Load logs
  const loadLogs = useCallback(async () => {
    if (datePreset === 'custom') {
      if (customDateError) return;
      if (!customStartDate || !customEndDate) return;
    }

    setIsLoading(true);
    setErrorMsg('');
    try {
      let res;
      if (activeSubTab === 'audit') {
        res = await getAuditLogs(activeParams);
      } else {
        res = await getErrorLogs(activeParams);
      }

      if (res?.notConfigured) {
        setIsNotConfigured(true);
        setAllLogs([]);
        setTotalCount(0);
      } else {
        setIsNotConfigured(false);
        const incomingData = Array.isArray(res) ? res : (res?.data || []);
        const incomingTotal = res?.count ?? res?.total ?? (typeof res?.totalCount === 'number' ? res.totalCount : incomingData.length);
        setAllLogs(incomingData);
        setTotalCount(incomingTotal);
      }
    } catch (err) {
      console.error('[AdminActivityLogsView] Failed to load logs:', err);
      setErrorMsg(err.response?.data?.error || err.message || 'Failed to retrieve logs');
    } finally {
      setIsLoading(false);
    }
  }, [activeSubTab, activeParams, datePreset, customStartDate, customEndDate, customDateError]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      loadLogs();
    }
  }, [refreshTrigger, loadLogs]);

  // Reset page to 1 when filters or sub-tab change
  const handleSubTabChange = (newSubTab) => {
    if (newSubTab !== activeSubTab) {
      setLocalActiveSubTab(newSubTab);
      if (routerContext?.navigate) {
        if (newSubTab === 'audit') {
          routerContext.navigate(ROUTE_IDS.ADMIN_LOGS_AUDIT);
        } else if (newSubTab === 'errors') {
          routerContext.navigate(ROUTE_IDS.ADMIN_LOGS_ERRORS);
        }
      }
      setPage(1);
      setSelectedLog(null);
    }
  };

  const handleResetFilters = () => {
    setDatePreset('today');
    setCustomStartDate('');
    setCustomEndDate('');
    setUserEmailFilter('');
    setActionFilter('');
    setSourceFilter('');
    setServerFilter('');
    setStatusFilter('');
    setHttpStatusFilter('');
    setSearchQuery('');
    setPage(1);
  };

  // CSV Export handler
  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const exportParams = { ...activeParams };
      delete exportParams.page;
      delete exportParams.limit;
      const blob = await exportLogsCsv(activeSubTab, exportParams);
      const todayStr = new Date().toISOString().slice(0, 10);
      const filename = `${activeSubTab}-logs-${todayStr}.csv`;
      downloadBlob(blob, filename);
    } catch (err) {
      console.error('[AdminActivityLogsView] Export failed:', err);
      toast.error('CSV Export failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsExporting(false);
    }
  };

  // Open detail drawer for a log entry
  const handleOpenDetail = async (logItem) => {
    setSelectedLog(logItem);
    setIsDetailLoading(true);
    try {
      const detailRes = await getLogDetail(activeSubTab, logItem.id);
      if (detailRes?.data) {
        setSelectedLog(detailRes.data);
      }
    } catch (err) {
      console.warn('[AdminActivityLogsView] Detail fetch failed (using row item):', err.message);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="sap-activity-logs-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Sub-tab Navigation & Actions Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          paddingBottom: 8,
          borderBottom: '1px solid var(--color-border, #e2e8f0)'
        }}
      >
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => handleSubTabChange('audit')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 2px 8px',
              border: 'none',
              borderBottom: activeSubTab === 'audit' ? '2px solid #02579A' : '2px solid transparent',
              borderRadius: 0,
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: 'transparent',
              color: activeSubTab === 'audit' ? '#02579A' : '#64748b',
              cursor: 'pointer'
            }}
          >
            <Activity size={15} />
            <span>Audit Logs</span>
          </button>

          <button
            type="button"
            onClick={() => handleSubTabChange('errors')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 2px 8px',
              border: 'none',
              borderBottom: activeSubTab === 'errors' ? '2px solid #02579A' : '2px solid transparent',
              borderRadius: 0,
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: 'transparent',
              color: activeSubTab === 'errors' ? '#02579A' : '#64748b',
              cursor: 'pointer'
            }}
          >
            <AlertTriangle size={15} />
            <span>Error Logs</span>
          </button>
        </div>

        {/* Top-Right Export CSV Only (Single Page-Level Refresh Button is Preserved) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isExporting || isNotConfigured || totalCount === 0}
            className="sap-btn sap-btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 32,
              padding: '0 14px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 6,
              border: 'none',
              backgroundColor: 'var(--sap-btn-primary-bg, #02579A)',
              color: '#ffffff',
              cursor: (isExporting || isNotConfigured || totalCount === 0) ? 'not-allowed' : 'pointer',
              opacity: (isExporting || isNotConfigured || totalCount === 0) ? 0.6 : 1
            }}
          >
            <Download size={14} />
            <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>
        </div>
      </div>

      {/* Inline Error Notice */}
      {errorMsg && (
        <Notification
          placement="inline"
          type="error"
          message={errorMsg}
          onClose={() => setErrorMsg('')}
          style={{ marginBottom: 12 }}
        />
      )}

      {/* Unconfigured / Missing Database Schema Notice */}
      {isNotConfigured && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            backgroundColor: 'var(--color-amber-50, #fffbeb)',
            border: '1px solid var(--color-amber-300, #fcd34d)',
            borderRadius: 8,
            padding: '16px 20px',
            color: 'var(--color-amber-900, #78350f)'
          }}
        >
          <AlertTriangle size={22} style={{ flexShrink: 0, marginTop: 2, color: 'var(--color-amber-700, #b45309)' }} />
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 14 }}>
              Logs are not set up yet
            </div>
            <div>
              Run the database migration in{' '}
              <code style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
                supabase/migrations/20261030_audit_and_error_logs.sql
              </code>{' '}
              against your database to enable persistent logging. In the meantime, logs are silently captured in local fallback files.
            </div>
            <button
              type="button"
              onClick={loadLogs}
              style={{
                marginTop: 10,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                backgroundColor: '#ffffff',
                border: '1px solid var(--color-amber-300, #fcd34d)',
                color: 'var(--color-amber-900, #78350f)',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={12} />
              <span>Retry Connection</span>
            </button>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="sap-logs-filter-bar rx-card" style={{ padding: "var(--space-20) var(--space-24)", marginBottom: "var(--space-16)", backgroundColor: "var(--color-surface, #FFFFFF)", border: "1px solid var(--color-border, #D9E2EC)", borderRadius: "var(--radius-lg, 12px)" }}>
        {/* Date Range Preset */}
        <div className="sap-logs-filter-item">
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted, #64748b)', marginBottom: 4, lineHeight: '14px' }}>
            Date Range
          </label>
          <select
            value={datePreset}
            onChange={(e) => {
              setDatePreset(e.target.value);
              setPage(1);
            }}
            className="rx-select" style={{ width: '100%', height: 'var(--size-form-input-height, 40px)', boxSizing: 'border-box' }}
          >
            <option value="today">Today</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="custom">Custom Date Range</option>
            <option value="all">All Time</option>
          </select>
        </div>

        {/* Custom Start & End Date if datePreset === 'custom' */}
        {datePreset === 'custom' && (
          <>
            <div className="sap-logs-filter-item">
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted, #64748b)', marginBottom: 4, lineHeight: '14px' }}>
                Start Date
              </label>
              <input
                type="datetime-local"
                value={customStartDate}
                onChange={(e) => { setCustomStartDate(e.target.value); setPage(1); }}
                className="rx-input" style={{ width: '100%', height: 'var(--size-form-input-height, 40px)', boxSizing: 'border-box' }}
              />
            </div>
            <div className="sap-logs-filter-item">
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted, #64748b)', marginBottom: 4, lineHeight: '14px' }}>
                End Date
              </label>
              <input
                type="datetime-local"
                value={customEndDate}
                onChange={(e) => { setCustomEndDate(e.target.value); setPage(1); }}
                className="rx-input" style={{ width: '100%', height: 'var(--size-form-input-height, 40px)', boxSizing: 'border-box' }}
              />
            </div>
          </>
        )}

        {/* User Email Filter */}
        <div className="sap-logs-filter-item">
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted, #64748b)', marginBottom: 4, lineHeight: '14px' }}>
            User Email
          </label>
          <input
            type="text"
            placeholder="Filter by user..."
            value={userEmailFilter}
            onChange={(e) => { setUserEmailFilter(e.target.value); setPage(1); }}
            className="rx-input" style={{ width: '100%', height: 'var(--size-form-input-height, 40px)', boxSizing: 'border-box' }}
          />
        </div>

        {/* Action (Audit) or Source (Errors) */}
        {activeSubTab === 'audit' ? (
          <div className="sap-logs-filter-item">
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted, #64748b)', marginBottom: 4, lineHeight: '14px' }}>
              Action Type
            </label>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="rx-select" style={{ width: '100%', height: 'var(--size-form-input-height, 40px)', boxSizing: 'border-box' }}
            >
              <option value="">All Actions</option>
              <option value="auth.login">auth.login</option>
              <option value="auth.login_failed">auth.login_failed</option>
              <option value="auth.logout">auth.logout</option>
              <option value="bom.display">bom.display</option>
              <option value="bom.validate">bom.validate</option>
              <option value="bom.create">bom.create</option>
              <option value="bom.copy">bom.copy</option>
              <option value="bom.delete">bom.delete</option>
              <option value="bom.create_bulk">bom.create_bulk</option>
              <option value="bom.copy_bulk">bom.copy_bulk</option>
              <option value="admin.user_create">admin.user_create</option>
              <option value="admin.user_delete">admin.user_delete</option>
              <option value="admin.server_create">admin.server_create</option>
              <option value="admin.server_update">admin.server_update</option>
              <option value="admin.server_delete">admin.server_delete</option>
              <option value="admin.permission_grant">admin.permission_grant</option>
              <option value="admin.permission_revoke">admin.permission_revoke</option>
            </select>
          </div>
        ) : (
          <div className="sap-logs-filter-item">
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted, #64748b)', marginBottom: 4, lineHeight: '14px' }}>
              Source
            </label>
            <select
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
              className="rx-select" style={{ width: '100%', height: 'var(--size-form-input-height, 40px)', boxSizing: 'border-box' }}
            >
              <option value="">All Sources</option>
              <option value="backend">backend</option>
              <option value="sap">sap</option>
              <option value="frontend">frontend</option>
            </select>
          </div>
        )}

        {/* Server Filter */}
        <div className="sap-logs-filter-item">
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted, #64748b)', marginBottom: 4, lineHeight: '14px' }}>
            SAP Server
          </label>
          <select
            value={serverFilter}
            onChange={(e) => { setServerFilter(e.target.value); setPage(1); }}
            className="rx-select" style={{ width: '100%', height: 'var(--size-form-input-height, 40px)', boxSizing: 'border-box' }}
          >
            <option value="">All Servers</option>
            {activeServerList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.system_name || s.id}{s.environment ? ` (${formatEnvironment(s.environment)})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Status (Audit) or HTTP Status (Errors) */}
        {activeSubTab === 'audit' ? (
          <div className="sap-logs-filter-item">
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted, #64748b)', marginBottom: 4, lineHeight: '14px' }}>
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="rx-select" style={{ width: '100%', height: 'var(--size-form-input-height, 40px)', boxSizing: 'border-box' }}
            >
              <option value="">All Status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        ) : (
          <div className="sap-logs-filter-item">
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted, #64748b)', marginBottom: 4, lineHeight: '14px' }}>
              HTTP Status
            </label>
            <select
              value={httpStatusFilter}
              onChange={(e) => { setHttpStatusFilter(e.target.value); setPage(1); }}
              className="rx-select" style={{ width: '100%', height: 'var(--size-form-input-height, 40px)', boxSizing: 'border-box' }}
            >
              <option value="">All Status Codes</option>
              <option value="400">400 (Bad Request)</option>
              <option value="401">401 (Unauthorized)</option>
              <option value="403">403 (Forbidden)</option>
              <option value="404">404 (Not Found)</option>
              <option value="500">500 (Server Error)</option>
              <option value="502">502 (Bad Gateway)</option>
              <option value="503">503 (Unavailable)</option>
            </select>
          </div>
        )}

        {/* Text Search */}
        <div className="sap-logs-filter-search">
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted, #64748b)', marginBottom: 4, lineHeight: '14px' }}>
            Search Text
          </label>
          <SearchInput
            placeholder={activeSubTab === 'audit' ? 'Search target, message...' : 'Search ref, message, route...'}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            onClear={() => { setSearchQuery(''); setPage(1); }}
          />
        </div>

        {/* Reset Button */}
        <div className="sap-logs-filter-reset" style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button
            type="button"
            onClick={handleResetFilters}
            style={{
              height: 32,
              padding: '0 12px',
              borderRadius: 6,
              border: '1px solid #d1d5db',
              backgroundColor: '#ffffff',
              color: 'var(--color-text-muted, #64748b)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              boxSizing: 'border-box'
            }}
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Main Table Card with Full-Bleed Tinted Header Band */}
      <FormSection
        title={activeSubTab === 'audit' ? 'Audit Trail Records' : 'Error Log Records'}
        description={activeSubTab === 'audit' ? 'Chronological record of user actions and system events' : 'Detailed system exception and failure log'}
        badge={<span className="sap-badge sap-badge-neutral">{totalCount} records</span>}
        className="w-full mt-4"
      >
        <div
          className="sap-admin-table-scroll sap-table-container"
        tabIndex={0}
        role="region"
        aria-label={`${activeSubTab === 'audit' ? 'Audit' : 'Error'} Logs Table`}
        style={{
          width: '100%',
          overflowX: 'hidden',
          overflowY: 'auto',
          height: 'calc(100vh - 350px)',
          minHeight: 400,
          backgroundColor: '#ffffff',
          borderRadius: 8,
          border: '1px solid var(--color-border, #e2e8f0)',
          position: 'relative',
          boxSizing: 'border-box'
        }}
      >
        {activeSubTab === 'audit' ? (
          /* ============================================================
             AUDIT LOGS TABLE
             ============================================================ */
          <table
            className="sap-table rx-audit-table"
            style={{
              width: '100%',
              tableLayout: 'fixed',
              borderCollapse: 'collapse',
              boxSizing: 'border-box'
            }}
          >
            <colgroup>
              <col style={{ width: '18%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <thead style={{ position: 'sticky', top: 0, zIndex: 3, borderBottom: '1px solid var(--color-border)' }}>
              <tr>
                <th className="rx-audit-th-highlight" style={{ padding: '0 10px', height: 38 }}>
                  <Tooltip text="Timestamp when action occurred">
                    <span style={{ fontSize: 12 }}>Timestamp</span>
                  </Tooltip>
                </th>
                <th className="rx-audit-th-highlight" style={{ padding: '0 10px', height: 38 }}>
                  <Tooltip text="User email who performed action">
                    <span style={{ fontSize: 12 }}>User</span>
                  </Tooltip>
                </th>
                <th className="rx-audit-th-highlight rx-audit-th-divider" style={{ padding: '0 10px', height: 38 }}>
                  <Tooltip text="Action type in feature.action format">
                    <span style={{ fontSize: 12 }}>Action</span>
                  </Tooltip>
                </th>
                <th className="rx-audit-th-standard" style={{ padding: '0 10px', height: 38 }}>
                  <Tooltip text="Target SAP Server">
                    <span style={{ fontSize: 12 }}>Server</span>
                  </Tooltip>
                </th>
                <th className="rx-audit-th-standard" style={{ padding: '0 10px', height: 38 }}>
                  <Tooltip text="Execution outcome">
                    <span style={{ fontSize: 12 }}>Status</span>
                  </Tooltip>
                </th>
                <th className="rx-audit-th-standard" style={{ padding: '0 10px', height: 38 }}>
                  <Tooltip text="Duration of request in milliseconds">
                    <span style={{ fontSize: 12 }}>Duration</span>
                  </Tooltip>
                </th>
                <th className="rx-audit-th-standard" style={{ padding: '0 10px', height: 38, textAlign: 'center' }}>
                  <Tooltip text="Inspect full details">
                    <span style={{ fontSize: 12 }}>Actions</span>
                  </Tooltip>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px 16px', color: '#64748b' }}>
                    <RefreshCw size={20} className="sap-spin" style={{ margin: '0 auto 8px' }} />
                    <div style={{ fontSize: 13 }}>Loading audit logs...</div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px 16px', color: '#64748b' }}>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                      No audit logs found matching your filters.
                    </div>
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#05396B',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontSize: 12
                      }}
                    >
                      Clear filters
                    </button>
                  </td>
                </tr>
              ) : (
                logs.map((item, idx) => {
                  const formattedTime = formatAuditTimestamp(item.created_at);
                  const userDisplay = item.user_email || item.user_id || 'SYSTEM';
                  const actionDisplay = item.action || '—';
                  const serverInfo = formatServerDisplay(item);
                  const statusDisplay = item.status === 'success' ? 'Success' : (item.status || 'Failed');
                  const durationDisplay = item.duration_ms !== null && item.duration_ms !== undefined ? `${item.duration_ms} ms` : '—';
                  const isSelected = selectedLog?.id === item.id;

                  return (
                    <tr
                      key={item.id}
                      className={isSelected ? 'selected' : ''}
                      style={{
                        backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb',
                        borderBottom: '1px solid #f1f5f9',
                        fontSize: 12,
                        height: 38
                      }}
                    >
                      <td
                        className="rx-audit-col-highlight"
                        style={{
                          backgroundColor: 'var(--color-blue-50, #EEF4F9)',
                          padding: '0 8px',
                          whiteSpace: 'nowrap',
                          color: 'var(--color-text-main, #0f172a)',
                          verticalAlign: 'middle',
                          fontFamily: 'var(--font-sans, sans-serif)',
                          fontVariantNumeric: 'tabular-nums'
                        }}
                        title={formattedTime}
                      >
                        {formattedTime}
                      </td>
                      <td
                        className="rx-audit-col-highlight"
                        style={{
                          backgroundColor: 'var(--color-blue-50, #EEF4F9)',
                          padding: '0 8px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: 'var(--color-text-main, #0f172a)',
                          verticalAlign: 'middle',
                          fontFamily: 'var(--font-sans, sans-serif)',
                          fontVariantNumeric: 'tabular-nums'
                        }}
                        title={userDisplay}
                      >
                        {userDisplay}
                      </td>
                      <td
                        className="rx-audit-col-highlight rx-audit-col-divider"
                        style={{
                          backgroundColor: 'var(--color-blue-50, #EEF4F9)',
                          padding: '0 8px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          verticalAlign: 'middle'
                        }}
                        title={actionDisplay}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            maxWidth: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            verticalAlign: 'middle',
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            backgroundColor: '#ffffff',
                            color: 'var(--color-blue-700, #034375)',
                            border: '1px solid var(--color-border-input, #C7D4E1)',
                            fontFamily: 'var(--sap-font-mono, monospace)'
                          }}
                        >
                          {actionDisplay}
                        </span>
                      </td>
                      <td
                        className="rx-audit-col-standard"
                        style={{
                          padding: '0 8px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          verticalAlign: 'middle'
                        }}
                        title={serverInfo.text}
                      >
                        {serverInfo.type ? (
                          <span style={{ whiteSpace: 'nowrap' }}>
                            <span style={{ fontWeight: 400, color: 'var(--color-text-main, #0f172a)' }}>{serverInfo.name}</span>{' '}
                            <span className="rx-audit-server-badge">({serverInfo.type})</span>
                          </span>
                        ) : (
                          <span style={{ fontWeight: 400, color: serverInfo.hasServer ? 'var(--color-text-main, #0f172a)' : 'var(--color-text-muted, #64748b)', whiteSpace: 'nowrap' }}>
                            {serverInfo.text}
                          </span>
                        )}
                      </td>
                      <td
                        className="rx-audit-col-standard"
                        style={{ padding: '0 8px', whiteSpace: 'nowrap', verticalAlign: 'middle' }}
                        title={statusDisplay}
                      >
                        {item.status === 'success' ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              backgroundColor: '#f0fdf4',
                              color: '#15803d',
                              border: '1px solid #bbf7d0'
                            }}
                          >
                            <CheckCircle2 size={12} color="#15803d" />
                            <span>Success</span>
                          </span>
                        ) : (
                          <span
                            className="sap-badge-failed"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600
                            }}
                          >
                            <AlertCircle size={12} />
                            <span>Failed</span>
                          </span>
                        )}
                      </td>
                      <td
                        className="rx-audit-col-standard"
                        style={{ padding: '0 8px', whiteSpace: 'nowrap', color: '#64748b', verticalAlign: 'middle' }}
                        title={durationDisplay}
                      >
                        {durationDisplay}
                      </td>
                      <td className="rx-audit-col-standard" style={{ padding: '0 8px', textAlign: 'center', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(item)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 8px',
                            borderRadius: 4,
                            border: '1px solid #d1d5db',
                            backgroundColor: '#ffffff',
                            cursor: 'pointer',
                            fontSize: 11,
                            color: '#02579A',
                            margin: '0 auto'
                          }}
                          title="View log details"
                          aria-label="View log details"
                        >
                          <Eye size={12} />
                          <span>Detail</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        ) : (
          /* ============================================================
             ERROR LOGS TABLE
             ============================================================ */
          <table
            className="sap-table sap-admin-compact-table"
            style={{
              width: '100%',
              tableLayout: 'fixed',
              borderCollapse: 'collapse',
              boxSizing: 'border-box'
            }}
          >
            <colgroup>
              <col style={{ width: '14%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <thead style={{ position: 'sticky', top: 0, zIndex: 3, backgroundColor: 'var(--color-blue-200)', borderBottom: '1px solid var(--color-border)' }}>
              <tr>
                <th style={{ padding: '0 8px', height: 36 }}>
                  <Tooltip text="Timestamp when error occurred">
                    <span style={{ fontWeight: 600, fontSize: 12 }}>Timestamp</span>
                  </Tooltip>
                </th>
                <th style={{ padding: '0 8px', height: 36 }}>
                  <Tooltip text="8-character unique Error Reference">
                    <span style={{ fontWeight: 600, fontSize: 12 }}>Error Ref</span>
                  </Tooltip>
                </th>
                <th style={{ padding: '0 8px', height: 36 }}>
                  <Tooltip text="Source of error: backend, sap, or frontend">
                    <span style={{ fontWeight: 600, fontSize: 12 }}>Source</span>
                  </Tooltip>
                </th>
                <th style={{ padding: '0 8px', height: 36 }}>
                  <Tooltip text="Route or API endpoint">
                    <span style={{ fontWeight: 600, fontSize: 12 }}>Route / Endpoint</span>
                  </Tooltip>
                </th>
                <th style={{ padding: '0 8px', height: 36 }}>
                  <Tooltip text="HTTP status code">
                    <span style={{ fontWeight: 600, fontSize: 12 }}>Status</span>
                  </Tooltip>
                </th>
                <th style={{ padding: '0 8px', height: 36 }}>
                  <Tooltip text="Error message">
                    <span style={{ fontWeight: 600, fontSize: 12 }}>Message</span>
                  </Tooltip>
                </th>
                <th style={{ padding: '0 8px', height: 36 }}>
                  <Tooltip text="User associated with error">
                    <span style={{ fontWeight: 600, fontSize: 12 }}>User</span>
                  </Tooltip>
                </th>
                <th style={{ padding: '0 8px', height: 36, textAlign: 'center' }}>
                  <Tooltip text="Inspect full error details and stack trace">
                    <span style={{ fontWeight: 600, fontSize: 12 }}>Actions</span>
                  </Tooltip>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px 16px', color: '#64748b' }}>
                    <RefreshCw size={20} className="sap-spin" style={{ margin: '0 auto 8px' }} />
                    <div style={{ fontSize: 13 }}>Loading error logs...</div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px 16px', color: '#64748b' }}>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                      No error logs found matching your filters.
                    </div>
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#05396B',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontSize: 12
                      }}
                    >
                      Clear filters
                    </button>
                  </td>
                </tr>
              ) : (
                logs.map((item, idx) => {
                  const formattedTime = formatDateTime(item.created_at);
                  const errorRefDisplay = item.error_ref || '—';
                  const sourceDisplay = item.source || 'backend';
                  const routeDisplay = item.route || '—';
                  const statusDisplay = String(item.http_status || '500');
                  const messageDisplay = item.message || '—';
                  const userDisplay = item.user_email || '—';

                  return (
                    <tr
                      key={item.id}
                      style={{
                        backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb',
                        borderBottom: '1px solid #f1f5f9',
                        fontSize: 12
                      }}
                    >
                      <td
                        style={{ padding: '0 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#334155' }}
                        title={formattedTime}
                      >
                        {formattedTime}
                      </td>
                      <td
                        style={{ padding: '0 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        title={errorRefDisplay}
                      >
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
                          <code style={{ fontWeight: 'var(--font-weight-code, 500)', color: '#0f172a', fontFamily: 'var(--sap-font-mono, monospace)' }}>
                            {errorRefDisplay}
                          </code>
                          {item.error_ref && (
                            <button
                              type="button"
                              onClick={() => handleCopyText(`ref_${item.id}`, item.error_ref)}
                              style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', color: '#64748b', flexShrink: 0 }}
                              title="Copy error ref"
                              aria-label="Copy error ref"
                            >
                              {copiedKey === `ref_${item.id}` ? <Check size={11} color="#15803d" /> : <Copy size={11} />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td
                        style={{ padding: '0 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        title={sourceDisplay}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            backgroundColor: item.source === 'sap' ? '#f5f3ff' : item.source === 'frontend' ? '#e0f2fe' : '#f8fafc',
                            color: item.source === 'sap' ? '#6b21a8' : item.source === 'frontend' ? '#0369a1' : '#334155',
                            border: '1px solid #e2e8f0'
                          }}
                        >
                          {sourceDisplay}
                        </span>
                      </td>
                      <td
                        style={{ padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={routeDisplay}
                      >
                        <span style={{ fontFamily: 'var(--sap-font-mono, monospace)', fontSize: 11 }}>{routeDisplay}</span>
                      </td>
                      <td
                        style={{ padding: '0 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        title={statusDisplay}
                      >
                        <span
                          className="sap-badge-failed"
                          style={{
                            display: 'inline-block',
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600
                          }}
                        >
                          {statusDisplay}
                        </span>
                      </td>
                      <td
                        style={{ padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={messageDisplay}
                      >
                        <span style={{ color: '#1e293b' }}>{messageDisplay}</span>
                      </td>
                      <td
                        style={{ padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={userDisplay}
                      >
                        {userDisplay}
                      </td>
                      <td style={{ padding: '0 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(item)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 8px',
                            borderRadius: 4,
                            border: '1px solid #d1d5db',
                            backgroundColor: '#ffffff',
                            cursor: 'pointer',
                            fontSize: 11,
                            color: 'var(--color-amber-800, #b45309)',
                            margin: '0 auto'
                          }}
                          title="View full error details"
                          aria-label="View full error details"
                        >
                          <Eye size={12} />
                          <span>Detail</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          padding: '8px 4px',
          fontSize: 13,
          color: '#64748b'
        }}
      >
        <div>
          {totalCount === 0 ? (
            <span>No entries</span>
          ) : (
            <>
              Showing <strong>{(page - 1) * pageSize + 1}</strong> to{' '}
              <strong>{Math.min(page * pageSize, totalCount)}</strong> of <strong>{totalCount}</strong> entries
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              style={{ height: 28, fontSize: 12, borderRadius: 4, border: '1px solid #d1d5db', padding: '0 4px', backgroundColor: '#ffffff' }}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 4,
                border: '1px solid #d1d5db',
                backgroundColor: '#ffffff',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                opacity: page <= 1 ? 0.5 : 1
              }}
              title="Previous page"
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>

            <span>
              Page <strong>{totalCount === 0 ? 1 : page}</strong> of <strong>{totalPages}</strong>
            </span>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 4,
                border: '1px solid #d1d5db',
                backgroundColor: '#ffffff',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                opacity: page >= totalPages ? 0.5 : 1
              }}
              title="Next page"
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
      </FormSection>

      {/* ============================================================
          RIGHT-SIDE DETAIL DRAWER
          ============================================================ */}
      {selectedLog && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            justifyContent: 'flex-end',
            animation: 'fadeIn 0.2s ease-out'
          }}
          onClick={() => setSelectedLog(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 580,
              height: '100%',
              backgroundColor: '#ffffff',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              animation: 'slideInRight 0.25s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--color-border, #e2e8f0)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#f8fafc'
              }}
            >
              <div>
                <div style={{ fontSize: 11, fontWeight: 700,  color: '#64748b' }}>
                  {activeSubTab === 'audit' ? 'Audit Log Entry' : 'Error Log Entry'}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginTop: 2 }}>
                  {activeSubTab === 'audit' ? (
                    selectedLog.action
                  ) : (
                    <span>Error Ref: <code style={{ fontFamily: 'monospace' }}>{selectedLog.error_ref}</code></span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 6,
                  cursor: 'pointer',
                  borderRadius: 6,
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Close drawer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {/* Status and Timestamp Summary Banner */}
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  backgroundColor: selectedLog.status === 'failed' || activeSubTab === 'errors'
                    ? 'var(--color-amber-50, #fffbeb)'
                    : '#f0fdf4',
                  border: `1px solid ${selectedLog.status === 'failed' || activeSubTab === 'errors' ? 'var(--color-amber-200, #fde68a)' : '#bbf7d0'}`,
                  marginBottom: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12
                }}
              >
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Status</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: selectedLog.status === 'failed' || activeSubTab === 'errors' ? '#92400e' : '#15803d' }}>
                    {selectedLog.status ? selectedLog.status.toUpperCase() : (selectedLog.http_status ? `HTTP ${selectedLog.http_status}` : 'LOGGED')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Logged At</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#1e293b' }}>
                    {formatAuditTimestamp(selectedLog.created_at)}
                  </div>
                </div>
              </div>

              {/* Key/Value Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div style={{ padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: 6, border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>User Email</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#1e293b', wordBreak: 'break-all' }}>
                    {selectedLog.user_email || '—'}
                  </div>
                </div>

                <div style={{ padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: 6, border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Server</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#1e293b' }}>
                    {formatServerDisplay(selectedLog).text}
                  </div>
                </div>

                <div style={{ padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: 6, border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Action</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-blue-700, #034375)', fontFamily: 'var(--sap-font-mono, monospace)', wordBreak: 'break-all' }}>
                    {selectedLog.action || '—'}
                  </div>
                </div>

                <div style={{ padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: 6, border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Target</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#1e293b', wordBreak: 'break-all' }}>
                    {selectedLog.target || '—'}
                  </div>
                </div>

                <div style={{ padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: 6, border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Request ID</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <code style={{ fontSize: 11, fontFamily: 'monospace', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {selectedLog.request_id || '—'}
                    </code>
                    {selectedLog.request_id && (
                      <button
                        type="button"
                        onClick={() => handleCopyText('reqId', selectedLog.request_id)}
                        style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: '#64748b' }}
                        title="Copy Request ID"
                      >
                        {copiedKey === 'reqId' ? <Check size={11} color="#15803d" /> : <Copy size={11} />}
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: 6, border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>IP Address</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#1e293b' }}>{selectedLog.ip || '—'}</span>
                    {selectedLog.ip && (
                      <button
                        type="button"
                        onClick={() => handleCopyText('ip', selectedLog.ip)}
                        style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: '#64748b' }}
                        title="Copy IP"
                      >
                        {copiedKey === 'ip' ? <Check size={11} color="#15803d" /> : <Copy size={11} />}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Summary / Friendly Message */}
              {selectedLog.message && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                    Message
                  </div>
                  <div
                    style={{
                      padding: '10px 14px',
                      backgroundColor: '#f8fafc',
                      borderRadius: 6,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                      color: '#1e293b',
                      lineHeight: 1.5,
                      wordBreak: 'break-word'
                    }}
                  >
                    {selectedLog.message}
                  </div>
                </div>
              )}

              {/* Collapsed Technical details (Admin only) */}
              {(selectedLog.sap_message || selectedLog.stack || (selectedLog.details && Object.keys(selectedLog.details).length > 0)) && (
                <details
                  style={{
                    marginBottom: 20,
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    overflow: 'hidden'
                  }}
                >
                  <summary
                    style={{
                      padding: '10px 14px',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#475569',
                      cursor: 'pointer',
                      backgroundColor: '#f8fafc',
                      userSelect: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid #e2e8f0'
                    }}
                  >
                    <span>Technical details (Admin only)</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>Click to view raw details</span>
                  </summary>

                  <div style={{ padding: '14px' }}>
                    {/* SAP Message if present */}
                    {selectedLog.sap_message && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                          Raw SAP System Message
                        </div>
                        <div
                          style={{
                            padding: '10px 14px',
                            backgroundColor: 'var(--color-amber-50, #fffbeb)',
                            borderRadius: 6,
                            border: '1px solid var(--color-amber-200, #fde68a)',
                            fontSize: 12,
                            color: 'var(--color-amber-900, #78350f)',
                            lineHeight: 1.5,
                            wordBreak: 'break-word',
                            fontFamily: 'monospace'
                          }}
                        >
                          {selectedLog.sap_message}
                        </div>
                      </div>
                    )}

                    {/* Error Stack Trace */}
                    {selectedLog.stack && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Technical Stack Trace</span>
                          <button
                            type="button"
                            onClick={() => handleCopyText('stack', selectedLog.stack)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: 'none',
                              border: 'none',
                              fontSize: 11,
                              color: '#05396B',
                              cursor: 'pointer'
                            }}
                          >
                            {copiedKey === 'stack' ? <Check size={11} color="#15803d" /> : <Copy size={11} />}
                            <span>Copy Stack</span>
                          </button>
                        </div>
                        <pre
                          style={{
                            backgroundColor: '#0f172a',
                            color: '#e2e8f0',
                            borderRadius: 6,
                            padding: '12px',
                            fontSize: 11,
                            fontFamily: 'monospace',
                            maxHeight: 200,
                            overflowY: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all'
                          }}
                        >
                          {selectedLog.stack}
                        </pre>
                      </div>
                    )}

                    {/* Details JSON View */}
                    {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Sanitized Details (JSON)</span>
                          <button
                            type="button"
                            onClick={() => handleCopyText('detailsJson', JSON.stringify(selectedLog.details, null, 2))}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: 'none',
                              border: 'none',
                              fontSize: 11,
                              color: '#05396B',
                              cursor: 'pointer'
                            }}
                          >
                            {copiedKey === 'detailsJson' ? <Check size={11} color="#15803d" /> : <Copy size={11} />}
                            <span>Copy JSON</span>
                          </button>
                        </div>
                        <pre
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            borderRadius: 6,
                            border: '1px solid #e2e8f0',
                            padding: '12px',
                            fontSize: 11,
                            fontFamily: 'monospace',
                            maxHeight: 220,
                            overflowY: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all'
                          }}
                        >
                          {JSON.stringify(selectedLog.details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>

            {/* Drawer Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--color-border, #e2e8f0)',
                backgroundColor: '#f8fafc',
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center'
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="sap-btn sap-btn-secondary"
                style={{
                  height: 32,
                  padding: '0 16px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  color: '#334155',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
