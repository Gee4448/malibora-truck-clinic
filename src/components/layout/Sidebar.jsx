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
        className={`drawer-dark fixed top-0 left-0 h-full w-64 z-50 transform transition-transform duration-300 [transition-timing-function:var(--ease-out-expo)] flex flex-col ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Logo. The asset is a lockup on a cream ground (measured: 99.6% opaque,
            avg rgb 233/219/209), so on the dark drawer it lands as a bright
            rectangle. Rounding and ringing it turns that into a deliberate
            plate rather than a stray light patch. */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
          <div className="rounded-lg overflow-hidden ring-1 ring-white/20">
            <Logo height={34} iconClassName="w-8 h-8 text-blue-400" />
          </div>
          <button onClick={onClose} className="tap p-1 rounded text-white/70 hover:text-white hover:bg-white/10">
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
                    `nav-row flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium press ${
                      isActive ? 'nav-row-active' : ''
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
        <div className="p-3 border-t border-white/10">
          <button
            onClick={signOut}
            /* red-600 fails on black (3.0:1). red-400 clears 4.5:1 and still
               reads unmistakably as the destructive action. */
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/15 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            {t('nav.logout')}
          </button>
        </div>
      </aside>
    </>
  )
}
