import { Search, Briefcase, AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import api from "../lib/api";
import { toastError } from "../helper/toast";
import LoaderSpinner from "../components/loader";

const MAX_SCHEDULES = 5;

const emptyScheduleForm = () => ({
  generate_time: "",
  process_start_time: "",
  batch_size: "",
  label: "",
});

export default function Services() {
  const [services, setServices] = useState([]);
  const [centers, setCenters] = useState([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const [showPanel, setShowPanel] = useState(false);
  const [selectedService, setSelectedService] = useState(null);

  const [assignedQuota, setAssignedQuota] = useState(0);
  const [remainingQuota, setRemainingQuota] = useState(100);

  const [assignments, setAssignments] = useState([]);
  const [saving, setSaving] = useState(false);

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleService, setScheduleService] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [scheduleForm, setScheduleForm] = useState(emptyScheduleForm());
  const [savingSchedule, setSavingSchedule] = useState(false);

  const isOverQuota = assignedQuota > 100;
  const isFullyAllocated = assignedQuota === 100;

  const fetchServices = async () => {
    try {
      setLoading(true);

      const response = await api.get("/services/all");

      if (response.data.success) {
        setServices(response.data.data);
      }
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCenters = async () => {
    try {
      const response = await api.get("/centers/all");

      if (response.data.success) {
        setCenters(response.data.data);
      }
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    fetchServices();
    fetchCenters();
  }, []);

  const recalcQuota = (list) => {
    const total = list.reduce(
      (sum, item) => sum + Number(item.percentage_quota || 0),
      0,
    );

    const rounded = Number(total.toFixed(2));

    setAssignedQuota(rounded);
    setRemainingQuota(Number((100 - rounded).toFixed(2)));
  };

  const openDrawer = async (service) => {
    try {
      setSelectedService(service);
      setShowPanel(true);

      const response = await api.get(`/services/${service.id}/quota`);

      if (response.data.success) {
        const data = response.data.data;

        setAssignedQuota(data.assigned_quota);
        setRemainingQuota(data.remaining_quota);

        setAssignments(
          data.centers.map((item) => ({
            center_id: item.center_id,
            center_name: item.center_name,
            percentage_quota: item.percentage_quota,
            poc_email: item.poc_email || "",
            cc_email: item.cc_email || "",
          })),
        );
      }
    } catch (error) {
      console.log(error);
    }
  };

  const addCenter = (centerId) => {
    const center = centers.find((c) => Number(c.id) === Number(centerId));

    if (!center) return;

    const exists = assignments.some(
      (item) => Number(item.center_id) === Number(center.id),
    );

    if (exists) {
      toastError("Center already assigned");
      return;
    }

    setAssignments([
      ...assignments,
      {
        center_id: center.id,
        center_name: center.name,
        percentage_quota: "",
        poc_email: "",
        cc_email: "",
      },
    ]);
  };

  const removeCenter = (index) => {
    const updated = assignments.filter((_, i) => i !== index);

    setAssignments(updated);
    recalcQuota(updated);
  };

  const updateQuota = (index, value) => {
    const updated = [...assignments];

    updated[index].percentage_quota = value;

    setAssignments(updated);
    recalcQuota(updated);
  };

  const saveAssignment = async () => {
    if (isOverQuota) {
      toastError(
        `Total quota is ${assignedQuota}%, which is over 100%. Please reduce one or more centers before saving.`,
      );
      return;
    }

    const missingPoc = assignments.find((item) => !item.poc_email?.trim());

    if (missingPoc) {
      toastError(
        `POC Email is required for ${missingPoc.center_name}. Please fill it in before saving.`,
      );
      return;
    }

    if (assignedQuota < 100) {
      const proceed = window.confirm(
        `Only ${assignedQuota}% of this service's quota is allocated (${remainingQuota}% remaining unassigned). Save anyway?`,
      );

      if (!proceed) return;
    }

    try {
      setSaving(true);

      const payload = {
        service_id: selectedService.id,
        assignments,
      };

      const response = await api.post("/centers/assign-service", payload);

      if (response.data.success) {
        setShowPanel(false);
      }
    } catch (error) {
      // Error toast handled by API interceptor
    } finally {
      setSaving(false);
    }
  };

  const formatScheduleTime = (time) => {
    if (!time) return "-";

    const [hours, minutes] = time.split(":");
    const date = new Date();

    date.setHours(Number(hours), Number(minutes), 0);

    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const toTimeInputValue = (time) => {
    if (!time) return "";

    const [hours, minutes] = time.split(":");

    return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
  };

  const formatNumber = (value) => {
    if (value == null || value === "") return "-";
    return Number(value).toLocaleString();
  };

  const loadSchedules = async (serviceId) => {
    const response = await api.get(`/services/${serviceId}/schedules`);

    if (response.data.success) {
      setSchedules(response.data.data.schedules || []);
    }
  };

  const openScheduleModal = async (service) => {
    setScheduleService(service);
    setShowScheduleModal(true);
    setShowScheduleForm(false);
    setEditingSchedule(null);
    setScheduleForm(emptyScheduleForm());

    try {
      setLoadingSchedules(true);
      await loadSchedules(service.id);
    } catch (error) {
      console.log(error);
    } finally {
      setLoadingSchedules(false);
    }
  };

  const closeScheduleModal = () => {
    setShowScheduleModal(false);
    setScheduleService(null);
    setSchedules([]);
    setShowScheduleForm(false);
    setEditingSchedule(null);
    setScheduleForm(emptyScheduleForm());
    fetchServices();
  };

  const openAddScheduleForm = () => {
    if (schedules.length >= MAX_SCHEDULES) {
      toastError(`Maximum ${MAX_SCHEDULES} file schedules allowed per service`);
      return;
    }

    setEditingSchedule(null);
    setScheduleForm(emptyScheduleForm());
    setShowScheduleForm(true);
  };

  const openEditScheduleForm = (schedule) => {
    setEditingSchedule(schedule);
    setScheduleForm({
      generate_time: toTimeInputValue(schedule.generate_time),
      process_start_time: toTimeInputValue(schedule.process_start_time),
      batch_size: String(schedule.batch_size ?? ""),
      label: schedule.label || "",
    });
    setShowScheduleForm(true);
  };

  const cancelScheduleForm = () => {
    setShowScheduleForm(false);
    setEditingSchedule(null);
    setScheduleForm(emptyScheduleForm());
  };

  const saveSchedule = async () => {
    if (!scheduleForm.generate_time) {
      toastError("Generate time is required");
      return;
    }

    if (!scheduleForm.process_start_time) {
      toastError("Process start time is required");
      return;
    }

    if (!scheduleForm.batch_size || Number(scheduleForm.batch_size) <= 0) {
      toastError("Batch size must be greater than 0");
      return;
    }

    const payload = {
      generate_time: scheduleForm.generate_time,
      process_start_time: scheduleForm.process_start_time,
      batch_size: Number(scheduleForm.batch_size),
      label: scheduleForm.label.trim() || null,
    };

    try {
      setSavingSchedule(true);

      let response;

      if (editingSchedule) {
        response = await api.put(
          `/services/schedules/${editingSchedule.id}`,
          payload,
        );
      } else {
        response = await api.post(
          `/services/${scheduleService.id}/schedules`,
          payload,
        );
      }

      if (response.data.success) {
        setSchedules(response.data.data.schedules || []);
        cancelScheduleForm();
      }
    } catch (error) {
      // Error toast handled by API interceptor
    } finally {
      setSavingSchedule(false);
    }
  };

  const deleteSchedule = async (schedule) => {
    const proceed = window.confirm(
      `Delete schedule (generate ${formatScheduleTime(schedule.generate_time)}, ${formatNumber(schedule.batch_size)} records)?`,
    );

    if (!proceed) return;

    try {
      const response = await api.delete(`/services/schedules/${schedule.id}`);

      if (response.data.success) {
        setSchedules(response.data.data.schedules || []);
        if (editingSchedule?.id === schedule.id) {
          cancelScheduleForm();
        }
      }
    } catch (error) {
      // Error toast handled by API interceptor
    }
  };

  const filteredServices = services.filter((service) =>
    service.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-6">
      <div className="flex justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Services</h1>
          <p className="text-sm text-gray-500">
            Manage service quotas and file generation schedules (max {MAX_SCHEDULES} per service)
          </p>
        </div>
      </div>

      <div className="mb-5 max-w-md relative">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />

        <input
          className="input-field w-full pl-9"
          placeholder="Search service..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center">
            <LoaderSpinner />
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-gray-50 rounded-full p-4 mb-3">
              <Briefcase size={24} className="text-gray-300" />
            </div>
            <p className="text-gray-600 font-medium">No services found</p>
            <p className="text-sm text-gray-400 mt-1">
              Try a different search term
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left">#</th>
                <th className="px-6 py-3 text-left">Service</th>
                <th className="px-6 py-3 text-left">File Schedules</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredServices.map((service, index) => (
                <tr key={service.id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-4">{index + 1}</td>

                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Briefcase size={18} className="text-blue-600" />
                      {service.name}
                    </div>
                  </td>

                  <td className="px-6 py-4 text-gray-600">
                    {(service.schedules?.length || 0) > 0 ? (
                      <span>
                        {service.schedules.length} / {MAX_SCHEDULES} slot
                        {service.schedules.length === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="text-amber-600">No schedules</span>
                    )}
                  </td>

                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openScheduleModal(service)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-sm inline-flex items-center gap-1.5"
                      >
                        <Pencil size={14} />
                        Schedules
                      </button>

                      <button
                        onClick={() => openDrawer(service)}
                        className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-lg text-sm"
                      >
                        Modify
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && filteredServices.length > 0 && (
        <p className="text-xs text-gray-400 mt-3">
          {filteredServices.length} service
          {filteredServices.length === 1 ? "" : "s"}
        </p>
      )}

      {showScheduleModal && scheduleService && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-semibold">
                  File Schedules — {scheduleService.name}
                </h2>
                <p className="text-sm text-gray-500">
                  Up to {MAX_SCHEDULES} daily slots: generate file → schedule processing
                </p>
              </div>
              <button onClick={closeScheduleModal}>✕</button>
            </div>

            {loadingSchedules ? (
              <div className="py-10 flex justify-center">
                <LoaderSpinner />
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-4">
                  <p className="text-sm text-gray-600">
                    {schedules.length} / {MAX_SCHEDULES} slots used
                  </p>

                  {!showScheduleForm && (
                    <button
                      onClick={openAddScheduleForm}
                      disabled={schedules.length >= MAX_SCHEDULES}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Plus size={14} />
                      Add schedule
                    </button>
                  )}
                </div>

                {schedules.length === 0 && !showScheduleForm && (
                  <div className="border border-dashed rounded-lg p-8 text-center text-gray-500 mb-4">
                    No schedules yet. Add one to auto-generate files for this service.
                  </div>
                )}

                {schedules.length > 0 && (
                  <div className="border rounded-lg overflow-hidden mb-4">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-2 text-left">Generate at</th>
                          <th className="px-4 py-2 text-left">Process at</th>
                          <th className="px-4 py-2 text-left">Batch size</th>
                          <th className="px-4 py-2 text-left">Label</th>
                          <th className="px-4 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schedules.map((schedule) => (
                          <tr key={schedule.id} className="border-b last:border-b-0">
                            <td className="px-4 py-3">
                              {formatScheduleTime(schedule.generate_time)}
                            </td>
                            <td className="px-4 py-3">
                              {formatScheduleTime(schedule.process_start_time)}
                            </td>
                            <td className="px-4 py-3">
                              {formatNumber(schedule.batch_size)}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {schedule.label || "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex gap-2">
                                <button
                                  onClick={() => openEditScheduleForm(schedule)}
                                  className="text-indigo-600 hover:text-indigo-800"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => deleteSchedule(schedule)}
                                  className="text-red-600 hover:text-red-800 inline-flex items-center gap-1"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {showScheduleForm && (
                  <div className="border rounded-lg p-4 bg-gray-50 mb-4">
                    <h3 className="font-medium mb-4">
                      {editingSchedule ? "Edit schedule" : "Add schedule"}
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Generate file at
                        </label>
                        <input
                          type="time"
                          className="input-field w-full"
                          value={scheduleForm.generate_time}
                          onChange={(e) =>
                            setScheduleForm({
                              ...scheduleForm,
                              generate_time: e.target.value,
                            })
                          }
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Start processing at
                        </label>
                        <input
                          type="time"
                          className="input-field w-full"
                          value={scheduleForm.process_start_time}
                          onChange={(e) =>
                            setScheduleForm({
                              ...scheduleForm,
                              process_start_time: e.target.value,
                            })
                          }
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Batch size (records)
                        </label>
                        <input
                          type="number"
                          min="1"
                          className="input-field w-full"
                          placeholder="e.g. 1000000"
                          value={scheduleForm.batch_size}
                          onChange={(e) =>
                            setScheduleForm({
                              ...scheduleForm,
                              batch_size: e.target.value,
                            })
                          }
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Label (optional)
                        </label>
                        <input
                          type="text"
                          className="input-field w-full"
                          placeholder="Morning run"
                          value={scheduleForm.label}
                          onChange={(e) =>
                            setScheduleForm({
                              ...scheduleForm,
                              label: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3">
                      <button
                        onClick={cancelScheduleForm}
                        className="px-4 py-2 border rounded-lg hover:bg-white"
                      >
                        Cancel
                      </button>

                      <button
                        onClick={saveSchedule}
                        disabled={savingSchedule}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {savingSchedule ? "Saving..." : "Save schedule"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={closeScheduleModal}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showPanel && (
        <div className="fixed inset-0 bg-black/30 z-50">
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white p-6 overflow-y-auto">
            <div className="flex justify-between mb-6">
              <h2 className="text-lg font-semibold">{selectedService.name}</h2>
              <button onClick={() => setShowPanel(false)}>✕</button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-2">
              <div
                className={`p-3 rounded-lg ${
                  isOverQuota ? "bg-red-50" : "bg-blue-50"
                }`}
              >
                Assigned
                <b className={isOverQuota ? "text-red-600" : ""}>
                  {" "}
                  {assignedQuota}%
                </b>
              </div>

              <div
                className={`p-3 rounded-lg ${
                  isOverQuota
                    ? "bg-red-50"
                    : isFullyAllocated
                      ? "bg-green-50"
                      : "bg-yellow-50"
                }`}
              >
                Remaining
                <b
                  className={
                    isOverQuota
                      ? "text-red-600"
                      : isFullyAllocated
                        ? ""
                        : "text-yellow-700"
                  }
                >
                  {" "}
                  {remainingQuota}%
                </b>
              </div>
            </div>

            {isOverQuota && (
              <div className="flex items-start gap-2 text-sm text-red-600 mb-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>
                  Total exceeds 100%. Reduce one or more centers before saving.
                </span>
              </div>
            )}

            {!isOverQuota && !isFullyAllocated && assignments.length > 0 && (
              <div className="flex items-start gap-2 text-sm text-yellow-700 mb-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>
                  {remainingQuota}% is still unassigned across other centers.
                </span>
              </div>
            )}

            <div className="mb-2">
              <select
                className="input-field w-full mt-3"
                value=""
                onChange={(e) => {
                  addCenter(e.target.value);
                }}
              >
                <option value="">Add Center</option>

                {centers
                  .filter(
                    (center) =>
                      !assignments.some(
                        (item) => Number(item.center_id) === Number(center.id),
                      ),
                  )
                  .map((center) => (
                    <option key={center.id} value={center.id}>
                      {center.name}
                    </option>
                  ))}
              </select>
            </div>

            {assignments.map((item, index) => (
              <div
                key={index}
                className="border rounded-lg p-4 mb-3 bg-gray-50"
              >
                <div className="flex justify-between items-center mb-3">
                  <div className="font-medium">{item.center_name}</div>

                  <button
                    className="text-red-500 text-sm"
                    onClick={() => removeCenter(index)}
                  >
                    Remove
                  </button>
                </div>

                <label className="label">Percentage Quota</label>

                <input
                  type="text"
                  inputMode="decimal"
                  className="input-field w-full mb-3"
                  value={item.percentage_quota}
                  onChange={(e) => {
                    const value = e.target.value;
                    const regex = /^(100(\.00?)?|([0-9]{1,2})(\.[0-9]{0,2})?)$/;

                    if (value === "" || regex.test(value)) {
                      updateQuota(index, value);
                    }
                  }}
                  placeholder="50.00"
                />

                <label className="label">
                  POC Email <span className="text-red-500">*</span>
                </label>

                <input
                  type="email"
                  required
                  className={`input-field w-full mb-3 ${
                    !item.poc_email?.trim()
                      ? "border-red-300 focus:border-red-400"
                      : ""
                  }`}
                  placeholder="poc@example.com"
                  value={item.poc_email}
                  onChange={(e) => {
                    const updated = [...assignments];
                    updated[index].poc_email = e.target.value;
                    setAssignments(updated);
                  }}
                />

                {!item.poc_email?.trim() && (
                  <p className="text-xs text-red-500 -mt-2 mb-3">
                    POC email is required
                  </p>
                )}

                <label className="label">CC Emails</label>

                <input
                  type="text"
                  className="input-field w-full"
                  placeholder="a@test.com,b@test.com"
                  value={item.cc_email}
                  onChange={(e) => {
                    const updated = [...assignments];
                    updated[index].cc_email = e.target.value;
                    setAssignments(updated);
                  }}
                />
              </div>
            ))}

            <button
              onClick={saveAssignment}
              disabled={isOverQuota || saving}
              className={`w-full text-white py-2 rounded-lg mt-6 ${
                isOverQuota || saving
                  ? "bg-indigo-300 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {saving ? "Saving..." : "Save Allocation"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
