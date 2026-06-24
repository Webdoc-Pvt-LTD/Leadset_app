import { useAuth } from '../context/AuthContext'
import { UploadCloud, FileText, CheckCircle2, Clock, TrendingUp, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const stats = [
  { label: 'Total Jobs',      value: '124',   icon: FileText,     iconColor: 'text-indigo-600',  iconBg: 'bg-indigo-50'  },
  { label: 'Completed',       value: '98',    icon: CheckCircle2, iconColor: 'text-emerald-600', iconBg: 'bg-emerald-50' },
  { label: 'Scheduled',       value: '18',    icon: Clock,        iconColor: 'text-amber-600',   iconBg: 'bg-amber-50'   },
  { label: 'Leads Generated', value: '48.2k', icon: TrendingUp,   iconColor: 'text-violet-600',  iconBg: 'bg-violet-50'  },
]

const recentJobs = [
  { name: 'Q2 Campaign A', service: 'SMS Blast',  status: 'completed', time: '2h ago'    },
  { name: 'Retail Promo',  service: 'Email Drip', status: 'running',   time: '5h ago'    },
  { name: 'B2B Outreach',  service: 'Cold Call',  status: 'scheduled', time: 'Tomorrow'  },
  { name: 'Re-engagement', service: 'SMS Blast',  status: 'completed', time: 'Yesterday' },
]

const statusStyle = {
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  running:   'bg-indigo-50 text-indigo-700 border-indigo-200',
  scheduled: 'bg-amber-50 text-amber-700 border-amber-200',
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Good morning, <span className="text-indigo-600 capitalize">{user?.name}</span> 👋
        </h1>
        <p className="text-sm text-slate-500 mt-1">Here's what's happening with your lead campaigns.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, iconColor, iconBg }) => (
          <div key={label} className="card flex items-center gap-4 p-5">
            <div className={`${iconBg} ${iconColor} w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0`}>
              <Icon size={18} />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => navigate('/upload')}
          className="card hover:border-indigo-300 hover:shadow-md hover:shadow-indigo-100 transition-all duration-200 text-left group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <UploadCloud size={18} />
            </div>
            <span className="font-semibold text-slate-700 text-sm">Upload New Job</span>
            <ArrowRight size={14} className="ml-auto text-slate-300 group-hover:text-indigo-500 transition-colors" />
          </div>
          <p className="text-xs text-slate-400">Configure a new lead generation job with file upload and scheduling.</p>
        </button>

        <button
          onClick={() => navigate('/files')}
          className="card hover:border-violet-300 hover:shadow-md hover:shadow-violet-100 transition-all duration-200 text-left group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
              <FileText size={18} />
            </div>
            <span className="font-semibold text-slate-700 text-sm">View Files</span>
            <ArrowRight size={14} className="ml-auto text-slate-300 group-hover:text-violet-500 transition-colors" />
          </div>
          <p className="text-xs text-slate-400">Browse uploaded lead files and download processed results.</p>
        </button>
      </div>

      {/* Recent jobs */}
      <div>
        <h2 className="text-sm font-semibold text-slate-600 mb-3">Recent Jobs</h2>
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="text-left text-xs text-slate-400 font-semibold px-5 py-3">Job Name</th>
                <th className="text-left text-xs text-slate-400 font-semibold px-5 py-3">Service</th>
                <th className="text-left text-xs text-slate-400 font-semibold px-5 py-3">Status</th>
                <th className="text-left text-xs text-slate-400 font-semibold px-5 py-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.map((job, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors">
                  <td className="px-5 py-3.5 text-slate-700 font-medium">{job.name}</td>
                  <td className="px-5 py-3.5 text-slate-500">{job.service}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium capitalize ${statusStyle[job.status]}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">{job.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
