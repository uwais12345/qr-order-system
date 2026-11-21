import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { parseTableQrRoute } from './domain/serveqrLogic';
import { ServeQRProvider } from './store/ServeQRStore';
import { PortalLanding } from './views/PortalLanding';

const SuperAdminModule = React.lazy(() =>
  import('./views/super-admin/SuperAdminModule').then((m) => ({ default: m.SuperAdminModule }))
);
const RestaurantOwnerModule = React.lazy(() =>
  import('./views/restaurant/RestaurantOwnerModule').then((m) => ({ default: m.RestaurantOwnerModule }))
);
const CustomerOrderApp = React.lazy(() =>
  import('./views/customer/CustomerOrderApp').then((m) => ({ default: m.CustomerOrderApp }))
);

const ModuleFallback: React.FC = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 p-6">
    <div className="relative flex items-center justify-center mb-4">
      <div className="w-12 h-12 rounded-full border-2 border-amber-500/20 border-t-amber-500 animate-spin" />
      <span className="absolute text-xs font-bold text-amber-400">QR</span>
    </div>
    <p className="text-sm font-medium text-slate-400 tracking-wide animate-pulse">
      Loading ServeQR Portal...
    </p>
  </div>
);

function getCurrentLocationState() {
  if (typeof window === 'undefined') {
    return { pathname: '/', search: '' };
  }
  return {
    pathname: window.location.pathname,
    search: window.location.search,
  };
}

const ServeQRRouter: React.FC = () => {
  const [loc, setLoc] = useState(getCurrentLocationState);

  useEffect(() => {
    const handlePopState = () => setLoc(getCurrentLocationState());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((to: string) => {
    const url = new URL(to, window.location.origin);
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setLoc({ pathname: url.pathname, search: url.search });
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  // 1. Customer QR Ordering route: /menu/:slug?table=T01
  const qrRoute = parseTableQrRoute(loc.pathname, loc.search);
  if (qrRoute) {
    const params = new URLSearchParams(loc.search);
    return (
      <Suspense fallback={<ModuleFallback />}>
        <CustomerOrderApp
          restaurantSlug={qrRoute.restaurantSlug}
          tableNumber={qrRoute.tableNumber}
          branchId={qrRoute.branchId}
          autoStart={params.get('autostart') === '1'}
        />
      </Suspense>
    );
  }

  // 2. Super Admin workspace routes: /super-admin*
  if (loc.pathname.startsWith('/super-admin')) {
    return (
      <Suspense fallback={<ModuleFallback />}>
        <SuperAdminModule onNavigate={navigate} />
      </Suspense>
    );
  }

  // 3. Restaurant Owner workspace routes: /restaurant*
  if (loc.pathname.startsWith('/restaurant')) {
    return (
      <Suspense fallback={<ModuleFallback />}>
        <RestaurantOwnerModule onNavigate={navigate} />
      </Suspense>
    );
  }

  // 4. Default ServeQR Portal Entry
  return <PortalLanding onNavigate={navigate} />;
};

export default function App() {
  return (
    <ServeQRProvider>
      <ServeQRRouter />
    </ServeQRProvider>
  );
}
