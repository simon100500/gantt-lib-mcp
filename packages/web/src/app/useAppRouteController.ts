import { useCallback, useEffect, useMemo, useState } from 'react';

import { buildLoginRoute, normalizePathname, removeTransientSearchParams, sanitizeNextPath, SUPPORTED_APP_PATHS } from './appRoutes.ts';
import { parseBlockIntentPath, parseProjectCreationIntentRoute, parseProjectOpenSearch, parseTemplateCreatePath } from './routeParsers.ts';
import { readPendingProjectCreationIntentId, writePendingProjectCreationIntentId } from '../features/project-generation/storage.ts';

interface RouteState {
  pathname: string;
  search: string;
}

export interface AppRouteController {
  route: RouteState;
  authModalMethod: 'otp' | 'yandex';
  isYandexCallbackRoute: boolean;
  isPurchaseRoute: boolean;
  isAccountRoute: boolean;
  isAdminRoute: boolean;
  isLoginRoute: boolean;
  templateCreateIntentId: string | null;
  consumeTemplateCreateIntent: () => void;
  projectCreationIntentId: string | null;
  consumeProjectCreationIntent: () => void;
  projectOpenIntentId: string | null;
  consumeProjectOpenIntent: () => void;
  blockIntentPublicationId: string | null;
  purchaseParams: {
    initialPlan: string | null;
    initialPeriod: string | null;
    autoCheckout: boolean;
  };
  navigate: (target: string, replace?: boolean) => void;
  resolveNextPath: () => string | null;
}

export function useAppRouteController(params: {
  isAuthenticated: boolean;
  onLoginRequired: () => void;
}): AppRouteController {
  const { isAuthenticated, onLoginRequired } = params;
  const [route, setRoute] = useState<RouteState>(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }));
  const [workspaceTemplateCreateIntentId, setWorkspaceTemplateCreateIntentId] = useState<string | null>(null);
  const [workspaceProjectCreationIntentId, setWorkspaceProjectCreationIntentId] = useState<string | null>(() => readPendingProjectCreationIntentId());
  const [workspaceProjectOpenIntentId, setWorkspaceProjectOpenIntentId] = useState<string | null>(null);

  // Route state and browser history synchronization.
  const navigate = useCallback((target: string, replace = true) => {
    const nextUrl = `${window.location.origin}${target}`;
    if (replace) {
      window.history.replaceState(window.history.state, '', nextUrl);
    } else {
      window.history.pushState(window.history.state, '', nextUrl);
    }

    setRoute({
      pathname: window.location.pathname,
      search: window.location.search,
    });
  }, []);

  useEffect(() => {
    const handleRouteChange = () => {
      setRoute({
        pathname: window.location.pathname,
        search: window.location.search,
      });
    };

    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(route.search);
    const requestedAuthMode = params.get('auth');
    if (requestedAuthMode !== 'otp' && requestedAuthMode !== 'yandex') {
      return;
    }

    if (!isAuthenticated) {
      onLoginRequired();
    }

    const sanitizedSearch = removeTransientSearchParams(route.search);
    if (sanitizedSearch === route.search) {
      return;
    }

    const nextUrl = `${window.location.origin}${route.pathname}${sanitizedSearch}`;
    window.history.replaceState(window.history.state, '', nextUrl);
    setRoute({
      pathname: route.pathname,
      search: sanitizedSearch,
    });
  }, [isAuthenticated, onLoginRequired, route.pathname, route.search]);

  const normalizedPathname = normalizePathname(route.pathname);
  const isAdminRoute = normalizedPathname === '/admin';
  const templateCreateRoute = parseTemplateCreatePath(normalizedPathname);
  const blockIntentRoute = parseBlockIntentPath(normalizedPathname);
  const projectCreationIntentRoute = parseProjectCreationIntentRoute(normalizedPathname, route.search);
  const projectOpenRoute = !isAdminRoute && normalizedPathname === '/'
    ? parseProjectOpenSearch(route.search)
    : null;
  const isLoginRoute = normalizedPathname === '/login';
  const isKnownRoute = SUPPORTED_APP_PATHS.has(normalizedPathname)
    || Boolean(templateCreateRoute)
    || Boolean(blockIntentRoute)
    || Boolean(projectCreationIntentRoute);

  // Auth redirects and route-intent handoff into the workspace shell.
  useEffect(() => {
    if (isKnownRoute) {
      return;
    }

    const nextUrl = `${window.location.origin}/${route.search}`;
    window.history.replaceState(window.history.state, '', nextUrl);
    setRoute({
      pathname: '/',
      search: route.search,
    });
  }, [isKnownRoute, route.search]);

  useEffect(() => {
    if (!isLoginRoute) {
      return;
    }

    if (isAuthenticated) {
      navigate(sanitizeNextPath(new URLSearchParams(route.search).get('next')) ?? '/');
      return;
    }

    onLoginRequired();
  }, [isAuthenticated, isLoginRoute, navigate, onLoginRequired, route.search]);

  useEffect(() => {
    const intentRoute = templateCreateRoute ?? blockIntentRoute;
    if (!intentRoute || isAuthenticated) {
      return;
    }

    navigate(buildLoginRoute(`${route.pathname}${route.search}`));
  }, [blockIntentRoute, isAuthenticated, navigate, route.pathname, route.search, templateCreateRoute]);

  useEffect(() => {
    if (!projectCreationIntentRoute) {
      return;
    }

    if (!isAuthenticated) {
      navigate(buildLoginRoute(`${route.pathname}${route.search}`));
      return;
    }

    writePendingProjectCreationIntentId(projectCreationIntentRoute.intentId);
    setWorkspaceProjectCreationIntentId(projectCreationIntentRoute.intentId);
    navigate('/');
  }, [isAuthenticated, navigate, projectCreationIntentRoute, route.pathname, route.search]);

  useEffect(() => {
    if (!projectOpenRoute) {
      return;
    }

    if (!isAuthenticated) {
      navigate(buildLoginRoute(`${route.pathname}${route.search}`));
      return;
    }

    setWorkspaceProjectOpenIntentId(projectOpenRoute.projectId);
    navigate('/');
  }, [isAuthenticated, navigate, projectOpenRoute, route.pathname, route.search]);

  useEffect(() => {
    if (!isAuthenticated || !templateCreateRoute) {
      return;
    }

    setWorkspaceTemplateCreateIntentId(templateCreateRoute.publicationId);
    navigate('/');
  }, [isAuthenticated, navigate, templateCreateRoute]);

  const purchaseParams = useMemo(() => {
    const params = new URLSearchParams(route.search);
    return {
      initialPlan: params.get('plan'),
      initialPeriod: params.get('period'),
      autoCheckout: params.get('checkout') === '1',
    };
  }, [route.search]);

  return {
    route,
    authModalMethod: new URLSearchParams(route.search).get('auth') === 'otp' ? 'otp' : 'yandex',
    isYandexCallbackRoute: normalizedPathname === '/auth/yandex/callback',
    isPurchaseRoute: normalizedPathname === '/purchase',
    isAccountRoute: normalizedPathname === '/account',
    isAdminRoute,
    isLoginRoute,
    templateCreateIntentId: workspaceTemplateCreateIntentId,
    consumeTemplateCreateIntent: () => setWorkspaceTemplateCreateIntentId(null),
    projectCreationIntentId: workspaceProjectCreationIntentId ?? readPendingProjectCreationIntentId(),
    consumeProjectCreationIntent: () => {
      writePendingProjectCreationIntentId(null);
      setWorkspaceProjectCreationIntentId(null);
    },
    projectOpenIntentId: workspaceProjectOpenIntentId,
    consumeProjectOpenIntent: () => setWorkspaceProjectOpenIntentId(null),
    blockIntentPublicationId: blockIntentRoute?.publicationId ?? null,
    purchaseParams,
    navigate,
    resolveNextPath: () => sanitizeNextPath(new URLSearchParams(route.search).get('next')),
  };
}
