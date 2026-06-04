import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppLayout from './components/layout/AppLayout';
import Home from './pages/Home';
import CsvImport from './pages/admin/CsvImport';
import CrateSettings from './pages/admin/CrateSettings';
import Reports from './pages/admin/Reports';
import SetCookDate from './pages/admin/SetCookDate';
import CookDateSettings from './pages/admin/CookDateSettings';
import SelectDates from './pages/counting/SelectDates';
import JobList from './pages/counting/JobList';
import CountingDetail from './pages/counting/CountingDetail';
import PalletizationDashboard from './pages/palletization/PalletizationDashboard';
import CreatePallet from './pages/palletization/CreatePallet';
import OutboundDashboard from './pages/outbound/OutboundDashboard';
import OutboundAdmin from './pages/admin/OutboundAdmin';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/admin/import" element={<CsvImport />} />
        <Route path="/admin/crate-settings" element={<CrateSettings />} />
        <Route path="/admin/reports" element={<Reports />} />
        <Route path="/admin/set-cook-date" element={<SetCookDate />} />
        <Route path="/admin/cook-date-settings" element={<CookDateSettings />} />
        <Route path="/counting" element={<SelectDates />} />
        <Route path="/counting/jobs" element={<JobList />} />
        <Route path="/counting/detail" element={<CountingDetail />} />
        <Route path="/palletization" element={<PalletizationDashboard />} />
        <Route path="/palletization/create" element={<CreatePallet />} />
        <Route path="/outbound" element={<OutboundDashboard />} />
        <Route path="/admin/outbound-admin" element={<OutboundAdmin />} />
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
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
