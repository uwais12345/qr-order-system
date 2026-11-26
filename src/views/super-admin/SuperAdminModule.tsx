import React, { useState } from 'react';
import { useServeQR } from '../../store/ServeQRStore';
import { AuthLoginView } from '../AuthLoginView';
import { SuperAdminLayout, type SuperAdminSection } from './SuperAdminLayout';
import { SuperAdminDashboard } from './SuperAdminDashboard';
import { RestaurantsView } from './RestaurantsView';
import { AddRestaurantWizard } from './AddRestaurantWizard';
import { RestaurantInspectionView } from './RestaurantInspectionView';
import {
  SuperAdminReportsView,
  SuperAdminSettingsView,
  SuperAdminSubscriptionsView,
} from './SubscriptionsAndReports';

interface SuperAdminModuleProps {
  onNavigate: (path: string) => void;
}

export const SuperAdminModule: React.FC<SuperAdminModuleProps> = ({ onNavigate }) => {
  const {
    auth,
    backendMode,
    backendSyncing,
    backendError,
    refreshFromBackend,
    clearBackendError,
    logoutSuperAdmin,
  } = useServeQR();
  const [section, setSection] = useState<SuperAdminSection>('dashboard');
  const [inspectingRestaurantId, setInspectingRestaurantId] = useState<string | null>(null);
  const [showAddWizard, setShowAddWizard] = useState(false);

  if (!auth.superAdminLoggedIn) {
    return (
      <AuthLoginView
        role="super-admin"
        onSuccess={() => onNavigate('/super-admin/dashboard')}
        onBack={() => onNavigate('/')}
      />
    );
  }

  const breadcrumbTitle = inspectingRestaurantId
    ? 'Restaurant Inspection'
    : section === 'dashboard'
    ? 'Dashboard'
    : section === 'restaurants'
    ? 'Restaurants'
    : section === 'subscriptions'
    ? 'Subscriptions'
    : section === 'reports'
    ? 'Platform Reports'
    : 'Settings';

  return (
    <>
      <SuperAdminLayout
        activeSection={section}
        breadcrumbTitle={breadcrumbTitle}
        adminEmail={auth.superAdminEmail}
        backendMode={backendMode}
        backendSyncing={backendSyncing}
        backendError={backendError}
        onRefresh={() => void refreshFromBackend()}
        onDismissError={clearBackendError}
        onSelectSection={(next) => {
          setInspectingRestaurantId(null);
          setSection(next);
        }}
        onOpenAddRestaurant={() => setShowAddWizard(true)}
        onLogout={() => {
          logoutSuperAdmin();
          onNavigate('/');
        }}
        onGoHome={() => onNavigate('/')}
      >
        {inspectingRestaurantId ? (
          <RestaurantInspectionView
            restaurantId={inspectingRestaurantId}
            onBack={() => setInspectingRestaurantId(null)}
          />
        ) : section === 'dashboard' ? (
          <SuperAdminDashboard
            onOpenAddRestaurant={() => setShowAddWizard(true)}
            onInspectRestaurant={(r) => {
              setSection('restaurants');
              setInspectingRestaurantId(r.id);
            }}
            onViewAllRestaurants={() => setSection('restaurants')}
          />
        ) : section === 'restaurants' ? (
          <RestaurantsView
            onOpenAddRestaurant={() => setShowAddWizard(true)}
            onInspectRestaurant={(r) => setInspectingRestaurantId(r.id)}
          />
        ) : section === 'subscriptions' ? (
          <SuperAdminSubscriptionsView />
        ) : section === 'reports' ? (
          <SuperAdminReportsView />
        ) : (
          <SuperAdminSettingsView />
        )}
      </SuperAdminLayout>

      {showAddWizard && (
        <AddRestaurantWizard
          onClose={() => setShowAddWizard(false)}
          onCreated={(rest) => {
            setShowAddWizard(false);
            setSection('restaurants');
            setInspectingRestaurantId(rest.id);
          }}
        />
      )}
    </>
  );
};
