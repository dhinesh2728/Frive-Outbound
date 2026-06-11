import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { BrowserRouter as Router, Route, Routes, Navigate, Outlet, useOutletContext } from "react-router-dom";
import PageNotFound from "./lib/PageNotFound";
import NotAuthorised from "./lib/NotAuthorised";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import AppLayout from "./components/layout/AppLayout";
import Login from "./pages/auth/Login";
import Home from "./pages/Home";
import CsvImport from "./pages/admin/CsvImport";
import CrateSettings from "./pages/admin/CrateSettings";
import Reports from "./pages/admin/Reports";
import SetCookDate from "./pages/admin/SetCookDate";
import CookDateSettings from "./pages/admin/CookDateSettings";
import UserManagement from "./pages/admin/UserManagement";
import ManagePermissions from "./pages/admin/ManagePermissions";
import EmailSettings from "./pages/admin/EmailSettings";
import SelectDates from "./pages/counting/SelectDates";
import JobList from "./pages/counting/JobList";
import CountingDetail from "./pages/counting/CountingDetail";
import PalletizationDashboard from "./pages/palletization/PalletizationDashboard";
import CreatePallet from "./pages/palletization/CreatePallet";
import OutboundDashboard from "./pages/outbound/OutboundDashboard";
import OutboundAdmin from "./pages/admin/OutboundAdmin";

const LoadingScreen = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
  </div>
);

// Redirect to /login if not authenticated
const AuthGuard = () => {
  const { user, isLoadingAuth } = useAuth();
  if (isLoadingAuth) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
};

// Only superadmin can access – redirects others to /not-authorised
// Forwards AppLayout's outlet context so pages can still read { user, admin, hasPermission }
const SuperAdminGate = () => {
  const { user } = useAuth();
  const ctx = useOutletContext();
  if (!user?.is_superadmin) return <Navigate to="/not-authorised" replace />;
  return <Outlet context={ctx} />;
};

// Checks a specific permission key – redirects to /not-authorised if denied
// Superadmin always passes. Forwards AppLayout's outlet context to the page.
const PermissionGate = ({ permKey }) => {
  const { user, hasPermission } = useAuth();
  const ctx = useOutletContext();
  if (user?.is_superadmin) return <Outlet context={ctx} />;
  if (!hasPermission(permKey)) return <Navigate to="/not-authorised" replace />;
  return <Outlet context={ctx} />;
};

const AppRoutes = () => {
  const { user, isLoadingAuth } = useAuth();
  if (isLoadingAuth) return <LoadingScreen />;

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

      {/* Authenticated app */}
      <Route element={<AuthGuard />}>
        <Route element={<AppLayout />}>
          {/* Home – all authenticated users land here (AppLayout handles role redirect) */}
          <Route path="/" element={<Home />} />

          {/* Not-authorised inside the layout so the sidebar is still visible */}
          <Route path="/not-authorised" element={<NotAuthorised />} />

          {/* Superadmin-only */}
          <Route element={<SuperAdminGate />}>
            <Route path="/admin/users"          element={<UserManagement />} />
            <Route path="/admin/permissions"    element={<ManagePermissions />} />
            <Route path="/admin/email-settings" element={<EmailSettings />} />
          </Route>

          {/* Permission-gated: Admin Center */}
          <Route element={<PermissionGate permKey="csv_import" />}>
            <Route path="/admin/import" element={<CsvImport />} />
          </Route>
          <Route element={<PermissionGate permKey="crate_settings" />}>
            <Route path="/admin/crate-settings" element={<CrateSettings />} />
          </Route>
          <Route element={<PermissionGate permKey="set_cook_date" />}>
            <Route path="/admin/set-cook-date" element={<SetCookDate />} />
          </Route>
          <Route element={<PermissionGate permKey="cook_date_rules" />}>
            <Route path="/admin/cook-date-settings" element={<CookDateSettings />} />
          </Route>
          <Route element={<PermissionGate permKey="outbound_admin" />}>
            <Route path="/admin/outbound-admin" element={<OutboundAdmin />} />
          </Route>
          <Route element={<PermissionGate permKey="reports" />}>
            <Route path="/admin/reports" element={<Reports />} />
          </Route>

          {/* Permission-gated: Working Section */}
          <Route element={<PermissionGate permKey="meal_counting" />}>
            <Route path="/counting"        element={<SelectDates />} />
            <Route path="/counting/jobs"   element={<JobList />} />
            <Route path="/counting/detail" element={<CountingDetail />} />
          </Route>
          <Route element={<PermissionGate permKey="palletization" />}>
            <Route path="/palletization"        element={<PalletizationDashboard />} />
            <Route path="/palletization/create" element={<CreatePallet />} />
          </Route>
          <Route element={<PermissionGate permKey="outbound" />}>
            <Route path="/outbound" element={<OutboundDashboard />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AppRoutes />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
