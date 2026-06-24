import { useState } from 'react'
import {
  FileText, Download, Trash2, Search,
  CheckCircle2, Clock, AlertCircle, RefreshCw
} from 'lucide-react'

const MOCK_FILES = [
  { id: 1, name: 'q2_campaign_a.txt',  job: 'Q2 Campaign A',  service: 'SMS Blast',  size: '2.4 MB', leads: 18400, status: 'completed', uploaded: '2025-06-20 09:14' },
  { id: 2, name: 'retail_promo.txt',   job: 'Retail Promo',   service: 'Email Drip', size: '1.1 MB', leads: 8200,  status: 'running',   uploaded: '2025-06-21 14:32' },
  { id: 3, name: 'b2b_outreach.txt',   job: 'B2B Outreach',   service: 'Cold Call',  size: '840 KB', leads: 3600,  status: 'scheduled', uploaded: '2025-06-22 08:00' },
  { id: 4, name: 're_engagement.txt',  job: 'Re-engagement',  service: 'SMS Blast',  size: '3.2 MB', leads: 24100, status: 'completed', uploaded: '2025-06-19 16:45' },
  { id: 5, name: 'summer_blast.txt',   job: 'Summer Blast',   service: 'WhatsApp',   size: '980 KB', leads: 7100,  status: 'completed', uploaded: '2025-06-18 11:22' },
  { id: 6, name: 'cold_leads_may.txt', job: 'May Cold Leads', service: 'Robocall',   size: '1.7 MB', leads: 12900, status: 'error',     uploaded: '2025-06-17 10:05' },
]

const statusConfig = {
  completed: { icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', label: 'Completed' },
  running:   { icon: RefreshCw,    color: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-200',   label: 'Running'   },
  scheduled: { icon: Clock,        color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     label: 'Scheduled' },
  error:     { icon: AlertCircle,  color: 'text-red-700',     bg: 'bg-red-50 border-red-200',         label: 'Error'     },
}

export default function Files() {
  const [files, setFiles] = useState(MOCK_FILES)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selected, setSelected] = useState([])

  const filtered = files.filter(f => {
    const matchSearch = f.name.toLowerCase().includes(search.toLowerCase())
      || f.job.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || f.status === filterStatus
    return matchSearch && matchStatus
  })

  const toggleSelect = (id) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const toggleAll = () =>
    setSelected(selected.length === filtered.length ? [] : filtered.map(f => f.id))

  const deleteSelected = () => {
    setFiles(fs => fs.filter(f => !selected.includes(f.id)))
    setSelected([])
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Files</h1>
          <p className="text-sm text-slate-500 mt-1">{files.length} uploaded lead files</p>
        </div>
        {selected.length > 0 && (
          <button
            onClick={deleteSelected}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                       bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-all"
          >
            <Trash2 size={15} /> Delete {selected.length} selected
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input-field pl-9"
            placeholder="Search by file or job name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
          {['all', 'completed', 'running', 'scheduled', 'error'].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all
                ${filterStatus === s
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.length === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  className="accent-indigo-600 cursor-pointer"
                />
              </th>
              {['File', 'Job', 'Service', 'Leads', 'Size', 'Status', 'Uploaded', ''].map(h => (
                <th key={h} className="text-left text-xs text-slate-400 font-semibold px-3 py-3 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-slate-400 text-sm">
                  No files match your filter.
                </td>
              </tr>
            ) : filtered.map(file => {
              const cfg = statusConfig[file.status]
              const Icon = cfg.icon
              return (
                <tr
                  key={file.id}
                  className={`border-b border-slate-100 last:border-0 transition-colors
                    ${selected.includes(file.id) ? 'bg-indigo-50/60' : 'hover:bg-slate-50/70'}`}
                >
                  <td className="px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={selected.includes(file.id)}
                      onChange={() => toggleSelect(file.id)}
                      className="accent-indigo-600 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2">
                      <FileText size={15} className="text-indigo-500 flex-shrink-0" />
                      <span className="text-slate-700 font-medium font-mono text-xs truncate max-w-[140px]">
                        {file.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-slate-500">{file.job}</td>
                  <td className="px-3 py-3.5 text-slate-500">{file.service}</td>
                  <td className="px-3 py-3.5 text-slate-700 font-semibold">{file.leads.toLocaleString()}</td>
                  <td className="px-3 py-3.5 text-slate-400 text-xs">{file.size}</td>
                  <td className="px-3 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                      <Icon size={11} className={file.status === 'running' ? 'animate-spin' : ''} />
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-slate-400 text-xs font-mono whitespace-nowrap">{file.uploaded}</td>
                  <td className="px-3 py-3.5">
                    <button className="text-slate-400 hover:text-indigo-600 transition-colors p-1 rounded-md hover:bg-indigo-50" title="Download">
                      <Download size={15} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400 text-center">
        Showing {filtered.length} of {files.length} files
      </p>
    </div>
  )
}
