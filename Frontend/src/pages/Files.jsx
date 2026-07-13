import {
  FileText,
  Download,
  Trash2,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Eye,
  X,
  BriefcaseBusiness,
  Wallet,
  Mail,
  SendIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import axios from "axios";
import { BASE_URL } from "../config";
import LoaderSpinner from "../components/loader";
import { formatNumber, formatDateTime } from "../helper/formatters";
const statusConfig = {
  completed: {
    icon: CheckCircle2,
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
    label: "Completed",
  },
  processing: {
    icon: RefreshCw,
    color: "text-indigo-700",
    bg: "bg-indigo-50 border-indigo-200",
    label: "processing",
  },
  pending: {
    icon: Clock,
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    label: "pending",
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
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selected, setSelected] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showEmailDrawer, setShowEmailDrawer] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 1,
  });
  const [emailData, setEmailData] = useState({
    to: "",
    cc: "",
    subject: "",
    message: "",
  });

  const handleEmail = (file) => {
    setSelectedFile(file);

    setEmailData({
      to: "",
      cc: "",
      subject: "",
      message: "",
    });

    setShowEmailDrawer(true);
  };
  const handleView = (file) => {
    console.log(file);
    setSelectedFile(file);

    setShowDrawer(true);
  };
  // const filtered = files?.filter((f) => {
  //   const matchSearch =
  //     f.name.toLowerCase().includes(search.toLowerCase()) ||
  //     f.job.toLowerCase().includes(search.toLowerCase());
  //   const matchStatus = filterStatus === "all" || f.status === filterStatus;
  //   return matchSearch && matchStatus;
  // });

  const getFiles = async () => {
    try {
      setLoading(true);

      const res = await axios.get(`${BASE_URL}/files/all`, {
        params: {
          page,
          limit,
          search,
          status: filterStatus,
        },
      });

      if (res.data.success) {
        setFiles(res.data.data.files);
        setPagination(res.data.data.pagination);
      }
    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [search, filterStatus]);

  useEffect(() => {
    getFiles();
  }, [page, search, filterStatus]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchText);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchText]);
  const handleDownload = async (sendEmailFlag) => {
    try {
      setLoading(true);
      const response = await axios.post(
        `${BASE_URL}/files/export`,
        {
          id: selectedFile.id,
          unsub_days: selectedFile.days || 0,
          unsub_remove: selectedFile.remove_unsub,
          sub_remove: selectedFile.remove_sub,
          send_email: sendEmailFlag,
          balance_limit: selectedFile.balance_limit,
          service_id: selectedFile.service_id,
        },
        {
          responseType: "blob",
        },
      );
      return;
      const contentDisposition = response.headers["content-disposition"];
      const baseName = selectedFile.file_name.replace(/\.[^/.]+$/, "");
      let fileName = `export_${baseName}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) fileName = match[1];
      }

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };
  const handleSendEmail = async () => {
    try {
      const payload = {
        id: selectedFile.id,
        // unsub_days: selectedFile.days,
        // unsub_remove: selectedFile.removeUnsub ? 1 : 0,
        to: emailData.to,
        cc: emailData.cc,
        subject: emailData.subject,
        message: emailData.message,
      };

      const response = await axios.post(
        `${BASE_URL}/files/send-email`,
        payload,
      );

      if (response.data.success) {
        alert("Email sent successfully!");
        setShowEmailDrawer(false);
      } else {
        alert(response.data.message);
      }
    } catch (error) {
      console.error(error);

      alert(error.response?.data?.message || "Failed to send email.");
    }
  };
  if (loading) return <LoaderSpinner />;

  return (
    <>
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
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
            {["all", "completed", "processing", "pending", "error"].map((s) => (
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
        <div className="card p-0 overflow-x-scroll">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                {[
                  "File",
                  "Job",
                  "Service",
                  "Bal Limit",
                  "Total",
                  "Processed",
                  "Status",
                  "Action",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs text-slate-500 font-semibold px-4 py-3 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {files?.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="text-center py-12 text-slate-400 text-sm"
                  >
                    No files match your filter.
                  </td>
                </tr>
              ) : (
                files?.map((file) => {
                  const cfg = statusConfig[file?.status.toLowerCase()] || {};
                  const Icon = cfg?.icon;
                  return (
                    <tr
                      key={file.id}
                      className={`border-b border-slate-100 last:border-0 transition-colors
                    ${selected.includes(file.id) ? "bg-indigo-50/60" : "hover:bg-slate-50/70"}`}
                    >
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-2">
                          <FileText
                            size={15}
                            className="text-indigo-500 flex-shrink-0"
                          />
                          <span className="text-slate-700 font-medium font-mono text-xs truncate max-w-[140px]">
                            {file.file_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 overflow-hidden max-w-[130px] truncate whitespace-nowrap text-ellipsis ">
                        {file.job_name}
                      </td>
                      <td className="px-3 py-3.5 ">{file.service}</td>
                      <td className="px-3 py-3.5 ">{file.balance_limit}</td>
                      <td className="px-3 py-3.5 tracking-wider whitespace-nowrap text-slate-700 text-xs font-medium">
                        {formatNumber(file?.total_record)}
                      </td>
                      <td className="px-3 py-3.5 tracking-wider whitespace-nowrap text-slate-700 text-xs font-medium">
                        {formatNumber(file?.processed_record)}
                      </td>
                      <td className="px-3 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-semibold ${cfg?.bg} ${cfg?.color}`}
                        >
                          <Icon
                            size={11}
                            className={
                              file.status === "processing" ? "animate-spin" : ""
                            }
                          />
                          {cfg?.label}
                        </span>
                      </td>

                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleView(file)}
                            className={`${file.status === "pending" ? "hidden" : "block"} inline-flex items-center gap-1 rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium
                               text-indigo-600 transition hover:bg-gray-200`}
                          >
                            <Eye size={15} />
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-5">
          <p className="text-sm text-gray-500">
            Showing {(pagination.page - 1) * pagination.limit + 1} -
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
            {pagination.total}
          </p>

          <div className="flex items-center gap-2">
            <button
              disabled={pagination.page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-2 border rounded disabled:opacity-50"
            >
              Previous
            </button>

            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(
              (p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-2 rounded border ${
                    p === pagination.page ? "bg-indigo-600 text-white" : ""
                  }`}
                >
                  {p}
                </button>
              ),
            )}

            <button
              disabled={pagination.page === pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-2 border rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
      <>
        {/* Backdrop */}
        {showDrawer && (
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setShowDrawer(false)}
          />
        )}

        {/* Drawer */}
        <div
          className={`fixed z-50 bg-white shadow-2xl transition-all duration-300
      inset-x-0 bottom-0  rounded-t-2xl w-[320px]
      md:top-0 md:right-0 left-auto md:bottom-auto h-full md:w-[420px] md:rounded-none
      ${
        showDrawer
          ? "translate-y-0 md:translate-x-0"
          : "translate-y-full md:translate-y-0 md:translate-x-full"
      }`}
        >
          {/* Header */}
          <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b bg-white">
            <div>
              <h2 className="text-lg font-semibold capitalize">
                {selectedFile?.job_name}
              </h2>
              <p className="text-sm text-slate-500">
                View processing information
              </p>
            </div>

            <button
              onClick={() => setShowDrawer(false)}
              className="p-2 rounded-lg bg-gray-100 text-red-500 hover:bg-red-50"
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          {selectedFile && (
            <div className="p-6 space-y-6 overflow-y-auto h-[calc(90vh-72px)] md:h-[calc(100vh-72px)]">
              <div className="flex items-center justify-center gap-10">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-indigo-100">
                    <FileText size={18} className="text-indigo-600" />
                  </div>

                  <div>
                    <p className="text-sm text-gray-700">File Name</p>
                    <p className="font-medium break-all">
                      {selectedFile.file_name}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100">
                    <BriefcaseBusiness size={18} className="text-emerald-600" />
                  </div>

                  <div>
                    <p className="text-sm text-gray-700">Service</p>
                    <p>{selectedFile.service}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm text-gray-600">Total</p>
                  <p className="text-lg font-semibold">
                    {formatNumber(selectedFile.total_record)}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm text-gray-600">Processed</p>
                  <p className="text-lg font-semibold">
                    {formatNumber(selectedFile.processed_record)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6 justify-center">
                <div>
                  <p className="text-sm text-gray-600">Scheduled At</p>
                  <p>{formatDateTime(selectedFile.schedule_time)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Completed At</p>
                  <p>
                    {selectedFile.job_end_date
                      ? formatDateTime(selectedFile.job_end_date)
                      : "Not completed yet"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-100">
                  <Wallet size={18} className="text-amber-600" />
                </div>

                <div className="flex-1">
                  <p className="text-xs text-gray-500">Balance Limit</p>
                  <input
                    type="number"
                    value={selectedFile.balance_limit}
                    onChange={(e) =>
                      setSelectedFile({
                        ...selectedFile,
                        balance_limit: e.target.value,
                      })
                    }
                    onBlur={() => {
                      let value = Number(selectedFile.balance_limit);

                      if (isNaN(value)) value = 10;
                      if (value < 10) value = 10;
                      if (value > 100) value = 100;

                      setSelectedFile({
                        ...selectedFile,
                        balance_limit: value,
                      });
                    }}
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <strong>Applied Filters</strong>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedFile?.remove_sub ?? false}
                    onChange={(e) =>
                      setSelectedFile((prev) => ({
                        ...prev,
                        removeSub: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <span className="text-sm text-slate-700">
                    Remove Subscribers
                  </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedFile?.remove_unsub ?? false}
                    onChange={(e) =>
                      setSelectedFile((prev) => ({
                        ...prev,
                        remove_unsub: e.target.checked,
                        // Clear the days when unchecked (optional)
                        days: e.target.checked ? (prev.days ?? "") : "",
                      }))
                    }
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <span className="text-sm text-slate-700">
                    Remove Unsubscribers
                  </span>
                </label>
                {selectedFile?.remove_unsub && (
                  <div className="ml-7">
                    <label className="block text-sm text-gray-600 mb-1">
                      Remove unsubscribers older than (days)
                    </label>

                    <input
                      type="number"
                      min="1"
                      max="100"
                      placeholder="Enter days"
                      value={selectedFile?.days ?? ""}
                      onChange={(e) => {
                        const value = Number(e.target.value);

                        setSelectedFile((prev) => ({
                          ...prev,
                          days:
                            e.target.value === ""
                              ? ""
                              : Math.min(Math.max(value, 1), 100),
                        }));
                      }}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-4 justify-center md:gap-0 md:justify-between items-center ">
                <button
                  onClick={() => handleDownload(false)}
                  className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2.5 text-white font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  disabled={
                    selectedFile?.status !== "COMPLETED"
                    // || !selectedFile?.days
                  }
                >
                  <Download size={18} />
                  Download File
                </button>
                <button
                  onClick={() => handleDownload(true)}
                  className={
                    "inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2.5 text-white hover:bg-indigo-700"
                  }
                  disabled={
                    selectedFile?.status !== "COMPLETED"
                    // || !selectedFile?.days
                  }
                >
                  <SendIcon size={16} />
                  Send Email
                </button>
              </div>
            </div>
          )}
        </div>
      </>
      <>
        {showEmailDrawer && (
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setShowEmailDrawer(false)}
          />
        )}

        <div
          className={`fixed z-50 bg-white shadow-2xl transition-all duration-300
      inset-x-0 bottom-0  rounded-t-2xl w-[320px]
      md:top-0 md:right-0 left-auto md:bottom-auto h-full md:w-[420px] md:rounded-none ${
        showEmailDrawer ? "translate-x-0" : "translate-x-full"
      }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold"> Email Template</h2>
              <p className="text-sm text-slate-500">{selectedFile?.name}</p>
            </div>

            <button
              onClick={() => setShowEmailDrawer(false)}
              className="rounded-lg bg-gray-100 p-2 hover:bg-red-50"
            >
              <X size={18} className="text-red-500" />
            </button>
          </div>

          {/* Form */}
          <div className="space-y-5 overflow-y-auto p-6">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                To
              </label>
              <input
                type="email"
                placeholder="john@example.com"
                value={emailData.to}
                onChange={(e) =>
                  setEmailData((prev) => ({
                    ...prev,
                    to: e.target.value,
                  }))
                }
                className="w-full rounded-md border px-3 py-2 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                CC
              </label>
              <input
                type="text"
                placeholder="john@example.com, jane@example.com"
                value={emailData.cc}
                onChange={(e) =>
                  setEmailData((prev) => ({
                    ...prev,
                    cc: e.target.value,
                  }))
                }
                className="w-full rounded-md border px-3 py-2 focus:border-indigo-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-500">
                Separate multiple emails with commas.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Subject
              </label>
              <input
                type="text"
                value={emailData.subject}
                placeholder="Enter Subject"
                onChange={(e) =>
                  setEmailData((prev) => ({
                    ...prev,
                    subject: e.target.value,
                  }))
                }
                className="w-full rounded-md border px-3 py-2 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Message
              </label>
              <textarea
                rows={6}
                placeholder="Write your email..."
                value={emailData.message}
                onChange={(e) =>
                  setEmailData((prev) => ({
                    ...prev,
                    message: e.target.value,
                  }))
                }
                className="w-full resize-none rounded-md border px-3 py-2 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setShowEmailDrawer(false)}
                className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                onClick={handleSendEmail}
                className={
                  "inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2 text-white hover:bg-indigo-700"
                }
              >
                <SendIcon size={16} />
                Send Email
              </button>
            </div>
          </div>
        </div>
      </>
    </>
  );
}
