import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  ROUTES,
  ROUTE_IDS,
  normalizePath,
  resolveLegacyRedirect,
  getRouteByPath,
  getRouteById,
  routeTo,
  isInternalPath
} from '../config/routes';
import { toast } from './ToastContext';

const RouterContext = createContext(null);

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return ctx;
}

export function RouterProvider({ initialPath, children }) {
  const getInitialLocation = () => {
    if (initialPath) {
      return { pathname: initialPath, search: '', hash: '' };
    }
    if (typeof window === 'undefined') {
      return { pathname: '/home', search: '', hash: '' };
    }
    return {
      pathname: window.location.pathname || '/home',
      search: window.location.search || '',
      hash: window.location.hash || ''
    };
  };

  const [location, setLocation] = useState(getInitialLocation);

  const normalizedPath = useMemo(() => {
    return normalizePath(location.pathname);
  }, [location.pathname]);

  const queryParams = useMemo(() => {
    if (typeof window === 'undefined') return {};
    const params = new URLSearchParams(location.search);
    const obj = {};
    for (const [k, v] of params.entries()) {
      obj[k] = v;
    }
    return obj;
  }, [location.search]);

  // Navigate helper
  const navigate = useCallback((target, options = {}) => {
    if (typeof window === 'undefined') return;

    const { replace = false, query = null } = options;
    let targetPath = '';

    if (typeof target === 'string') {
      if (getRouteById(target)) {
        targetPath = routeTo(target, query || {});
      } else {
        targetPath = target;
        if (query && Object.keys(query).length > 0) {
          const sp = new URLSearchParams(query);
          targetPath = `${targetPath.split('?')[0]}?${sp.toString()}`;
        }
      }
    } else {
      targetPath = '/home';
    }

    // Check if target is a legacy redirect
    const parsedPathOnly = normalizePath(targetPath.split('?')[0]);
    const legacyRedirect = resolveLegacyRedirect(parsedPathOnly);
    if (legacyRedirect) {
      const rest = targetPath.includes('?') ? `?${targetPath.split('?')[1]}` : '';
      targetPath = `${legacyRedirect}${rest}`;
    }

    // Clear toasts on navigation
    try {
      toast.clearOnNavigation();
    } catch (_) {}

    const currentFull = `${window.location.pathname}${window.location.search}`;
    if (currentFull !== targetPath) {
      if (replace) {
        window.history.replaceState({ path: targetPath }, '', targetPath);
      } else {
        window.history.pushState({ path: targetPath }, '', targetPath);
      }
    }

    setLocation({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash
    });

    // Reset scroll position to top
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const mainEl = document.querySelector('.sap-assistant-layout') || document.querySelector('main');
    if (mainEl) { mainEl.scrollTop = 0; }

    // Focus management for accessibility
    setTimeout(() => {
      const heading = document.querySelector('h1, h2, [role="heading"], main');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }, 50);
  }, []);

  // Listen to popstate (browser back/forward buttons)
  useEffect(() => {
    const handlePopState = () => {
      const currentNorm = normalizePath(window.location.pathname);
      const redirect = resolveLegacyRedirect(currentNorm);
      if (redirect) {
        window.history.replaceState({ path: redirect }, '', redirect);
      }

      try {
        toast.clearOnNavigation();
      } catch (_) {}

      setLocation({
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash
      });

      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      const mainEl = document.querySelector('.sap-assistant-layout') || document.querySelector('main');
      if (mainEl) { mainEl.scrollTop = 0; }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Check initial legacy redirect on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const initialNorm = normalizePath(window.location.pathname);
    const redirect = resolveLegacyRedirect(initialNorm);
    if (redirect) {
      window.history.replaceState({ path: redirect }, '', redirect);
      setLocation({
        pathname: redirect,
        search: window.location.search,
        hash: window.location.hash
      });
    }
  }, []);

  const matchedRoute = useMemo(() => {
    return getRouteByPath(normalizedPath) || ROUTES[ROUTE_IDS.NOT_FOUND];
  }, [normalizedPath]);

  // Keep document.title synchronized with current route
  useEffect(() => {
    if (typeof document !== 'undefined' && matchedRoute?.title) {
      document.title = matchedRoute.title;
    }
  }, [matchedRoute]);

  const value = useMemo(() => ({
    pathname: normalizedPath,
    rawPathname: location.pathname,
    search: location.search,
    hash: location.hash,
    queryParams,
    route: matchedRoute,
    routeId: matchedRoute?.id || ROUTE_IDS.NOT_FOUND,
    navigate,
    routeTo
  }), [normalizedPath, location.pathname, location.search, location.hash, queryParams, matchedRoute, navigate]);

  return (
    <RouterContext.Provider value={value}>
      {children}
    </RouterContext.Provider>
  );
}

/**
 * Accessible Link component rendering a native <a href="...">
 * Preserves middle-click and right-click "Open in new tab", while intercepting
 * normal left-clicks to perform client-side route transitions without reloads.
 */
export function Link({
  to,
  replace = false,
  query = null,
  children,
  className = '',
  style = {},
  onClick,
  target,
  rel,
  title,
  ariaLabel,
  ...rest
}) {
  const { navigate } = useRouter();

  const href = useMemo(() => {
    if (typeof to === 'string') {
      if (getRouteById(to)) {
        return routeTo(to, query || {});
      }
      if (query && Object.keys(query).length > 0) {
        const sp = new URLSearchParams(query);
        return `${to.split('?')[0]}?${sp.toString()}`;
      }
      return to;
    }
    return '/home';
  }, [to, query]);

  const handleClick = (e) => {
    if (onClick) {
      onClick(e);
    }

    if (
      !e.defaultPrevented &&
      e.button === 0 && // Left click only
      !target && // Not opening in target="_blank"
      !e.metaKey &&
      !e.ctrlKey &&
      !e.shiftKey &&
      !e.altKey
    ) {
      e.preventDefault();
      navigate(to, { replace, query });
    }
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      className={className}
      style={style}
      target={target}
      rel={rel}
      title={title}
      aria-label={ariaLabel}
      {...rest}
    >
      {children}
    </a>
  );
}
