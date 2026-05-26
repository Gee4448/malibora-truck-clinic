import { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase, formatTZS } from '../lib/supabase'
import { TrendingUp, DollarSign, Package, Wrench, BarChart3, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Reports() {
  const { t } = useLanguage()
  const [period, setPeriod] = useState('month')
  const [stats, setStats] = useState({
    totalRevenue: 0, totalCost: 0, totalProfit: 0, avgMargin: 0,
    jobsCompleted: 0, invoicesPaid: 0, partsProfit: 0, labourProfit: 0,
  })
  const [recentInvoices, setRecentInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchReports() }, [period])

  const fetchReports = async () => {
    setLoading(true)
    try {
      const now = new Date()
      let startDate
      if (period === 'week') startDate = new Date(now - 7 * 24 * 60 * 60 * 1000)
      else if (period === 'month') startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      else if (period === 'quarter') startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1)
      else startDate = new Date(now.getFullYear(), 0, 1)

      // Paid invoices in period
      const { data: invoices } = await supabase
        .from('invoices')
        .select('*, customers(full_name), job_cards(job_number)')
        .eq('invoice_type', 'final')
        .eq('status', 'paid')
        .gte('paid_at', startDate.toISOString())
        .order('paid_at', { ascending: false })

      const inv = invoices || []
      const totalRevenue = inv.reduce((s, i) => s + Number(i.total_amount || 0), 0)
      const totalCostParts = inv.reduce((s, i) => s + Number(i.internal_cost_parts || 0), 0)
      const totalCostLabour = inv.reduce((s, i) => s + Number(i.internal_cost_labour || 0), 0)
      const totalProfit = inv.reduce((s, i) => s + Number(i.profit_total || 0), 0)
      const avgMargin = inv.length > 0 ? inv.reduce((s, i) => s + Number(i.profit_margin || 0), 0) / inv.length : 0
      const partsProfit = inv.reduce((s, i) => s + Number(i.profit_parts || 0), 0)
      const labourProfit = inv.reduce((s, i) => s + Number(i.profit_labour || 0), 0)

      // Completed jobs in period
      const { count: jobsCompleted } = await supabase
        .from('job_cards')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('date_completed', startDate.toISOString())

      setStats({
        totalRevenue, totalCost: totalCostParts + totalCostLabour,
        totalProfit, avgMargin, jobsCompleted: jobsCompleted || 0,
        invoicesPaid: inv.length, partsProfit, labourProfit,
      })
      setRecentInvoices(inv.slice(0, 10))
    } catch (err) {
      toast.error(t('reports.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const colorMap = {
    blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
    green: { bg: 'bg-green-100', text: 'text-green-600' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-600' },
    orange: { bg: 'bg-orange-100', text: 'text-orange-600' },
  }

  const statCards = [
    { label: t('reports.totalRevenue'), value: formatTZS(stats.totalRevenue), icon: DollarSign, color: 'blue', sub: `${stats.invoicesPaid} ${t('reports.invoicesPaid')}` },
    { label: t('reports.totalProfit'), value: formatTZS(stats.totalProfit), icon: TrendingUp, color: 'green', sub: `${t('reports.avgMargin')}: ${stats.avgMargin.toFixed(1)}%` },
    { label: t('reports.partsProfit'), value: formatTZS(stats.partsProfit), icon: Package, color: 'purple', sub: t('reports.fromPartsMarkup') },
    { label: t('reports.labourProfit'), value: formatTZS(stats.labourProfit), icon: Wrench, color: 'orange', sub: t('reports.fromLabourMarkup') },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-700" />
            {t('nav.reports')}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('reports.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          {['week', 'month', 'quarter', 'year'].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition capitalize ${
                period === p ? 'bg-blue-700 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}>
              <Calendar className="w-3 h-3 inline mr-1" />{p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((card) => (
              <div key={card.label} className="bg-white rounded-xl p-5 border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-500">{card.label}</span>
                  <div className={`w-10 h-10 rounded-lg ${colorMap[card.color].bg} flex items-center justify-center`}>
                    <card.icon className={`w-5 h-5 ${colorMap[card.color].text}`} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Profit Breakdown Bar */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">{t('reports.profitBreakdown')}</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{t('reports.revenue')}</span>
                  <span className="font-medium">{formatTZS(stats.totalRevenue)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div className="bg-blue-600 rounded-full h-3" style={{ width: '100%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{t('reports.costs')}</span>
                  <span className="font-medium">{formatTZS(stats.totalCost)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div className="bg-red-400 rounded-full h-3" style={{ width: stats.totalRevenue > 0 ? `${(stats.totalCost / stats.totalRevenue * 100)}%` : '0%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-green-700 font-medium">{t('reports.netProfit')}</span>
                  <span className="font-bold text-green-700">{formatTZS(stats.totalProfit)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div className="bg-green-500 rounded-full h-3" style={{ width: stats.totalRevenue > 0 ? `${(stats.totalProfit / stats.totalRevenue * 100)}%` : '0%' }}></div>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="mt-6 grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{stats.jobsCompleted}</p>
                <p className="text-xs text-gray-500">{t('reports.jobsCompleted')}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{stats.invoicesPaid}</p>
                <p className="text-xs text-gray-500">{t('reports.invoicesPaid')}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{stats.avgMargin.toFixed(1)}%</p>
                <p className="text-xs text-gray-500">{t('reports.avgMargin')}</p>
              </div>
            </div>
          </div>

          {/* Recent Paid Invoices */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <h2 className="font-semibold text-gray-900 p-5 border-b border-gray-100">{t('reports.recentPaidInvoices')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left p-3 font-medium text-gray-600">{t('invoices.number')}</th>
                    <th className="text-left p-3 font-medium text-gray-600">{t('invoices.customer')}</th>
                    <th className="text-right p-3 font-medium text-gray-600">{t('reports.revenue')}</th>
                    <th className="text-right p-3 font-medium text-gray-600">{t('reports.costs')}</th>
                    <th className="text-right p-3 font-medium text-gray-600">{t('jobs.profit')}</th>
                    <th className="text-right p-3 font-medium text-gray-600">{t('reports.margin')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentInvoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="p-3 font-medium text-blue-700">{inv.invoice_number}</td>
                      <td className="p-3 text-gray-600">{inv.customers?.full_name}</td>
                      <td className="p-3 text-right">{formatTZS(inv.total_amount)}</td>
                      <td className="p-3 text-right text-gray-500">{formatTZS(Number(inv.internal_cost_parts) + Number(inv.internal_cost_labour))}</td>
                      <td className="p-3 text-right font-medium text-green-600">{formatTZS(inv.profit_total)}</td>
                      <td className="p-3 text-right">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${Number(inv.profit_margin) > 30 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {Number(inv.profit_margin).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
