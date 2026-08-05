import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { LanguageProvider } from './contexts/LanguageContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ClientAuthProvider, useClient } from './contexts/ClientAuthContext'
import { MechanicAuthProvider, useMechanic } from './contexts/MechanicAuthContext'
import Layout from './components/layout/Layout'
import ClientLayout from './components/layout/ClientLayout'
import MechanicLayout from './components/layout/MechanicLayout'
import Login from './pages/Login'
import Register from './pages/Register'
import StaffGate from './pages/StaffGate'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import Inspections from './pages/Inspections'
import InspectionDetail from './pages/InspectionDetail'
import CustomerView from './pages/CustomerView'
import JobCards from './pages/JobCards'
import JobCardDetail from './pages/JobCardDetail'
import Invoices from './pages/Invoices'
import InvoiceDetail from './pages/InvoiceDetail'
import Inventory from './pages/Inventory'
import LabourRates from './pages/LabourRates'
import Handover from './pages/Handover'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Team from './pages/Team'
import RoleUnlock from './pages/RoleUnlock'
import ClientLogin from './pages/client/ClientLogin'
import ClientDashboard from './pages/client/ClientDashboard'
import ClientVehicles from './pages/client/ClientVehicles'
import ClientServices from './pages/client/ClientServices'
import ClientServiceDetail from './pages/client/ClientServiceDetail'
import ClientInvoices from './pages/client/ClientInvoices'
import ClientInvoiceView from './pages/client/ClientInvoiceView'
import ClientInspections from './pages/client/ClientInspections'
import ClientInspectionDetail from './pages/client/ClientInspectionDetail'
import ClientHandovers from './pages/client/ClientHandovers'
import ClientProfile from './pages/client/ClientProfile'
import ClientRegister from './pages/client/ClientRegister'
import ClientNewRequest from './pages/client/ClientNewRequest'
import MechanicLogin from './pages/mechanic/MechanicLogin'
import MechanicJobs from './pages/mechanic/MechanicJobs'
import MechanicJobDetail from './pages/mechanic/MechanicJobDetail'
import InstallPrompt from './components/common/InstallPrompt'
import './styles/index.css'

// Protected Route component
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />
  }

  return children
}

// Public Route (redirect to dashboard if logged in)
function PublicRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-900">
        <div className="animate-spin w-10 h-10 border-4 border-white border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (user) {
    return <Navigate to="/admin" replace />
  }

  return children
}

// Client Protected Route — only approved customers can access the portal
function ClientProtectedRoute({ children }) {
  const { customer, loading } = useClient()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        </div>
      </div>
    )
  }

  if (!customer || customer.status !== 'approved') {
    return <Navigate to="/client" replace />
  }

  return children
}

// Staff Verified Route — requires access code before showing login/register
function StaffVerifiedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-900">
        <div className="animate-spin w-10 h-10 border-4 border-white border-t-transparent rounded-full"></div>
      </div>
    )
  }

  // If already logged in, go to admin
  if (user) {
    return <Navigate to="/admin" replace />
  }

  // Check if staff access code was verified this session
  const verified = sessionStorage.getItem('malibora_staff_verified')
  const verifiedAt = sessionStorage.getItem('malibora_staff_verified_at')

  // Verification expires after 30 minutes
  const EXPIRY_MS = 30 * 60 * 1000
  const isExpired = verifiedAt && (Date.now() - parseInt(verifiedAt)) > EXPIRY_MS

  if (!verified || isExpired) {
    // Clear expired verification
    if (isExpired) {
      sessionStorage.removeItem('malibora_staff_verified')
      sessionStorage.removeItem('malibora_staff_verified_at')
    }
    return <Navigate to="/admin/gate" replace />
  }

  return children
}

// Mechanic Protected Route — requires a PIN session
function MechanicProtectedRoute({ children }) {
  const { mechanic, loading } = useMechanic()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-10 h-10 border-4 border-amber-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (!mechanic) {
    return <Navigate to="/mechanic" replace />
  }

  return children
}

// Mechanic Public Route (redirect to jobs if already signed in)
function MechanicPublicRoute({ children }) {
  const { mechanic, loading } = useMechanic()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin w-10 h-10 border-4 border-white border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (mechanic) {
    return <Navigate to="/mechanic/jobs" replace />
  }

  return children
}

// Root redirect — role-aware landing.
// The app installs as a PWA with start_url "/", so every launch hits this.
// A staff Supabase session must win over any lingering client session,
// otherwise a staff member on mobile is bounced into the client portal.
function RootRedirect() {
  const { user, loading: authLoading } = useAuth()
  const { customer, loading: clientLoading } = useClient()

  if (authLoading || clientLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-900">
        <div className="animate-spin w-10 h-10 border-4 border-white border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (user) return <Navigate to="/admin" replace />
  if (customer && customer.status === 'approved') return <Navigate to="/client/dashboard" replace />
  return <Navigate to="/client" replace />
}

// Client Public Route (redirect to dashboard if logged in)
function ClientPublicRoute({ children }) {
  const { customer, loading } = useClient()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-900">
        <div className="animate-spin w-10 h-10 border-4 border-white border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (customer) {
    return <Navigate to="/client/dashboard" replace />
  }

  return children
}

function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <ClientAuthProvider>
          <MechanicAuthProvider>
          <InstallPrompt />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                borderRadius: '14px',
                padding: '12px 16px',
                fontSize: '14px',
                boxShadow: '0 10px 30px -8px rgb(0 0 0 / 0.2)',
                border: '1px solid rgb(0 0 0 / 0.05)',
              },
              success: { iconTheme: { primary: '#059669', secondary: '#fff' } },
              error: { iconTheme: { primary: '#dc2626', secondary: '#fff' } },
            }}
          />
          <Routes>
            {/* Root goes straight to the client portal — new visitors register or
                log in with phone + password; the client guards redirect anyone
                already signed in to their dashboard. Staff reach admin via the
                discreet "Staff login" link on the client login screen. */}
            <Route path="/" element={<RootRedirect />} />

            {/* Customer view - public, no login required */}
            <Route path="/c/:token" element={<CustomerView />} />

            {/* Client portal routes */}
            <Route path="/client">
              <Route index element={<ClientPublicRoute><ClientLogin /></ClientPublicRoute>} />
              <Route path="register" element={<ClientPublicRoute><ClientRegister /></ClientPublicRoute>} />
              <Route element={<ClientProtectedRoute><ClientLayout /></ClientProtectedRoute>}>
                <Route path="dashboard" element={<ClientDashboard />} />
                <Route path="vehicles" element={<ClientVehicles />} />
                <Route path="services" element={<ClientServices />} />
                <Route path="services/:id" element={<ClientServiceDetail />} />
                <Route path="inspections" element={<ClientInspections />} />
                <Route path="inspections/:id" element={<ClientInspectionDetail />} />
                <Route path="invoices" element={<ClientInvoices />} />
                <Route path="invoices/:id" element={<ClientInvoiceView />} />
                <Route path="handovers" element={<ClientHandovers />} />
                <Route path="new-request" element={<ClientNewRequest />} />
                <Route path="profile" element={<ClientProfile />} />
              </Route>
            </Route>

            {/* Mechanic portal — PIN login, restricted to assigned jobs */}
            <Route path="/mechanic">
              <Route index element={<MechanicPublicRoute><MechanicLogin /></MechanicPublicRoute>} />
              <Route element={<MechanicProtectedRoute><MechanicLayout /></MechanicProtectedRoute>}>
                <Route path="jobs" element={<MechanicJobs />} />
                <Route path="jobs/:id" element={<MechanicJobDetail />} />
              </Route>
            </Route>

            {/* Staff access gate */}
            <Route path="/admin/gate" element={<StaffGate />} />

            {/* Admin auth routes — protected by staff access code */}
            <Route path="/admin/login" element={<StaffVerifiedRoute><Login /></StaffVerifiedRoute>} />
            <Route path="/admin/register" element={<StaffVerifiedRoute><Register /></StaffVerifiedRoute>} />

            {/* Admin protected routes */}
            <Route path="/admin" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="customers" element={<Customers />} />
              <Route path="customers/:id" element={<CustomerDetail />} />
              <Route path="inspections" element={<Inspections />} />
              <Route path="inspections/:id" element={<InspectionDetail />} />
              <Route path="job-cards" element={<JobCards />} />
              <Route path="job-cards/:id" element={<JobCardDetail />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="invoices/:id" element={<InvoiceDetail />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="labour" element={<LabourRates />} />
              <Route path="handover" element={<Handover />} />
              <Route path="reports" element={<Reports />} />
              <Route path="team" element={<Team />} />
              <Route path="settings" element={<Settings />} />
              <Route path="unlock" element={<RoleUnlock />} />
            </Route>

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </MechanicAuthProvider>
          </ClientAuthProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  )
}

export default App
