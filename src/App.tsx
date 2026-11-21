import React, { useCallback, useEffect, useState } from 'react';
import { parseTableQrRoute } from './domain/serveqrLogic';
import { ServeQRProvider } from './store/ServeQRStore';
import { PortalLanding } from './views/PortalLanding';
import { SuperAdminModule } from './views/super-admin/SuperAdminModule';
import { RestaurantOwnerModule } from './views/restaurant/RestaurantOwnerModule';
import { CustomerOrderApp } from './views/customer/CustomerOrderApp';

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
      <CustomerOrderApp
        restaurantSlug={qrRoute.restaurantSlug}
        tableNumber={qrRoute.tableNumber}
        branchId={qrRoute.branchId}
        autoStart={params.get('autostart') === '1'}
      />
    );
  }

  // 2. Super Admin workspace routes: /super-admin*
  if (loc.pathname.startsWith('/super-admin')) {
    return <SuperAdminModule onNavigate={navigate} />;
  }

  // 3. Restaurant Owner workspace routes: /restaurant*
  if (loc.pathname.startsWith('/restaurant')) {
    return <RestaurantOwnerModule onNavigate={navigate} />;
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
