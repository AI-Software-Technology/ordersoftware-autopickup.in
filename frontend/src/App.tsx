import React, { useCallback, useEffect, useRef } from 'react';
import {
  BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams
} from 'react-router-dom';
import { useAuth } from './store/authStore.js';
import { useUIStore } from './store/uiStore.js';
import { canAccess, ROUTE_RULES } from './lib/access.js';
import { toPath, sectionFromPath } from './lib/navigation.js';
import { Login } from './pages/Login.js';
import { Header } from './components/Header.js';
import { Sidebar } from './components/Sidebar.js';
import { AccessRestricted } from './components/AccessRestricted.js';

// Pages
import { Dashboard } from './pages/Dashboard.js';
import { Orders } from './pages/Orders.js';
import { OrderDetail } from './pages/OrderDetail.js';
import { CreateOrder } from './pages/CreateOrder.js';
import { PackingManagement } from './pages/PackingManagement.js';
import { DeliveredOrders } from './pages/DeliveredOrders.js';
import { Bills } from './pages/Bills.js';
import { Payments } from './pages/Payments.js';
import { Vendors } from './pages/Vendors.js';
import { SalesPersons } from './pages/SalesPersons.js';
import { Products } from './pages/Products.js';
import { BrandsCategories } from './pages/BrandsCategories.js';
import { Reports } from './pages/Reports.js';
import { Companies } from './pages/Companies.js';
import { Users } from './pages/Users.js';
import { RolesPermissions } from './pages/RolesPermissions.js';
import { ActivityLogs } from './pages/ActivityLogs.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';

/**
 * The pages still call onNavigate('orders/12') / onNavigate('orders?status=NEW').
 * This hook keeps that API but pushes a real browser URL, so back/forward, refresh and bookmarks work.
 */
function useAppNavigate() {
  const navigate = useNavigate();
  return useCallback((page: string) => navigate(toPath(page)), [navigate]);
}

function Splash() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
      <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
        <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full motion-safe:animate-spin"></div>
        <p className="text-xs font-semibold text-slate-300">Initializing Auto pickup Lubricant ERP...</p>
      </div>
    </div>
  );
}

/** Sends signed-out visitors to /login and remembers where they were going. */
function RequireAuth() {
  const { user, sessionEnd } = useAuth();
  const location = useLocation();

  if (!user) {
    // After an explicit Sign Out start clean; otherwise (deep link / expired session) come back to this page after login
    const state = sessionEnd === 'logout' ? null : { from: `${location.pathname}${location.search}` };
    return <Navigate to="/login" replace state={state} />;
  }
  return <AppLayout />;
}

/** /login - already signed in? go to the page they asked for (or dashboard). */
function LoginRoute() {
  const { user } = useAuth();
  const location = useLocation();
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && !from.startsWith('/login') ? from : '/dashboard'} replace />;
  }
  return <Login />;
}


function AppLayout() {
  const location = useLocation();
  const navigate = useAppNavigate();
  const mobileSidebarOpen = useUIStore((s) => s.mobileSidebarOpen);
  const toggleMobileSidebar = useUIStore((s) => s.toggleMobileSidebar);
  const closeMobileSidebar = useUIStore((s) => s.closeMobileSidebar);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    closeMobileSidebar();

    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
      mainRef.current.scrollLeft = 0;
    }
  }, [location.pathname, closeMobileSidebar]);

  return (
    <div className="app-shell flex h-screen w-full max-w-full overflow-hidden bg-slate-100 font-sans text-slate-900 antialiased">
      <Sidebar
        currentPage={sectionFromPath(location.pathname)}
        onNavigate={navigate}
        isOpen={mobileSidebarOpen}
        onClose={closeMobileSidebar}
      />

      {mobileSidebarOpen && (
        <div
          onClick={closeMobileSidebar}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs transition-opacity lg:hidden"
        />
      )}

    <div className="app-content flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          onNavigate={navigate}
          onOpenNewOrder={() => navigate('create-order')}
          onToggleMobileSidebar={toggleMobileSidebar}
        />

        <main
          ref={mainRef}
          className="app-main relative min-h-0 min-w-0 w-full max-w-full flex-1 overflow-x-hidden overflow-y-auto bg-slate-100"
        >
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}


/** Renders its children only if the user may open the named route (see lib/access.ts). */
function Guard({ id, children }: { id: string; children: React.ReactNode }) {
  const { user, hasPermission } = useAuth();
  const navigate = useAppNavigate();
  if (!canAccess(user, hasPermission, id)) {
    return <AccessRestricted moduleName={ROUTE_RULES[id]?.label ?? id} onBack={() => navigate('dashboard')} />;
  }
  return <>{children}</>;
}

// ---- Route wrappers: read URL params and hand them to the existing pages as props ----

function OrdersRoute() {
  const navigate = useAppNavigate();
  const [params] = useSearchParams();
  const search = params.get('search') || '';
  const status = params.get('status') || 'ALL';
  // key: re-open the page with fresh filters when the URL query changes (e.g. header search, dashboard cards)
  return <Orders key={`${search}|${status}`} onNavigate={navigate} initialSearch={search} initialStatus={status} />;
}

function OrderDetailRoute() {
  const navigate = useAppNavigate();
  const { orderId = '' } = useParams();
  return <OrderDetail key={orderId} orderId={orderId} onNavigate={navigate} />;
}

function VendorsRoute() {
  const navigate = useAppNavigate();
  const { vendorId } = useParams();
  return <Vendors onNavigate={navigate} initialVendorId={vendorId} />;
}

function SalesPersonsRoute() {
  const navigate = useAppNavigate();
  const { personId } = useParams();
  return <SalesPersons onNavigate={navigate} initialPersonId={personId} />;
}

function NotFound() {
  const navigate = useAppNavigate();
  return (
    <div className="p-6 sm:p-12 max-w-lg mx-auto my-12 bg-white rounded-2xl border border-slate-200 shadow-md text-center space-y-3">
      <h2 className="text-lg font-bold text-slate-900">Page not found</h2>
      <p className="text-xs text-slate-600">This address does not match any screen in Auto pickup.</p>
      <button
        onClick={() => navigate('dashboard')}
        className="inline-flex px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition"
      >
        Go to Dashboard
      </button>
    </div>
  );
}

function AppRoutes() {
  const { isLoading } = useAuth();
  const navigate = useAppNavigate();

  if (isLoading) return <Splash />;

  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />

      <Route element={<RequireAuth />}>
        <Route index element={<Navigate to="/dashboard" replace />} />

        <Route path="dashboard" element={<Dashboard onNavigate={navigate} />} />

        <Route path="orders" element={<Guard id="orders"><OrdersRoute /></Guard>} />
        <Route path="orders/:orderId" element={<Guard id="orders"><OrderDetailRoute /></Guard>} />
        <Route path="create-order" element={<Guard id="create-order"><CreateOrder onNavigate={navigate} /></Guard>} />

        <Route path="packing" element={<Guard id="packing"><PackingManagement onNavigate={navigate} /></Guard>} />
        {/* old address kept working */}
        <Route path="production" element={<Navigate to="/packing" replace />} />

        <Route path="delivered-orders" element={<Guard id="delivered-orders"><DeliveredOrders onNavigate={navigate} /></Guard>} />
        <Route path="bills" element={<Guard id="bills"><Bills onNavigate={navigate} /></Guard>} />
        <Route path="payments" element={<Guard id="payments"><Payments onNavigate={navigate} /></Guard>} />

        <Route path="vendors" element={<Guard id="vendors"><VendorsRoute /></Guard>} />
        <Route path="vendors/:vendorId" element={<Guard id="vendors"><VendorsRoute /></Guard>} />
        <Route path="sales-persons" element={<Guard id="sales-persons"><SalesPersonsRoute /></Guard>} />
        <Route path="sales-persons/:personId" element={<Guard id="sales-persons"><SalesPersonsRoute /></Guard>} />

        <Route path="products" element={<Guard id="products"><Products /></Guard>} />
        <Route path="brands-categories" element={<Guard id="brands-categories"><BrandsCategories /></Guard>} />
        <Route path="reports" element={<Guard id="reports"><Reports /></Guard>} />
        <Route path="companies" element={<Guard id="companies"><Companies /></Guard>} />
        <Route path="users" element={<Guard id="users"><Users /></Guard>} />
        <Route path="roles" element={<Guard id="roles"><RolesPermissions /></Guard>} />
        <Route path="activity-logs" element={<Guard id="activity-logs"><ActivityLogs /></Guard>} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;