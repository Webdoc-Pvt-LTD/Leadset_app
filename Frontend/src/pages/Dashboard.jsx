import { useAuth } from "../context/AuthContext";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  Clock,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { BASE_URL } from "../config";
import { useEffect, useState } from "react";
import LoaderSpinner from "../components/loader";
const stats = [
  {
    label: "Total Jobs",
    value: "124",
    icon: FileText,
    iconColor: "text-indigo-600",
    iconBg: "bg-indigo-50",
  },
  {
    label: "Completed",
    value: "98",
    icon: CheckCircle2,
    iconColor: "text-emerald-600",
    iconBg: "bg-emerald-50",
  },
  {
    label: "Scheduled",
    value: "18",
    icon: Clock,
    iconColor: "text-amber-600",
    iconBg: "bg-amber-50",
  },
];

const recentJobs = [
  {
    name: "Q2 Campaign A",
    service: "SMS Blast",
    status: "completed",
    time: "2h ago",
  },
  {
    name: "Retail Promo",
    service: "Email Drip",
    status: "running",
    time: "5h ago",
  },
  {
    name: "B2B Outreach",
    service: "Cold Call",
    status: "scheduled",
    time: "Tomorrow",
  },
  {
    name: "Re-engagement",
    service: "SMS Blast",
    status: "completed",
    time: "Yesterday",
  },
];

const statusStyle = {
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  running: "bg-indigo-50 text-indigo-700 border-indigo-200",
  scheduled: "bg-amber-50 text-amber-700 border-amber-200",
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalFiles: 0,
    completedFiles: 0,
    pendingFiles: 0,
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);

      const { data } = await axios.get(`${BASE_URL}/dashboard/stats`);

      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch dashboard stats:", error);
    } finally {
      setLoading(false);
    }
  };
  const statCards = [
    {
      label: "Total Files",
      value: stats.totalFiles,
      icon: FileText,
      iconColor: "text-indigo-600",
      iconBg: "bg-indigo-50",
    },
    {
      label: "Completed",
      value: stats.completedFiles,
      icon: CheckCircle2,
      iconColor: "text-emerald-600",
      iconBg: "bg-emerald-50",
    },
    {
      label: "Pending",
      value: stats.pendingFiles,
      icon: Clock,
      iconColor: "text-amber-600",
      iconBg: "bg-amber-50",
    },
  ];
  if (loading) return <LoaderSpinner />;
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Good morning,{" "}
          <span className="text-indigo-600 capitalize">{user?.name}</span> 👋
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Here's what's happening with your lead campaigns.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map(({ label, value, icon: Icon, iconColor, iconBg }) => (
          <div
            key={label}
            className="bg-white rounded-2xl border border-indigo-200 shadow-md hover:shadow-lg transition-all duration-200 p-6 h-60 flex flex-col"
          >
            {/* Heading */}
            <h3 className="text-lg font-semibold text-gray-600">{label}</h3>

            {/* Icon */}
            <div className="flex-1 flex items-center justify-center gap-6">
              <div
                className={`w-24 h-24 rounded-full ${iconBg} flex items-center justify-center`}
              >
                <Icon className={iconColor} size={44} />
              </div>
              {/* Value */}
              <div className="flex-1">
                <p className="text-5xl font-extrabold text-gray-800">
                  {loading ? "--" : value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}

      <div className="mt-8">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">
          Quick Actions
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Upload */}
          <button
            onClick={() => navigate("/upload")}
            className="group bg-white border border-slate-200 rounded-2xl p-6 text-left shadow-sm hover:shadow-lg hover:border-indigo-300 transition-all duration-200"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center">
                <UploadCloud className="text-indigo-600" size={34} />
              </div>

              <ArrowRight
                size={22}
                className="text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all"
              />
            </div>

            <h3 className="text-xl font-semibold text-slate-800">
              Upload New File
            </h3>

            <p className="mt-2 text-sm text-slate-500 leading-6">
              Upload a new lead file and schedule it for processing.
            </p>
          </button>

          {/* Files */}
          <button
            onClick={() => navigate("/files")}
            className="group bg-white border border-slate-200 rounded-2xl p-6 text-left shadow-sm hover:shadow-lg hover:border-violet-300 transition-all duration-200"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center">
                <FileText className="text-violet-600" size={34} />
              </div>

              <ArrowRight
                size={22}
                className="text-slate-300 group-hover:text-violet-600 group-hover:translate-x-1 transition-all"
              />
            </div>

            <h3 className="text-xl font-semibold text-slate-800">View Files</h3>

            <p className="mt-2 text-sm text-slate-500 leading-6">
              Browse uploaded files, monitor their status, and download
              completed results.
            </p>
          </button>
        </div>
      </div>
      {/* Recent jobs */}
      {/* <div>
        <h2 className="text-sm font-semibold text-slate-600 mb-3">
          Recent Jobs
        </h2>
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="text-left text-xs text-slate-400 font-semibold px-5 py-3">
                  Job Name
                </th>
                <th className="text-left text-xs text-slate-400 font-semibold px-5 py-3">
                  Service
                </th>
                <th className="text-left text-xs text-slate-400 font-semibold px-5 py-3">
                  Status
                </th>
                <th className="text-left text-xs text-slate-400 font-semibold px-5 py-3">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.map((job, i) => (
                <tr
                  key={i}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors"
                >
                  <td className="px-5 py-3.5 text-slate-700 font-medium">
                    {job.name}
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">{job.service}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium capitalize ${statusStyle[job.status]}`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">
                    {job.time}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div> */}
    </div>
  );
}
