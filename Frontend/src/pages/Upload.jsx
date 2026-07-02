import { useState, useRef } from "react";
import {
  UploadCloud,
  FileText,
  X,
  CheckCircle2,
  Info,
  DollarSign,
  Layers,
  Trash2,
  RefreshCcw,
  Calendar,
} from "lucide-react";
import axios from "axios";
import { BASE_URL } from "../config";
const SERVICES = ["MIS", "HIS", "HBS"];

const initialForm = {
  jobName: "",
  scheduleTime: "",
  balance_limit: "",
  service: "",
  remove_sub: true,
  remove_unsub: false,
  days: "",
  file: null,
};

export default function Upload() {
  const [form, setForm] = useState(initialForm);
  const [dragOver, setDragOver] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});
  const fileRef = useRef();

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const handleFile = (file) => {
    if (file && file.name.endsWith(".txt")) {
      set("file", file);
    } else {
      setErrors((e) => ({ ...e, file: "Only .txt files are accepted." }));
    }
  };

  const validate = () => {
    const e = {};
    if (!form.jobName.trim()) e.jobName = "Job name is required.";
    if (!form.scheduleTime) e.scheduleTime = "Schedule time is required.";
    if (!form.balance_limit) e.balance_limit = "Balance limit is required.";
    if (!form.service) e.service = "Select a service.";
    if (!form.file) e.file = "Upload a .txt file.";
    if (form.remove_unsub && !form.days) e.days = "Enter number of days.";
    return e;
  };
  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    try {
      const formData = new FormData();

      formData.append("file", form.file);
      formData.append("jobName", form.jobName);
      formData.append("scheduleTime", form.scheduleTime);
      formData.append("balance_limit", form.balance_limit);
      formData.append("service", form.service);
      formData.append("remove_sub", form.remove_sub);
      formData.append("remove_unsub", form.remove_unsub);
      formData.append("days", form.days);

      await axios.post(`${BASE_URL}/files/upload`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
    } catch (error) {
      console.error("Error uploading file:", error);
    } finally {
      setSubmitted(true);
    }
  };

  const reset = () => {
    setForm(initialForm);
    setErrors({});
    setSubmitted(false);
  };

  const Checkbox = ({ checked, onChange, label, description }) => (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5 flex-shrink-0">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={onChange}
        />
        <div
          className={`w-[18px] h-[18px] rounded border-2 transition-all duration-150
          ${
            checked
              ? "bg-indigo-600 border-indigo-600"
              : "bg-white border-slate-300 group-hover:border-indigo-400"
          }`}
        />
        {checked && (
          <svg
            className="absolute inset-0 w-[18px] h-[18px] pointer-events-none"
            viewBox="0 0 18 18"
          >
            <path
              d="M4 9l3.5 3.5L14 6"
              stroke="white"
              strokeWidth="2.2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <div>
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
    </label>
  );

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center">
          <CheckCircle2 size={32} className="text-emerald-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            Job Queued Successfully
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            <span className="text-indigo-600 font-semibold">
              "{form.jobName}"
            </span>{" "}
            has been submitted and scheduled.
          </p>
        </div>
        <div className="card text-left w-full max-w-sm text-sm space-y-3 mt-2">
          {[
            ["Service", form.service],
            ["Scheduled", form.scheduleTime],
            ["Balance Limit", `$${form.balance_limit}`],
            ["File", form.file?.name],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-slate-400 font-medium">{k}</span>
              <span className="text-slate-700 font-semibold truncate ml-4 max-w-[180px]">
                {v}
              </span>
            </div>
          ))}
        </div>
        <button onClick={reset} className="btn-primary mt-2">
          <RefreshCcw size={15} /> Upload Another Job
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Upload Job</h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure and schedule a new lead generation job.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Job Details */}
        <div className="card space-y-5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Layers size={13} /> Job Details
          </h2>

          <div>
            <label className="label">Job Name</label>
            <input
              className="input-field"
              placeholder="e.g. Health Campaign"
              maxLength={50}
              value={form.jobName}
              onChange={(e) => set("jobName", e.target.value)}
            />
            {errors.jobName && (
              <p className="text-xs text-red-500 mt-1.5">{errors.jobName}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label flex items-center gap-1.5">
                <Calendar size={11} /> Schedule Time
              </label>
              <input
                type="datetime-local"
                className="input-field"
                min={getMinDateTime()}
                value={form.scheduleTime}
                onChange={(e) => set("scheduleTime", e.target.value)}
              />
              {errors.scheduleTime && (
                <p className="text-xs text-red-500 mt-1.5">
                  {errors.scheduleTime}
                </p>
              )}
            </div>

            <div>
              <label className="label flex items-center gap-1.5">
                <DollarSign size={11} /> Balance Limit
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="input-field pl-7"
                  placeholder="100"
                  value={form.balance_limit}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "" || Number(value) <= 100) {
                      set("balance_limit", value);
                    }
                  }}
                />
              </div>
              {errors.balance_limit && (
                <p className="text-xs text-red-500 mt-1.5">
                  {errors.balance_limit}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="label">Service</label>
            <select
              className="input-field"
              value={form.service}
              onChange={(e) => set("service", e.target.value)}
            >
              <option value="">Select a service…</option>
              {SERVICES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {errors.service && (
              <p className="text-xs text-red-500 mt-1.5">{errors.service}</p>
            )}
          </div>
        </div>

        {/* List Filtering */}
        <div className="card space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Trash2 size={13} /> List Filtering
          </h2>

          <Checkbox
            checked={form.remove_sub}
            onChange={(e) => set("remove_sub", e.target.checked)}
            label="Remove Subscribed"
            description="Strip out contacts who are currently subscribed."
          />

          <Checkbox
            checked={form.remove_unsub}
            onChange={(e) => set("remove_unsub", e.target.checked)}
            label="Remove Unsubscribed"
            description="Strip contacts who unsubscribed within a time window."
          />

          {form.remove_unsub && (
            <div className="ml-7 pl-4 border-l-2 border-indigo-200 space-y-1.5">
              <label className="label flex items-center gap-1.5">
                <Calendar size={11} /> Lookback Window (days)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                className="input-field max-w-[200px]"
                placeholder="e.g. 30"
                value={form.days}
                onChange={(e) => {
                  const value = e.target.value;

                  if (
                    value === "" ||
                    (Number(value) >= 1 && Number(value) <= 100)
                  ) {
                    set("days", value);
                  }
                }}
              />
              <p className="text-xs text-slate-400 flex items-center gap-1.5 pt-0.5">
                <Info size={11} className="text-indigo-400" />
                Contacts who unsubscribed within this many days will be removed.
              </p>
              {errors.days && (
                <p className="text-xs text-red-500">{errors.days}</p>
              )}
            </div>
          )}
        </div>

        {/* File Upload */}
        <div className="card space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <UploadCloud size={13} /> Lead File
          </h2>

          {form.file ? (
            <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3">
              <FileText size={18} className="text-indigo-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate">
                  {form.file.name}
                </p>
                <p className="text-xs text-slate-400">
                  {(form.file.size / 1024).toFixed(1)} KB · .txt
                </p>
              </div>
              <button
                type="button"
                onClick={() => set("file", null)}
                className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-50"
              >
                <X size={15} />
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFile(e.dataTransfer.files[0]);
              }}
              onClick={() => fileRef.current?.click()}
              className={`
                border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-all duration-200
                ${
                  dragOver
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50"
                }
              `}
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors
                ${dragOver ? "bg-indigo-100" : "bg-slate-100"}`}
              >
                <UploadCloud
                  size={22}
                  className={dragOver ? "text-indigo-600" : "text-slate-400"}
                />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-600">
                  Drop your file here
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  or{" "}
                  <span className="text-indigo-600 font-medium">
                    click to browse
                  </span>{" "}
                  · .txt only
                </p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".txt"
                className="hidden"
                onChange={(e) => handleFile(e.target.files[0])}
              />
            </div>
          )}
          {errors.file && <p className="text-xs text-red-500">{errors.file}</p>}
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button type="button" onClick={reset} className="btn-ghost">
            Reset
          </button>
          <button type="submit" className="btn-primary">
            <UploadCloud size={16} /> Submit Job
          </button>
        </div>
      </form>
    </div>
  );
}
