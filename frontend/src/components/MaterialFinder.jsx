import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search,
  Layers,
  Factory,
  X,
  Copy,
  Check,
  Eye,
  PlusSquare,
  Loader2,
  Filter,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  RotateCcw,
  CornerDownRight
} from 'lucide-react';
import {
  searchMaterials,
  getMaterialDetail,
  getPlants,
  getPrefetchedPlants,
  getActivePlantPrefetchPromise
} from '../services/api';
import { useFinder } from '../context/FinderContext';

/**
 * Safely accesses localStorage without throwing SecurityError in restrictive sandboxes
 */
function safeStorageGet(key) {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }
  } catch (_) {}
  return null;
}

function safeStorageSet(key, value) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (_) {}
}

/**
 * Determines whether a search term qualifies for instant debounced prefix search
 * (pure digits or alphanumeric material codes with digits, e.g. 1102, 11021735, A1BH0214C).
 * Description words (e.g. BLUE, AIR FILTER, STEEL) search only on Enter or Search button.
 */
function isInstantSearchTerm(term) {
  const s = (term || '').trim();
  if (!s || s.length < 2) return false;
  if (/^\d+$/.test(s)) return true;
  if (/^[A-Za-z0-9_\-\.\/]{2,18}$/.test(s) && /\d/.test(s)) {
    return true;
  }
  return false;
}

/**
 * Highlights search matches within text
 */
function HighlightMatch({ text = '', match = '' }) {
  if (!text) return null;
  if (!match || match.trim().length < 2) return <span>{text}</span>;

  const cleanMatch = match.trim().toLowerCase();
  const lowerText = text.toLowerCase();
  const idx = lowerText.indexOf(cleanMatch);
  if (idx === -1) return <span>{text}</span>;

  const before = text.slice(0, idx);
  const matched = text.slice(idx, idx + cleanMatch.length);
  const after = text.slice(idx + cleanMatch.length);

  return (
    <span>
      {before}
      <mark
        style={{
          background: 'rgba(234, 179, 8, 0.35)',
          color: 'inherit',
          fontWeight: 700,
          borderRadius: 2,
          padding: '0 2px'
        }}
      >
        {matched}
      </mark>
      {after}
    </span>
  );
}

/**
 * Tracks the last focused input with data-finder="material" or data-finder="plant"
 */
let globalLastFinderInput = null;
let globalLastFinderType = null;
let globalLastFinderLabel = '';

if (typeof window !== 'undefined') {
  window.addEventListener(
    'focusin',
    (e) => {
      const el = e.target;
      if (el && el.tagName === 'INPUT') {
        const finderType = el.getAttribute('data-finder');
        if (finderType === 'material' || finderType === 'plant') {
          globalLastFinderInput = el;
          globalLastFinderType = finderType;
          const labelEl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
          const placeholder = el.getAttribute('placeholder') || '';
          globalLastFinderLabel =
            labelEl?.textContent?.trim() ||
            (placeholder ? `"${placeholder}"` : `${finderType} field`);
        }
      }
    },
    true
  );
}

export default function MaterialFinder(props) {
  const context = useFinder();
  const activeServer = props.activeServer || context.activeServer;
  const activeTab = props.activeTab || context.activeTab || 'launchpad';
  const onActionNavigate = props.onActionNavigate || context.onActionNavigate;

  const [activeTabType, setActiveTabType] = useState('materials'); // 'materials' | 'plants'
  const [query, setQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSlowNotice, setIsSlowNotice] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Responsive state for screen width < 900px (Requirement 5)
  const [isMobileWidth, setIsMobileWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 900 : false));
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);

  useEffect(() => {
    function handleResize() {
      const small = window.innerWidth < 900;
      setIsMobileWidth(small);
      if (!small) setIsMobileExpanded(false);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Search Results
  const [materialResults, setMaterialResults] = useState([]);
  const [plantList, setPlantList] = useState([]);
  const [plantLoading, setPlantLoading] = useState(false);

  // Accordion & Detail State
  const [expandedMatnr, setExpandedMatnr] = useState(null);
  const [detailsCache, setDetailsCache] = useState({});
  const [loadingDetails, setLoadingDetails] = useState({});
  const [showAllPlantsFor, setShowAllPlantsFor] = useState({});

  // Compact Filters inside Dropdown
  const [filterPlant, setFilterPlant] = useState('');
  const [filterMtart, setFilterMtart] = useState('');
  const [filterCheckBom, setFilterCheckBom] = useState(false);

  const activeFiltersCount = (filterPlant ? 1 : 0) + (filterMtart ? 1 : 0) + (filterCheckBom ? 1 : 0);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Server metadata
  const serverId = activeServer?.id || activeServer?.ashost || 'default';
  const serverName = activeServer?.name || activeServer?.ashost || 'SAP System';
  const isDeleteScreen = activeTab === 'delete_bom';

  // Refs
  const searchInputRef = useRef(null);
  const containerRef = useRef(null);
  const abortControllerRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const slowTimerRef = useRef(null);

  // Recent items per server
  const recentStorageKey = `sap_finder_recent_${serverId}`;
  const [recentItems, setRecentItems] = useState(() => {
    return safeStorageGet(recentStorageKey) || [];
  });

  const saveRecentItem = useCallback(
    (item) => {
      setRecentItems((prev) => {
        const filtered = prev.filter((x) => x.id !== item.id || x.type !== item.type);
        const updated = [item, ...filtered].slice(0, 10);
        safeStorageSet(recentStorageKey, updated);
        return updated;
      });
    },
    [recentStorageKey]
  );

  // Load plants list on server change
  const loadPlantsList = useCallback(async () => {
    setPlantLoading(true);
    try {
      const prefetched = getPrefetchedPlants(serverId);
      if (prefetched && prefetched.list && prefetched.list.length > 0) {
        setPlantList(prefetched.list);
        setPlantLoading(false);
        return;
      }
      const inFlight = getActivePlantPrefetchPromise(serverId);
      if (inFlight) {
        const list = await inFlight;
        setPlantList(list);
        setPlantLoading(false);
        return;
      }
      const res = await getPlants();
      setPlantList(res?.data || []);
    } catch (err) {
      console.warn('[MaterialFinder] Failed to load plants list:', err.message);
    } finally {
      setPlantLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    loadPlantsList();
  }, [loadPlantsList]);

  // Listen to SAP server change event
  useEffect(() => {
    function handleServerChanged() {
      setQuery('');
      setMaterialResults([]);
      setDetailsCache({});
      setExpandedMatnr(null);
      setErrorMessage('');
      setIsDropdownOpen(false);
      setIsLoading(false);
      setIsSlowNotice(false);
      loadPlantsList();
    }
    window.addEventListener('sap-server-changed', handleServerChanged);
    return () => window.removeEventListener('sap-server-changed', handleServerChanged);
  }, [loadPlantsList]);

  // Global hotkeys: '/' or Ctrl/Cmd+K to focus, Escape to close
  useEffect(() => {
    function handleGlobalKeys(e) {
      if (e.key === 'Escape') {
        setIsDropdownOpen(false);
        setIsMobileExpanded(false);
        return;
      }

      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      const isInputFocused = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';

      if (e.key === '/' && !isInputFocused) {
        e.preventDefault();
        setIsMobileExpanded(true);
        setTimeout(() => {
          searchInputRef.current?.focus();
          setIsDropdownOpen(true);
        }, 50);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsMobileExpanded(true);
        setTimeout(() => {
          searchInputRef.current?.focus();
          setIsDropdownOpen(true);
        }, 50);
      }
    }

    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
        if (isMobileWidth) setIsMobileExpanded(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobileWidth]);

  // Toast feedback
  const showToast = useCallback((msg, type = 'success') => {
    setToastMessage({ msg, type });
    setTimeout(() => setToastMessage(null), 3200);
  }, []);

  const handleCopy = useCallback(
    (text, id) => {
      if (!text) return;
      navigator.clipboard.writeText(text).then(
        () => {
          setCopiedId(id);
          showToast(`Copied "${text}" to clipboard`);
          setTimeout(() => setCopiedId(null), 2000);
        },
        () => showToast('Failed to copy', 'error')
      );
    },
    [showToast]
  );

  // Inserts value into the last focused form input with data-finder
  const handleInsertIntoField = useCallback(
    (value, expectedType = 'material') => {
      if (!value) return;

      const target = globalLastFinderInput;
      if (!target || !document.body.contains(target)) {
        showToast(`Please click a ${expectedType} input field first`, 'error');
        return;
      }

      const finderType = target.getAttribute('data-finder');
      if (finderType && finderType !== expectedType) {
        showToast(`Active field is for ${finderType}, not ${expectedType}`, 'error');
        return;
      }

      try {
        const proto = window.HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(target, value);
        } else {
          target.value = value;
        }

        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));

        const label =
          globalLastFinderLabel ||
          target.placeholder ||
          target.getAttribute('name') ||
          `${expectedType} field`;
        showToast(`Inserted ${value} into ${label}`, 'success');

        saveRecentItem({
          id: value,
          type: expectedType,
          name: value,
          timestamp: Date.now()
        });
      } catch (err) {
        console.error('Failed to insert value into field:', err);
        showToast('Could not fill field', 'error');
      }
    },
    [showToast, saveRecentItem]
  );

  // Cancel in-flight search request
  const handleCancelSearch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
    }
    setIsLoading(false);
    setIsSlowNotice(false);
    showToast('Search cancelled', 'info');
  }, [showToast]);

  // Execute Material Search
  const performMaterialSearch = useCallback(
    async (
      searchTerm,
      plantOverride = filterPlant,
      mtartOverride = filterMtart,
      checkBomOverride = filterCheckBom,
      searchMode = undefined
    ) => {
      const clean = (searchTerm || '').trim();
      if (clean.length < 2) {
        setMaterialResults([]);
        setIsLoading(false);
        setErrorMessage('');
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setIsSlowNotice(false);
      setErrorMessage('');

      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      slowTimerRef.current = setTimeout(() => {
        setIsSlowNotice(true);
      }, 5000);

      try {
        const res = await searchMaterials(
          {
            query: clean,
            plant: plantOverride || undefined,
            mtart: mtartOverride || undefined,
            checkBom: checkBomOverride,
            mode: searchMode,
            limit: 50
          },
          { signal: controller.signal }
        );

        const rows = res?.data || res || [];
        setMaterialResults(Array.isArray(rows) ? rows : []);
        setIsDropdownOpen(true);

        if (clean.length >= 2) {
          saveRecentItem({
            id: clean,
            type: 'search_term',
            name: clean,
            timestamp: Date.now()
          });
        }
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED' || err.name === 'AbortError') {
          return;
        }
        console.warn('[MaterialFinder] Search error:', err.message);
        setErrorMessage(err.response?.data?.error || err.message || 'Material search failed');
      } finally {
        setIsLoading(false);
        setIsSlowNotice(false);
        if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      }
    },
    [filterPlant, filterMtart, filterCheckBom, saveRecentItem]
  );

  // Trigger search on Enter or Search button click
  const handleTriggerSearch = useCallback(
    (forcedQuery) => {
      const q = (forcedQuery !== undefined ? forcedQuery : query).trim();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (activeTabType === 'materials') {
        if (q.length >= 2) {
          const mode = isInstantSearchTerm(q) ? 'prefix' : 'description';
          performMaterialSearch(q, filterPlant, filterMtart, filterCheckBom, mode);
          setIsDropdownOpen(true);
        }
      } else {
        setIsDropdownOpen(true);
      }
    },
    [query, activeTabType, filterPlant, filterMtart, filterCheckBom, performMaterialSearch]
  );

  // Toggle inline accordion row & load detail isolated by matnr
  const handleToggleRow = useCallback(
    async (matnr) => {
      if (!matnr) return;

      if (expandedMatnr === matnr) {
        setExpandedMatnr(null);
        return;
      }

      setExpandedMatnr(matnr);

      if (detailsCache[matnr]) {
        return;
      }

      setLoadingDetails((prev) => ({ ...prev, [matnr]: true }));
      try {
        const res = await getMaterialDetail(matnr, { plant: filterPlant || undefined });
        const data = res?.data || res || null;
        if (data && data.matnr) {
          setDetailsCache((prev) => ({ ...prev, [matnr]: data }));
          saveRecentItem({
            id: data.matnr,
            type: 'material',
            name: data.matnr,
            desc: data.maktx,
            timestamp: Date.now()
          });
        }
      } catch (err) {
        console.warn(`[MaterialFinder] Detail fetch error for ${matnr}:`, err.message);
      } finally {
        setLoadingDetails((prev) => ({ ...prev, [matnr]: false }));
      }
    },
    [expandedMatnr, detailsCache, filterPlant, saveRecentItem]
  );

  // Input change handler
  const handleInputChange = useCallback(
    (e) => {
      const val = e.target.value;
      setQuery(val);
      setErrorMessage('');
      setHighlightedIndex(-1);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      const trimmed = val.trim();

      if (activeTabType === 'materials') {
        if (trimmed.length < 2) {
          setMaterialResults([]);
          setIsLoading(false);
          setIsSlowNotice(false);
          if (trimmed.length === 0) {
            setIsDropdownOpen(false);
          }
          return;
        }

        if (isInstantSearchTerm(trimmed)) {
          debounceTimerRef.current = setTimeout(() => {
            performMaterialSearch(trimmed, filterPlant, filterMtart, filterCheckBom, 'prefix');
            setIsDropdownOpen(true);
          }, 280);
        } else {
          setIsDropdownOpen(true);
        }
      } else {
        setIsDropdownOpen(true);
      }
    },
    [activeTabType, filterPlant, filterMtart, filterCheckBom, performMaterialSearch]
  );

  // Keyboard navigation inside dropdown
  const handleKeyDown = useCallback(
    (e) => {
      if (!isDropdownOpen) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          setIsDropdownOpen(true);
        }
        return;
      }

      const currentCount =
        activeTabType === 'materials' ? Math.min(materialResults.length, 20) : Math.min(plantList.length, 20);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1 < currentCount ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : currentCount - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0) {
          if (activeTabType === 'materials' && materialResults[highlightedIndex]) {
            handleInsertIntoField(materialResults[highlightedIndex].matnr, 'material');
            setIsDropdownOpen(false);
          } else if (activeTabType === 'plants' && plantList[highlightedIndex]) {
            handleInsertIntoField(plantList[highlightedIndex].werks, 'plant');
            setIsDropdownOpen(false);
          }
        } else {
          handleTriggerSearch();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsDropdownOpen(false);
      }
    },
    [
      isDropdownOpen,
      activeTabType,
      materialResults,
      plantList,
      highlightedIndex,
      handleInsertIntoField,
      handleTriggerSearch
    ]
  );

  const handleFilterPlantChange = (val) => {
    setFilterPlant(val);
    if (query.trim().length >= 2) {
      performMaterialSearch(query, val, filterMtart, filterCheckBom);
    }
  };

  const handleFilterMtartChange = (val) => {
    setFilterMtart(val);
    if (query.trim().length >= 2) {
      performMaterialSearch(query, filterPlant, val, filterCheckBom);
    }
  };

  const handleFilterCheckBomChange = (checked) => {
    setFilterCheckBom(checked);
    if (query.trim().length >= 2) {
      performMaterialSearch(query, filterPlant, filterMtart, checked);
    }
  };

  const handleResetFilters = () => {
    setFilterPlant('');
    setFilterMtart('');
    setFilterCheckBom(false);
    if (query.trim().length >= 2) {
      performMaterialSearch(query, '', '', false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setMaterialResults([]);
    setIsDropdownOpen(false);
    setErrorMessage('');
    setIsSlowNotice(false);
    if (searchInputRef.current) searchInputRef.current.focus();
  };

  // Filtered Plants List
  const filteredPlants = useMemo(() => {
    if (!plantList || plantList.length === 0) return [];
    const q = query.trim().toUpperCase();
    if (!q) return plantList;
    return plantList.filter((p) => {
      const code = (p.werks || '').toUpperCase();
      const name = (p.name1 || '').toUpperCase();
      const city = (p.ort01 || '').toUpperCase();
      return code.includes(q) || name.includes(q) || city.includes(q);
    });
  }, [plantList, query]);

  // Displayed subsets (Cap at 20 results per Requirement 2 & 4)
  const displayedMaterials = useMemo(() => materialResults.slice(0, 20), [materialResults]);
  const displayedPlants = useMemo(() => filteredPlants.slice(0, 20), [filteredPlants]);

  const hasMoreMaterials = materialResults.length > 20;
  const hasMorePlants = filteredPlants.length > 20;

  // Below 900px collapsed trigger button (Requirement 5)
  if (isMobileWidth && !isMobileExpanded && !isDropdownOpen) {
    return (
      <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          type="button"
          onClick={() => {
            setIsMobileExpanded(true);
            setIsDropdownOpen(true);
            setTimeout(() => searchInputRef.current?.focus(), 50);
          }}
          title="Find material or plant… (/)"
          aria-label="Find material or plant"
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            border: '1px solid var(--sap-border-input, #cbd5e1)',
            background: 'var(--sap-card-bg, #ffffff)',
            color: 'var(--sap-text, #1e293b)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'border-color 0.15s, background 0.15s'
          }}
        >
          <Search size={15} style={{ color: 'var(--sap-primary, #0a6ed1)' }} />
        </button>
      </div>
    );
  }

  const isExpandedWidth = isFocused || isDropdownOpen || Boolean(query);

  return (
    <div
      ref={containerRef}
      className={`sap-material-finder-box ${props.className || ''}`}
      style={{
        position: 'relative',
        width: isMobileWidth
          ? 'min(100%, 90vw)'
          : isExpandedWidth
            ? 'clamp(280px, 40vw, 520px)'
            : 'clamp(240px, 25vw, 360px)',
        minWidth: isMobileWidth ? 200 : 280,
        maxWidth: isMobileWidth ? '100%' : '40vw',
        zIndex: 40,
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        ...props.style
      }}
    >
      {/* 1. Search input container right-aligned on page title row (Requirement 1 & 2) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#ffffff',
          border: '1px solid var(--sap-border-input, #cbd5e1)',
          borderRadius: 6,
          padding: '0 8px',
          height: 32,
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
          transition: 'border-color 0.15s, box-shadow 0.15s'
        }}
      >
        {isLoading ? (
          <Loader2 size={14} className="sap-spin" style={{ color: 'var(--sap-primary, #0a6ed1)', marginRight: 6, flexShrink: 0 }} />
        ) : (
          <Search size={14} style={{ color: 'var(--sap-text-muted, #64748b)', marginRight: 6, flexShrink: 0 }} />
        )}

        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsFocused(true);
            if (query.trim().length >= 2 || activeTabType === 'plants' || recentItems.length > 0) {
              setIsDropdownOpen(true);
            }
          }}
          onBlur={() => {
            setIsFocused(false);
          }}
          placeholder="Find material or plant…  ( / )"
          style={{
            border: 'none',
            outline: 'none',
            width: '100%',
            fontSize: 12,
            color: 'var(--sap-text, #1e293b)',
            background: 'transparent'
          }}
        />

        {/* Cancel Button (Visible while search is running) */}
        {isLoading && (
          <button
            type="button"
            onClick={handleCancelSearch}
            title="Cancel in-flight SAP query"
            style={{
              border: '1px solid #fecaca',
              background: '#fef2f2',
              color: '#dc2626',
              padding: '1px 6px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              marginRight: 4,
              whiteSpace: 'nowrap'
            }}
          >
            Cancel
          </button>
        )}

        {/* Search Button for description mode */}
        {!isLoading && query.trim().length >= 2 && (
          <button
            type="button"
            onClick={() => handleTriggerSearch()}
            title="Search (Enter)"
            style={{
              border: 'none',
              background: 'var(--sap-primary, #0a6ed1)',
              color: '#ffffff',
              padding: '2px 7px',
              borderRadius: 4,
              fontSize: 10.5,
              fontWeight: 600,
              cursor: 'pointer',
              marginRight: 3,
              whiteSpace: 'nowrap'
            }}
          >
            Search
          </button>
        )}

        {query && (
          <button
            type="button"
            onClick={handleClear}
            title="Clear input"
            style={{
              border: 'none',
              background: 'transparent',
              padding: 2,
              cursor: 'pointer',
              color: 'var(--sap-text-muted, #94a3b8)',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* 2. Dropdown panel: exactly same width as search input, right-aligned (Requirement 1 & 5) */}
      {isDropdownOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: '100%',
            maxWidth: 'calc(100vw - 32px)',
            backgroundColor: 'var(--sap-surface-card, #ffffff)',
            border: '1px solid var(--sap-border, #cbd5e1)',
            borderRadius: 8,
            boxShadow: '0 12px 32px -4px rgba(0,0,0,0.18), 0 4px 12px -2px rgba(0,0,0,0.08)',
            maxHeight: 'min(480px, 75vh)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 500,
            overflow: 'hidden',
            boxSizing: 'border-box'
          }}
        >
          {/* Top of Dropdown: Materials/Plants Toggle & Searching: <server> (Requirement 2) */}
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--sap-surface-subtle, #f8fafc)',
              borderBottom: '1px solid var(--sap-border-subtle, #e2e8f0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexShrink: 0,
              flexWrap: 'wrap'
            }}
          >
            {/* Materials / Plants Mode Pills */}
            <div
              style={{
                display: 'inline-flex',
                background: '#e2e8f0',
                padding: 2,
                borderRadius: 5
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setActiveTabType('materials');
                  setIsDropdownOpen(true);
                  searchInputRef.current?.focus();
                }}
                style={{
                  border: 'none',
                  background: activeTabType === 'materials' ? '#ffffff' : 'transparent',
                  color: activeTabType === 'materials' ? 'var(--sap-primary, #0a6ed1)' : '#64748b',
                  fontWeight: activeTabType === 'materials' ? 700 : 500,
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  boxShadow: activeTabType === 'materials' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                }}
              >
                <Layers size={11} />
                <span>Materials</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTabType('plants');
                  setIsDropdownOpen(true);
                  searchInputRef.current?.focus();
                }}
                style={{
                  border: 'none',
                  background: activeTabType === 'plants' ? '#ffffff' : 'transparent',
                  color: activeTabType === 'plants' ? 'var(--sap-primary, #0a6ed1)' : '#64748b',
                  fontWeight: activeTabType === 'plants' ? 700 : 500,
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  boxShadow: activeTabType === 'plants' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                }}
              >
                <Factory size={11} />
                <span>Plants</span>
              </button>
            </div>

            {/* Searching: <server> Label */}
            <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>Searching:</span>
              <strong style={{ color: 'var(--sap-text, #1e293b)' }}>{serverName}</strong>
            </span>
          </div>

          {/* Searching In-Progress Indicator */}
          {isLoading && (
            <div
              style={{
                padding: '6px 12px',
                background: '#f0f9ff',
                borderBottom: '1px solid #bae6fd',
                fontSize: 11,
                color: 'var(--sap-primary, #0a6ed1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Loader2 size={12} className="sap-spin" />
                <span>Searching {serverName}...</span>
              </div>
              <button
                type="button"
                onClick={handleCancelSearch}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#dc2626',
                  cursor: 'pointer',
                  fontSize: 10.5,
                  fontWeight: 600
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Slow System Notice Banner after 5s */}
          {isSlowNotice && isLoading && (
            <div
              style={{
                padding: '4px 12px',
                background: '#fef3c7',
                borderBottom: '1px solid #fde68a',
                fontSize: 10.5,
                color: '#b45309',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertTriangle size={11} />
                <span>{serverName} is responding slowly, please wait…</span>
              </div>
            </div>
          )}

          {/* Error State with Retry Button */}
          {errorMessage && (
            <div
              style={{
                padding: '8px 12px',
                background: '#fef2f2',
                borderBottom: '1px solid #fecaca',
                fontSize: 11,
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => handleTriggerSearch()}
                style={{
                  border: '1px solid #fecaca',
                  background: '#ffffff',
                  color: '#dc2626',
                  fontWeight: 600,
                  borderRadius: 3,
                  padding: '2px 7px',
                  fontSize: 10.5,
                  cursor: 'pointer',
                  flexShrink: 0,
                  marginLeft: 8
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Small Filter Row above results (Materials Tab only) (Requirement 3: fits in one row) */}
          {activeTabType === 'materials' && (
            <div
              style={{
                padding: '6px 10px',
                background: 'var(--sap-surface-subtle, #f8fafc)',
                borderBottom: '1px solid var(--sap-border-subtle, #e2e8f0)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'nowrap',
                flexShrink: 0,
                overflow: 'hidden'
              }}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#475569', fontSize: 10.5, fontWeight: 600, flexShrink: 0 }}>
                <Filter size={11} />
                <span>Filters:</span>
              </div>

              {/* Plant Select */}
              <select
                value={filterPlant}
                onChange={(e) => handleFilterPlantChange(e.target.value)}
                title="Filter by Plant"
                style={{
                  fontSize: 10.5,
                  padding: '2px 4px',
                  border: '1px solid #cbd5e1',
                  borderRadius: 4,
                  background: '#ffffff',
                  color: '#1e293b',
                  flex: '1 1 120px',
                  minWidth: 80,
                  maxWidth: 145,
                  height: 24,
                  outline: 'none',
                  textOverflow: 'ellipsis'
                }}
              >
                <option value="">All Plants</option>
                {plantList.map((p) => (
                  <option key={p.werks} value={p.werks}>
                    {p.werks} · {p.name1 || p.ort01}
                  </option>
                ))}
              </select>

              {/* Material Type Select */}
              <select
                value={filterMtart}
                onChange={(e) => handleFilterMtartChange(e.target.value)}
                title="Filter by Material Type"
                style={{
                  fontSize: 10.5,
                  padding: '2px 4px',
                  border: '1px solid #cbd5e1',
                  borderRadius: 4,
                  background: '#ffffff',
                  color: '#1e293b',
                  flex: '1 1 105px',
                  minWidth: 75,
                  maxWidth: 125,
                  height: 24,
                  outline: 'none',
                  textOverflow: 'ellipsis'
                }}
              >
                <option value="">All Types</option>
                <option value="FERT">FERT (Finished)</option>
                <option value="HALB">HALB (Semifinished)</option>
                <option value="ROH">ROH (Raw)</option>
                <option value="ERSA">ERSA (Spares)</option>
                <option value="SERV">SERV (Service)</option>
              </select>

              {/* Has BOM Checkbox */}
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 10.5,
                  color: '#334155',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  height: 24
                }}
              >
                <input
                  type="checkbox"
                  checked={filterCheckBom}
                  onChange={(e) => handleFilterCheckBomChange(e.target.checked)}
                  style={{ margin: 0 }}
                />
                <span>Has BOM</span>
              </label>

              {/* Reset Filters */}
              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  title="Reset filters"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--sap-primary, #0a6ed1)',
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '0 2px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 2,
                    flexShrink: 0
                  }}
                >
                  <RotateCcw size={10} />
                  <span>Reset</span>
                </button>
              )}
            </div>
          )}

          {/* Scrollable Results Body */}
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 360 }}>
            {/* MATERIALS TAB CONTENT */}
            {activeTabType === 'materials' && (
              <>
                {/* Empty State / Prompt */}
                {!isLoading && materialResults.length === 0 && (
                  <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                    {query.trim().length >= 2 ? (
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
                          No materials found matching "{query}"
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', maxWidth: 360, margin: '0 auto 10px' }}>
                          Try searching by description words, checking the spelling, or clearing active plant/type filters.
                        </div>
                        {activeFiltersCount > 0 && (
                          <button
                            type="button"
                            onClick={handleResetFilters}
                            style={{
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              padding: '3px 10px',
                              borderRadius: 4,
                              fontSize: 11,
                              color: 'var(--sap-primary, #0a6ed1)',
                              cursor: 'pointer',
                              fontWeight: 600
                            }}
                          >
                            Clear Filters ({activeFiltersCount})
                          </button>
                        )}
                      </div>
                    ) : recentItems.length > 0 ? (
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={11} />
                          <span>Recent Materials & Searches</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {recentItems.map((item) => (
                            <button
                              key={`${item.type}_${item.id}`}
                              type="button"
                              onClick={() => {
                                if (item.type === 'material') {
                                  handleInsertIntoField(item.id, 'material');
                                  setIsDropdownOpen(false);
                                } else {
                                  setQuery(item.name);
                                  performMaterialSearch(item.name);
                                }
                              }}
                              style={{
                                border: '1px solid #e2e8f0',
                                background: '#f8fafc',
                                padding: '3px 8px',
                                borderRadius: 4,
                                fontSize: 11,
                                cursor: 'pointer',
                                color: '#334155'
                              }}
                            >
                              {item.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11.5, color: '#64748b' }}>
                        Type a material number or description to search SAP. Press Enter to search.
                      </div>
                    )}
                  </div>
                )}

                {/* Material Results List (Up to 20 items per Requirement 2) */}
                {displayedMaterials.map((mat, idx) => {
                  const isHighlighted = idx === highlightedIndex;
                  const isExpanded = expandedMatnr === mat.matnr;
                  const detail = detailsCache[mat.matnr] || mat;
                  const isRowLoading = loadingDetails[mat.matnr];

                  const hasDeletedBadge = Boolean(mat.lvorm);
                  const statusBadgeText = hasDeletedBadge
                    ? 'Deleted'
                    : (mat.statusText || mat.mmsta || mat.mstae || '');

                  return (
                    <div
                      key={mat.matnr}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        backgroundColor: isExpanded
                          ? 'rgba(10, 110, 209, 0.04)'
                          : isHighlighted
                          ? '#f8fafc'
                          : '#ffffff'
                      }}
                    >
                      {/* Main Result Row Header */}
                      <div
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        style={{
                          padding: '7px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10
                        }}
                      >
                        <div
                          style={{ minWidth: 0, flex: 1, cursor: 'pointer' }}
                          onClick={() => {
                            handleInsertIntoField(mat.matnr, 'material');
                            setIsDropdownOpen(false);
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap', overflow: 'hidden' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: 'var(--sap-primary, #0a6ed1)', flexShrink: 0 }}>
                              <HighlightMatch text={mat.matnr} match={query} />
                            </span>

                            {mat.mtart && (
                              <span style={{ fontSize: 9.5, background: '#f1f5f9', color: '#475569', padding: '1px 5px', borderRadius: 3, fontWeight: 600, flexShrink: 0 }}>
                                {mat.mtart}
                              </span>
                            )}

                            {/* ONE status badge */}
                            {hasDeletedBadge ? (
                              <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', background: '#fee2e2', color: '#dc2626', borderRadius: 3, flexShrink: 0 }}>
                                Deleted
                              </span>
                            ) : statusBadgeText ? (
                              <span style={{ fontSize: 9.5, fontWeight: 600, padding: '1px 5px', background: '#fef3c7', color: '#b45309', borderRadius: 3, flexShrink: 0, maxWidth: 85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {statusBadgeText}
                              </span>
                            ) : null}

                            {/* BOM badge */}
                            {mat.hasBom && (
                              <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', background: '#ecfdf5', color: '#047857', borderRadius: 3, flexShrink: 0 }}>
                                BOM
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: 11, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                            <HighlightMatch text={mat.maktx || '(No Description)'} match={query} />
                          </div>
                        </div>

                        {/* Right Action Buttons: Insert + More Toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                          <button
                            type="button"
                            title="Insert into active form field"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInsertIntoField(mat.matnr, 'material');
                              setIsDropdownOpen(false);
                            }}
                            style={{
                              border: '1px solid var(--sap-primary, #0a6ed1)',
                              background: 'var(--sap-primary, #0a6ed1)',
                              color: '#ffffff',
                              fontSize: 10.5,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 4,
                              cursor: 'pointer'
                            }}
                          >
                            Insert
                          </button>

                          <button
                            type="button"
                            title={isExpanded ? 'Collapse details' : 'Show details and actions'}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleRow(mat.matnr);
                            }}
                            style={{
                              border: '1px solid #cbd5e1',
                              background: isExpanded ? '#f1f5f9' : '#ffffff',
                              color: '#475569',
                              fontSize: 10,
                              fontWeight: 600,
                              padding: '2px 5px',
                              borderRadius: 4,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 2
                            }}
                          >
                            <span>More</span>
                            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          </button>
                        </div>
                      </div>

                      {/* Inline Expanded Detail Section (Requirement 3) */}
                      {isExpanded && (
                        <div
                          style={{
                            padding: '8px 12px 10px',
                            background: '#f8fafc',
                            borderTop: '1px solid #e2e8f0',
                            fontSize: 11
                          }}
                        >
                          {isRowLoading && !detailsCache[mat.matnr] ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', padding: '6px 0' }}>
                              <Loader2 size={13} className="sap-spin" />
                              <span>Loading master record details...</span>
                            </div>
                          ) : (
                            <>
                              {/* Metadata Chips: Group, Unit, Status Text */}
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: 8,
                                  alignItems: 'center',
                                  background: '#ffffff',
                                  padding: '5px 8px',
                                  borderRadius: 4,
                                  border: '1px solid #e2e8f0',
                                  marginBottom: 6
                                }}
                              >
                                <div>
                                  <span style={{ color: '#64748b' }}>Group:</span> <strong>{detail.matkl || '-'}</strong>
                                </div>
                                <span style={{ color: '#cbd5e1' }}>•</span>
                                <div>
                                  <span style={{ color: '#64748b' }}>Unit:</span> <strong>{detail.meins || '-'}</strong>
                                </div>
                                <span style={{ color: '#cbd5e1' }}>•</span>
                                <div>
                                  <span style={{ color: '#64748b' }}>Status:</span> <strong>{detail.statusText || 'Active'}</strong>
                                </div>
                              </div>

                              {/* Plant Chips (MARC maintained plants) */}
                              {Array.isArray(detail.plants) && detail.plants.length > 0 && (
                                <div style={{ marginBottom: 6 }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', marginBottom: 3 }}>
                                    Maintained in Plants (click to insert):
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                                    {(showAllPlantsFor[mat.matnr] ? detail.plants : detail.plants.slice(0, 6)).map((plt) => {
                                      const plantInfo = plantList.find((p) => p.werks === plt);
                                      return (
                                        <span
                                          key={plt}
                                          title={plantInfo ? `${plt} · ${plantInfo.name1} (${plantInfo.ort01}) - Click to insert` : `${plt} - Click to insert`}
                                          onClick={() => {
                                            handleInsertIntoField(plt, 'plant');
                                            setIsDropdownOpen(false);
                                          }}
                                          style={{
                                            fontSize: 10,
                                            fontFamily: 'monospace',
                                            fontWeight: 600,
                                            background: '#ffffff',
                                            border: '1px solid #cbd5e1',
                                            padding: '1px 5px',
                                            borderRadius: 3,
                                            cursor: 'pointer',
                                            color: '#1e293b'
                                          }}
                                        >
                                          {plt}
                                        </span>
                                      );
                                    })}
                                    {!showAllPlantsFor[mat.matnr] && detail.plants.length > 6 && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setShowAllPlantsFor((prev) => ({ ...prev, [mat.matnr]: true }));
                                        }}
                                        style={{
                                          fontSize: 10,
                                          color: 'var(--sap-primary, #0a6ed1)',
                                          background: 'transparent',
                                          border: 'none',
                                          cursor: 'pointer',
                                          padding: '1px 4px',
                                          fontWeight: 600
                                        }}
                                      >
                                        +{detail.plants.length - 6} more
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Action Buttons: Copy, Display BOM, Use in Create, Use as source in Copy */}
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(mat.matnr, mat.matnr)}
                                  style={{
                                    border: '1px solid #cbd5e1',
                                    background: '#ffffff',
                                    padding: '2px 7px',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontSize: 10.5,
                                    color: '#334155'
                                  }}
                                >
                                  {copiedId === mat.matnr ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                                  <span>Copy number</span>
                                </button>

                                {/* Hide navigation actions on Delete BOM screen (Requirement 3) */}
                                {!isDeleteScreen && onActionNavigate && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsDropdownOpen(false);
                                        onActionNavigate('bom_explorer', {
                                          material: mat.matnr,
                                          plant: filterPlant || detail.plants?.[0] || '1001'
                                        });
                                      }}
                                      style={{
                                        border: '1px solid #cbd5e1',
                                        background: '#ffffff',
                                        padding: '2px 7px',
                                        borderRadius: 4,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        fontSize: 10.5,
                                        color: 'var(--sap-primary, #0a6ed1)'
                                      }}
                                    >
                                      <Eye size={11} />
                                      <span>Display BOM</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsDropdownOpen(false);
                                        onActionNavigate('create_bom', {
                                          material: mat.matnr,
                                          plant: filterPlant || detail.plants?.[0] || '1001'
                                        });
                                      }}
                                      style={{
                                        border: '1px solid #cbd5e1',
                                        background: '#ffffff',
                                        padding: '2px 7px',
                                        borderRadius: 4,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        fontSize: 10.5,
                                        color: 'var(--sap-primary, #0a6ed1)'
                                      }}
                                    >
                                      <PlusSquare size={11} />
                                      <span>Use in Create</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsDropdownOpen(false);
                                        onActionNavigate('copy_bom', {
                                          material: mat.matnr,
                                          plant: filterPlant || detail.plants?.[0] || '1001'
                                        });
                                      }}
                                      style={{
                                        border: '1px solid #cbd5e1',
                                        background: '#ffffff',
                                        padding: '2px 7px',
                                        borderRadius: 4,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        fontSize: 10.5,
                                        color: 'var(--sap-primary, #0a6ed1)'
                                      }}
                                    >
                                      <CornerDownRight size={11} />
                                      <span>Use as source in Copy</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {/* PLANTS TAB CONTENT (Requirement 4) */}
            {activeTabType === 'plants' && (
              <div>
                {plantLoading && (
                  <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: 11.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Loader2 size={13} className="sap-spin" />
                    <span>Loading plants from SAP...</span>
                  </div>
                )}

                {!plantLoading && displayedPlants.length === 0 && (
                  <div style={{ padding: '20px 16px', textAlign: 'center', color: '#64748b', fontSize: 11.5 }}>
                    No plants found matching "{query}".
                  </div>
                )}

                {!plantLoading &&
                  displayedPlants.map((plt, idx) => {
                    const isHighlighted = idx === highlightedIndex;
                    return (
                      <div
                        key={plt.werks}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        onClick={() => {
                          handleInsertIntoField(plt.werks, 'plant');
                          setIsDropdownOpen(false);
                        }}
                        style={{
                          padding: '7px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          cursor: 'pointer',
                          backgroundColor: isHighlighted ? '#f1f5f9' : '#ffffff',
                          borderBottom: '1px solid #f8fafc'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <strong style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--sap-primary, #0a6ed1)' }}>
                              <HighlightMatch text={plt.werks} match={query} />
                            </strong>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>
                              <HighlightMatch text={plt.name1} match={query} />
                            </span>
                          </div>
                          {plt.ort01 && (
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                              <HighlightMatch text={plt.ort01} match={query} />
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInsertIntoField(plt.werks, 'plant');
                            setIsDropdownOpen(false);
                          }}
                          style={{
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            fontSize: 10.5,
                            fontWeight: 600,
                            padding: '2px 7px',
                            borderRadius: 4,
                            cursor: 'pointer',
                            color: '#1e293b'
                          }}
                        >
                          Insert
                        </button>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Footer: "Showing 20 of N, refine your search" (Requirement 2 & 4) */}
          {activeTabType === 'materials' && hasMoreMaterials && (
            <div
              style={{
                padding: '6px 12px',
                background: 'var(--sap-surface-subtle, #f8fafc)',
                borderTop: '1px solid var(--sap-border-subtle, #e2e8f0)',
                fontSize: 11,
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                flexShrink: 0
              }}
            >
              <span>Showing 20 of {materialResults.length}, refine your search</span>
            </div>
          )}

          {activeTabType === 'plants' && hasMorePlants && (
            <div
              style={{
                padding: '6px 12px',
                background: 'var(--sap-surface-subtle, #f8fafc)',
                borderTop: '1px solid var(--sap-border-subtle, #e2e8f0)',
                fontSize: 11,
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                flexShrink: 0
              }}
            >
              <span>Showing 20 of {filteredPlants.length}, refine your search</span>
            </div>
          )}
        </div>
      )}

      {/* Floating Feedback Toast */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            backgroundColor: toastMessage.type === 'error' ? 'var(--sap-error, #ef4444)' : 'var(--sap-text, #1e293b)',
            color: '#ffffff',
            padding: '8px 16px',
            borderRadius: 6,
            fontSize: 12,
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            animation: 'fadeInModal 0.2s ease-out'
          }}
        >
          {toastMessage.type === 'error' ? <AlertTriangle size={14} /> : <Check size={14} color="#10b981" />}
          <span>{toastMessage.msg}</span>
        </div>
      )}
    </div>
  );
}
