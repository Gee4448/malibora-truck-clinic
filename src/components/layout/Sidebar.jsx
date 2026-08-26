import { NavLink } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import Logo from '../common/Logo'
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  ClipboardCheck,
  FileText,
  Package,
  Wrench,
  HandMetal,
  BarChart3,
  Settings,
  LogOut,
  X,
  MessageSquare,
} from 'lucide-react'
import { useTeamBadge } from '../../lib/team'

export default function Sidebar({ isOpen, onClose }) {
  const { t } = useLanguage()
  const { signOut, canViewInternal, profile } = useAuth()
  // Unread messages plus open tasks on you — a chat nobody notices is no use.
  const { unread, tasks } = useTeamBadge(profile?.id)

  const navItems = [
    { to: '/admin', icon: LayoutDashboard, label: t('nav.dashboard'), end: true },
    // Customers sits right below Dashboard and is visible to every staff role —
    // it's the entry point to a client's full profile (vehicles, inspections,
    // job cards, invoices), not internal cost data.
    { to: '/admin/customers', icon: Users, label: t('nav.customers') },
    { to: '/admin/inspections', icon: ClipboardCheck, label: t('nav.inspections') },
    { to: '/admin/job-cards', icon: ClipboardList, label: t('nav.jobCards') },
    { to: '/admin/invoices', icon: FileText, label: t('nav.invoices') },
    ...(canViewInternal ? [{ to: '/admin/inventory', icon: Package, label: t('nav.inventory') }] : []),
    ...(canViewInternal ? [{ to: '/admin/labour', icon: Wrench, label: t('nav.labour') }] : []),
    { to: '/admin/handover', icon: HandMetal, label: t('nav.handover') },
    { to: '/admin/team', icon: MessageSquare, label: t('nav.team'), badge: unread + tasks },
    ...(canViewInternal ? [{ to: '/admin/reports', icon: BarChart3, label: t('nav.reports') }] : []),
    { to: '/admin/settings', icon: Settings, label: t('nav.settings') },
  ]

  return (
    <>
      {/* Overlay — always visible when drawer is open, on every screen size. */}
      {isOpen && (
        <div
          className="fixed inset-0 glass-overlay backdrop-blur-sm z-40 animate-fade-in"
          onClick={onClose}
        />
      )}

      {/* Sidebar — drawer at every breakpoint, hidden until the user opens it. */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 z-50 transform transition-transform duration-300 [transition-timing-function:var(--ease-out-expo)] flex flex-col ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
          <Logo height={36} iconClassName="w-8 h-8 text-blue-700" />
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <ul className={`space-y-1 ${isOpen ? 'stagger-children' : ''}`}>
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 press ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 border-r-3 border-blue-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:translate-x-0.5'
                    }`
                  }
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge > 0 && (
                    <span className="text-[10px] min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white flex items-center justify-center font-bold">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
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
