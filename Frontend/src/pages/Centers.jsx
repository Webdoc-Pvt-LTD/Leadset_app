import { Search, Plus, Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import axios from "axios";
import { BASE_URL } from "../config";
import LoaderSpinner from "../components/loader";

export default function Centers() {
  const [centers, setCenters] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [centerName, setCenterName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [selectedCenter, setSelectedCenter] = useState(null);
  const [assignedQuota, setAssignedQuota] = useState(0);
  const [remainingQuota, setRemainingQuota] = useState(100);
  const [previousAssignments, setPreviousAssignments] = useState([]);
  const [services, setServices] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [assignment, setAssignment] = useState({
    service_id: "",
    percentage_quota: "",
    poc_email: "",
    cc_email: "",
  });
  const fetchCenters = async () => {
    try {
      setLoading(true);

      const response = await axios.get(`${BASE_URL}/centers/all`);

      if (response.data.success) {
        setCenters(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching centers:", error);
    } finally {
      setLoading(false);
    }
  };
  const fetchServices = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/services/all`);

      if (response.data.success) {
        setServices(response.data.data);
      }
    } catch (error) {
      console.log(error);
    }
  };
  const handleCreateCenter = async () => {
    if (!centerName.trim()) return;

    try {
      setSaving(true);

      const { data } = await axios.post(`${BASE_URL}/centers/create`, {
        name: centerName,
      });

      if (data.success) {
        setShowModal(false);
        setCenterName("");

        // Refresh list
        fetchCenters();
      }
    } catch (err) {
      console.log(err.response?.data?.message || "Failed to create center");
    } finally {
      setSaving(false);
    }
  };

  // const fetchCenterAssignment = async (centerId) => {
  //   try {
  //     const response = await axios.get(
  //       `${BASE_URL}/centers/assignments/${centerId}`,
  //     );

  //     if (response.data.success) {
  //       const assignments = response.data.data;

  //       setPreviousAssignments(assignments);

  //       const total = assignments.reduce(
  //         (sum, item) => sum + Number(item.percentage_quota),
  //         0,
  //       );

  //       setAssignedQuota(total);
  //       setRemainingQuota(100 - total);

  //       // Load first assignment in form
  //       if (assignments.length > 0) {
  //         const first = assignments[0];

  //         setAssignment({
  //           service_id: first.service_id,
  //           percentage_quota: first.percentage_quota,
  //           poc_email: first.poc_email,
  //           cc_email: first.cc_email || "",
  //         });
  //       }
  //     }
  //   } catch (error) {
  //     console.error("Error fetching assignment:", error);
  //   }
  // };

  const fetchCenterAssignment = async (centerId) => {
    try {
      const response = await axios.get(
        `${BASE_URL}/centers/assignments/${centerId}`,
      );

      if (response.data.success) {
        const data = response.data.data;

        setPreviousAssignments(data);

        setAssignments(
          data.map((item) => ({
            service_id: item.service_id,
            service_name: item.service_name,
            percentage_quota: item.percentage_quota,
            poc_email: item.poc_email,
            cc_email: item.cc_email || "",
          })),
        );
      }
    } catch (error) {
      console.log(error);
    }
  };
  useEffect(() => {
    fetchCenters();
    fetchServices();
  }, []);
  // const saveAssignment = async () => {
  //   try {
  //     const response = await axios.post(`${BASE_URL}/centers/assign-service`, {
  //       center_id: selectedCenter.id,
  //       ...assignment,
  //     });

  //     if (response.data.success) {
  //       setShowPanel(false);

  //       setAssignment({
  //         service_id: "",
  //         percentage_quota: "",
  //         poc_email: "",
  //         cc_email: "",
  //       });
  //     }
  //   } catch (error) {
  //     console.log(error.response?.data?.message || "Failed to save");
  //   }
  // };
  const saveAssignment = async () => {
    const total = assignments.reduce(
      (sum, item) => sum + Number(item.percentage_quota || 0),
      0,
    );

    if (total > 100) {
      alert("Total quota cannot exceed 100%");

      return;
    }

    try {
      const response = await axios.post(`${BASE_URL}/centers/assign-service`, {
        center_id: selectedCenter.id,
        assignments,
      });

      if (response.data.success) {
        setShowPanel(false);

        fetchCenterAssignment(selectedCenter.id);
      }
    } catch (error) {
      alert(error.response?.data?.message || "Failed to save assignment");
    }
  };

  const filteredCenters = centers.filter((center) =>
    center.name.toLowerCase().includes(search.toLowerCase()),
  );
  console.log("Assignments:", selectedServiceId);
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Centers</h1>
          <p className="text-sm text-gray-500">Manage your centers</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex-1 relative max-w-md bg-white">
          <Search
            size={18}
            className="
              absolute 
              left-3 
              top-1/2 
              -translate-y-1/2
              text-gray-400
            "
          />

          <input
            type="text"
            placeholder="Search center by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border rounded-lg input-field"
          />
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="  flex items-center gap-2  bg-indigo-600  hover:bg-indigo-500  text-white  px-4 py-2  rounded-lg  text-sm  "
        >
          <Plus size={18} />
          Create Center
        </button>
      </div>

      {/* Table */}
      <div className="bg-white card rounded-lg shadow-sm border overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-10">
            <LoaderSpinner />
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-600">
                  #
                </th>

                <th className="text-left px-6 py-3 text-sm font-medium text-gray-600">
                  Center Name
                </th>

                <th className="text-left px-6 py-3 text-sm font-medium text-gray-600">
                  Status
                </th>

                <th className="text-right px-6 py-3 text-sm font-medium text-gray-600">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredCenters.length > 0 ? (
                filteredCenters.map((center, index) => (
                  <tr key={center.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm">{index + 1}</td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Building2 size={18} className="text-blue-600" />

                        <span className="font-medium">{center.name}</span>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      {center.is_active ? (
                        <span
                          className="
                          bg-green-100
                          text-green-700
                          px-3 py-1
                          rounded-full
                          text-xs
                        "
                        >
                          Active
                        </span>
                      ) : (
                        <span
                          className="
                          bg-red-100
                          text-red-700
                          px-3 py-1
                          rounded-full
                          text-xs
                        "
                        >
                          Inactive
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedCenter(center);
                          fetchCenterAssignment(center.id);
                          setShowPanel(true);
                        }}
                        className="bg-teal-600 hover:bg-teal-700 text-white text-sm px-3 py-2 rounded-lg"
                      >
                        Modify
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="4"
                    className="
                      text-center
                      py-10
                      text-gray-500
                    "
                  >
                    No centers found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-5">Create Center</h2>

            <div className="mb-5">
              <label className="block text-sm font-medium mb-2">
                Center Name
              </label>

              <input
                type="text"
                className="input-field w-full"
                placeholder="Enter center name"
                value={centerName}
                onChange={(e) => setCenterName(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowModal(false);
                  setCenterName("");
                }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                onClick={handleCreateCenter}
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* {showPanel && (
        <div className="fixed inset-0 bg-black/30 z-50">
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl p-6">
            <div className="flex justify-between mb-6">
              <h2 className="text-lg font-semibold">
                Modify {selectedCenter?.name}
              </h2>

              <button onClick={() => setShowPanel(false)}>✕</button>
            </div>

            <label className="label">Service</label>

            <select
              className="input-field w-full mb-4"
              value={assignment.service_id}
              onChange={(e) =>
                setAssignment({
                  ...assignment,
                  service_id: e.target.value,
                })
              }
            >
              <option value="">Select Service</option>

              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>

            <label className="label">Percentage Quota</label>

            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              className="input-field w-full mb-4"
              placeholder="50.0"
              value={assignment.percentage_quota}
              onChange={(e) => {
                const value = e.target.value;

                // Allow empty input
                if (value === "") {
                  setAssignment({
                    ...assignment,
                    percentage_quota: "",
                  });
                  return;
                }

                // Regex: 0-100 with max one decimal place
                const regex = /^(100(\.0)?|([0-9]{1,2})(\.[0-9])?)$/;

                if (regex.test(value)) {
                  setAssignment({
                    ...assignment,
                    percentage_quota: value,
                  });
                }
              }}
            />
            <div className="mb-5">
              <h3 className="text-sm font-semibold mb-3">Assigned Services</h3>

              <div className="space-y-3">
                {assignments.map((item, index) => (
                  <div
                    key={item.service_id}
                    className="bg-gray-50 border rounded-lg p-3"
                  >
                    <div className="flex justify-between mb-2">
                      <span className="font-medium">{item.service_name}</span>

                      <span className="text-indigo-600 font-semibold">%</span>
                    </div>

                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      className="input-field w-full"
                      value={item.percentage_quota}
                      onChange={(e) => {
                        const updated = [...assignments];

                        updated[index].percentage_quota = e.target.value;

                        setAssignments(updated);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="text-xs text-gray-500">Assigned Quota</p>

                <p className="text-lg font-semibold text-blue-600">
                  {assignedQuota.toFixed(2)}%
                </p>
              </div>

              <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                <p className="text-xs text-gray-500">Remaining</p>

                <p className="text-lg font-semibold text-green-600">
                  {remainingQuota.toFixed(2)}%
                </p>
              </div>
            </div>
            <div className="mb-5">
              <h3 className="text-sm font-semibold mb-3">
                Previous Assignments
              </h3>

              <div className="space-y-2">
                {previousAssignments.map((item) => (
                  <div
                    key={item.id}
                    className=" flex justify-between items-center bg-gray-50 border rounded-lg px-3 py-2 "
                  >
                    <span className="text-sm font-medium">
                      {item.service_name}
                    </span>

                    <span className="text-sm font-semibold text-indigo-600">
                      {Number(item.percentage_quota).toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <label className="label">POC Email</label>

            <input
              type="email"
              className="input-field w-full mb-4"
              placeholder="poc@example.com"
              value={assignment.poc_email}
              onChange={(e) =>
                setAssignment({
                  ...assignment,
                  poc_email: e.target.value,
                })
              }
            />

            <label className="label">CC Emails</label>

            <input
              type="text"
              className="input-field w-full mb-6"
              placeholder="a@test.com,b@test.com"
              value={assignment.cc_email}
              onChange={(e) =>
                setAssignment({
                  ...assignment,
                  cc_email: e.target.value,
                })
              }
            />

            <button
              onClick={saveAssignment}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg"
            >
              Save Assignment
            </button>
          </div>
        </div>
      )} */}
      {showPanel && (
        <div className="fixed inset-0 bg-black/30 z-50">
          <div
            className="
      absolute right-0 top-0
      h-full w-full max-w-md
      bg-white shadow-xl
      p-6 overflow-y-auto
    "
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold">
                Modify {selectedCenter?.name}
              </h2>

              <button
                onClick={() => setShowPanel(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                ✕
              </button>
            </div>

            {/* Quota Summary */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="text-xs text-gray-500">Assigned Quota</p>

                <p className="text-xl font-semibold text-blue-600">
                  {assignments
                    .reduce(
                      (sum, item) => sum + Number(item.percentage_quota || 0),
                      0,
                    )
                    .toFixed(2)}
                  %
                </p>
              </div>

              <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                <p className="text-xs text-gray-500">Remaining</p>

                <p className="text-xl font-semibold text-green-600">
                  {(
                    100 -
                    assignments.reduce(
                      (sum, item) => sum + Number(item.percentage_quota || 0),
                      0,
                    )
                  ).toFixed(2)}
                  %
                </p>
              </div>
            </div>

            {/* Add Service */}
            <div className="mb-5">
              <label className="label">Add Service</label>

              <select
                className="input-field w-full"
                value={selectedServiceId}
                onChange={(e) => {
                  const serviceId = Number(e.target.value);

                  setSelectedServiceId(serviceId);

                  if (!serviceId) return;

                  const service = services.find(
                    (s) => Number(s.id) === serviceId,
                  );

                  if (!service) return;

                  const alreadyExist = assignments.some(
                    (item) => Number(item.service_id) === serviceId,
                  );

                  if (alreadyExist) {
                    return;
                  }

                  setAssignments((prev) => [
                    ...prev,
                    {
                      service_id: service.id,
                      service_name: service.name,
                      percentage_quota: "",
                      poc_email: "",
                      cc_email: "",
                    },
                  ]);
                }}
              >
                <option value="">Select service</option>

                {services
                  .filter((service) => {
                    const exists = assignments.some(
                      (item) => Number(item.service_id) === Number(service.id),
                    );

                    // keep currently selected service visible
                    return (
                      !exists ||
                      Number(service.id) === Number(selectedServiceId)
                    );
                  })
                  .map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Assigned Services */}

            <div className="space-y-4">
              {assignments.map((item, index) => (
                <div
                  key={`${item.service_id}-${index}`}
                  className="
        border
        rounded-xl
        p-4
        bg-gray-50
      "
                >
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-semibold text-gray-700">
                      {item.service_name}
                    </h3>

                    <button
                      onClick={() => {
                        setAssignments((prev) =>
                          prev.filter((_, i) => i !== index),
                        );
                      }}
                      className="text-red-500 text-sm"
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

                      // Allow empty input
                      if (value === "") {
                        const updated = [...assignments];
                        updated[index].percentage_quota = "";
                        setAssignments(updated);
                        return;
                      }

                      // Allow 0-100 with max 2 decimal places
                      const regex =
                        /^(100(\.00?)?|([0-9]{1,2})(\.[0-9]{0,2})?)$/;

                      if (regex.test(value)) {
                        const updated = [...assignments];

                        updated[index].percentage_quota = value;

                        setAssignments(updated);
                      }
                    }}
                  />

                  <label className="label">POC Email</label>

                  <input
                    type="email"
                    className="input-field w-full mb-3"
                    value={item.poc_email}
                    placeholder="poc@example.com"
                    onChange={(e) => {
                      const updated = [...assignments];

                      updated[index].poc_email = e.target.value;

                      setAssignments(updated);
                    }}
                  />

                  <label className="label">CC Emails</label>

                  <input
                    type="text"
                    className="input-field w-full"
                    value={item.cc_email}
                    placeholder="email1@test.com,email2@test.com"
                    onChange={(e) => {
                      const updated = [...assignments];

                      updated[index].cc_email = e.target.value;

                      setAssignments(updated);
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Save */}

            <button
              onClick={() => {
                const total = assignments.reduce(
                  (sum, item) => sum + Number(item.percentage_quota || 0),
                  0,
                );

                if (total > 100) {
                  alert("Total quota cannot exceed 100%");

                  return;
                }

                saveAssignment();
              }}
              className="
        w-full
        mt-6
        bg-indigo-600
        hover:bg-indigo-700
        text-white
        py-2.5
        rounded-lg
        "
            >
              Save Assignments
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
