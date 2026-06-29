import {
  FileText,
  Download,
  Trash2,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import axios from "axios";
import { BASE_URL } from "../config";
import LoaderSpinner from "../components/loader";

const statusConfig = {
  completed: {
    icon: CheckCircle2,
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
    label: "Completed",
  },
  running: {
    icon: RefreshCw,
    color: "text-indigo-700",
    bg: "bg-indigo-50 border-indigo-200",
    label: "Running",
  },
  scheduled: {
    icon: Clock,
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    label: "Scheduled",
  },
  error: {
    icon: AlertCircle,
    color: "text-red-700",
    bg: "bg-red-50 border-red-200",
    label: "Error",
  },
};

export default function Files() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selected, setSelected] = useState([]);

  const filtered = files.filter((f) => {
    const matchSearch =
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.job.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || f.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const toggleSelect = (id) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );

  const toggleAll = () =>
    setSelected(
      selected.length === filtered.length ? [] : filtered.map((f) => f.id),
    );

  const deleteSelected = () => {
    setFiles((fs) => fs.filter((f) => !selected.includes(f.id)));
    setSelected([]);
  };
  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      setLoading(true);

      const { data } = await axios.get(`${BASE_URL}/files/all`);

      const mappedFiles = data?.data.map((file) => ({
        id: file.id,
        name: file.file_name,
        job: file.job_name,
        service: file.service,
        total: file.total_record,
        processed: file.processed_record,
        status: file.status.toLowerCase(),
        uploaded: new Date(file.upload_date).toLocaleString(),
        responseTable: file.response_table_name,
        scheduleTime: file.schedule_time,
        jobStart: file.job_start_date,
        jobEnd: file.job_end_date,
        balanceLimit: file.balance_limit,
        removeSub: file.remove_sub,
        removeUnsub: file.remove_unsub,
      }));

      setFiles(mappedFiles);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  if (loading) return <LoaderSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Files</h1>
          <p className="text-sm text-slate-500 mt-1">
            {files.length} uploaded lead files
          </p>
        </div>
        {/* {selected.length > 0 && (
          <button
            onClick={deleteSelected}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                       bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-all"
          >
            <Trash2 size={15} /> Delete {selected.length} selected
          </button>
        )} */}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input-field pl-9"
            placeholder="Search by file or job name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
          {["all", "completed", "running", "scheduled", "error"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all
                ${
                  filterStatus === s
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
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
                  checked={
                    selected.length === filtered.length && filtered.length > 0
                  }
                  onChange={toggleAll}
                  className="accent-indigo-600 cursor-pointer"
                />
              </th>
              {[
                "File",
                "Job",
                "Service",
                "Total",
                "Processed",

                "Status",
                "Uploaded",
                "",
              ].map((h) => (
                <th
                  key={h}
                  className="text-left text-xs text-slate-400 font-semibold px-3 py-3 uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="text-center py-12 text-slate-400 text-sm"
                >
                  No files match your filter.
                </td>
              </tr>
            ) : (
              filtered.map((file) => {
                const cfg = statusConfig[file.status];
                const Icon = cfg.icon;
                return (
                  <tr
                    key={file.id}
                    className={`border-b border-slate-100 last:border-0 transition-colors
                    ${selected.includes(file.id) ? "bg-indigo-50/60" : "hover:bg-slate-50/70"}`}
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
                        <FileText
                          size={15}
                          className="text-indigo-500 flex-shrink-0"
                        />
                        <span className="text-slate-700 font-medium font-mono text-xs truncate max-w-[140px]">
                          {file.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-slate-500">{file.job}</td>
                    <td className="px-3 py-3.5 text-slate-500">
                      {file.service}
                    </td>
                    <td className="px-3 py-3.5 text-slate-700 text-xs font-medium">
                      {file?.total.toLocaleString()}
                    </td>
                    <td className="px-3 py-3.5 text-slate-700 text-xs font-medium">
                      {file.processed.toLocaleString()}
                    </td>
                    <td className="px-3 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-semibold ${cfg.bg} ${cfg.color}`}
                      >
                        <Icon
                          size={11}
                          className={
                            file.status === "running" ? "animate-spin" : ""
                          }
                        />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-slate-400 text-xs font-mono whitespace-nowrap">
                      {file.uploaded}
                    </td>
                    <td className="px-3 py-3.5">
                      <button
                        className="text-slate-400 hover:text-indigo-600 transition-colors p-1 rounded-md hover:bg-indigo-50"
                        title="Download"
                      >
                        <Download size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400 text-center">
        Showing {filtered.length} of {files.length} files
      </p>
    </div>
  );
}
