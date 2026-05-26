import { NavLink } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  LayoutDashboard,
  Users,
  Car,
  ClipboardList,
  ClipboardCheck,
  FileText,
  Package,
  Wrench,
  HandMetal,
  BarChart3,
  Settings,
  LogOut,
  Truck,
  X,
} from 'lucide-react'

export default function Sidebar({ isOpen, onClose }) {
  const { t } = useLanguage()
  const { signOut, canViewInternal } = useAuth()

  const navItems = [
    { to: '/admin', icon: LayoutDashboard, label: t('nav.dashboard'), end: true },
    ...(canViewInternal ? [{ to: '/admin/customers', icon: Users, label: t('nav.customers') }] : []),
    { to: '/admin/vehicles', icon: Car, label: t('nav.vehicles') },
    { to: '/admin/inspections', icon: ClipboardCheck, label: t('nav.inspections') },
    { to: '/admin/job-cards', icon: ClipboardList, label: t('nav.jobCards') },
    { to: '/admin/invoices', icon: FileText, label: t('nav.invoices') },
    ...(canViewInternal ? [{ to: '/admin/inventory', icon: Package, label: t('nav.inventory') }] : []),
    ...(canViewInternal ? [{ to: '/admin/labour', icon: Wrench, label: t('nav.labour') }] : []),
    { to: '/admin/handover', icon: HandMetal, label: t('nav.handover') },
    ...(canViewInternal ? [{ to: '/admin/reports', icon: BarChart3, label: t('nav.reports') }] : []),
    { to: '/admin/settings', icon: Settings, label: t('nav.settings') },
  ]

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 z-50 transform transition-transform duration-300 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Truck className="w-8 h-8 text-blue-700" />
            <div>
              <h1 className="text-sm font-bold text-gray-900">Malibora</h1>
              <p className="text-xs text-gray-500">Truck Clinic</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 border-r-3 border-blue-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`
                  }
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-gray-200">
          <button
            onClick={signOut}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            {t('nav.logout')}
          </button>
        </div>
      </aside>
    </>
  )
}
