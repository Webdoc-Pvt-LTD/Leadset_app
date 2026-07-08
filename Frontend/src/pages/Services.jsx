import { Search, Plus, Briefcase } from "lucide-react";
import { useEffect, useState } from "react";
import axios from "axios";
import { BASE_URL } from "../config";
import LoaderSpinner from "../components/loader";

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

  /*
    Fetch Services
  */

  const fetchServices = async () => {
    try {
      setLoading(true);

      const response = await axios.get(`${BASE_URL}/services/all`);

      if (response.data.success) {
        setServices(response.data.data);
      }
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  /*
    Fetch Centers
  */

  const fetchCenters = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/centers/all`);

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

  /*
    Open Drawer
  */

  const openDrawer = async (service) => {
    try {
      setSelectedService(service);
      setShowPanel(true);

      const response = await axios.get(
        `${BASE_URL}/services/${service.id}/quota`,
      );

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

  /*
    Add Center
  */

  const addCenter = (centerId) => {
    const center = centers.find((c) => Number(c.id) === Number(centerId));

    if (!center) return;

    const exists = assignments.some(
      (item) => Number(item.center_id) === Number(center.id),
    );

    if (exists) {
      alert("Center already assigned");
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

  /*
    Update quota
  */

  const updateQuota = (index, value) => {
    const updated = [...assignments];

    updated[index].percentage_quota = value;

    setAssignments(updated);

    const total = updated.reduce(
      (sum, item) => sum + Number(item.percentage_quota || 0),
      0,
    );

    setAssignedQuota(Number(total.toFixed(2)));

    setRemainingQuota(Number((100 - total).toFixed(2)));
  };

  /*
    Save Allocation
  */

  const saveAssignment = async () => {
    try {
      const payload = {
        service_id: selectedService.id,

        assignments,
      };

      const response = await axios.post(
        `${BASE_URL}/centers/assign-service`,
        payload,
      );

      if (response.data.success) {
        alert("Allocation saved successfully");

        setShowPanel(false);
      }
    } catch (error) {
      alert(error.response?.data?.message || "Failed saving");
    }
  };

  const filteredServices = services.filter((service) =>
    service.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-6">
      {/* Header */}

      <div
        className="
flex
justify-between
mb-6
"
      >
        <div>
          <h1
            className="
text-2xl
font-semibold
text-gray-800
"
          >
            Services
          </h1>

          <p
            className="
text-sm
text-gray-500
"
          >
            Manage service center quota
          </p>
        </div>
      </div>

      {/* Search */}

      <div
        className="
mb-5
max-w-md
relative
"
      >
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
          className="
input-field
w-full
pl-9
"
          placeholder="
Search service...
"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}

      <div
        className="
bg-white
border
rounded-lg
overflow-hidden
"
      >
        {loading ? (
          <div className="p-10 flex justify-center">
            <LoaderSpinner />
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left">#</th>

                <th className="px-6 py-3 text-left">Service</th>

                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredServices.map((service, index) => (
                <tr
                  key={service.id}
                  className="
border-b
hover:bg-gray-50
"
                >
                  <td className="px-6 py-4">{index + 1}</td>

                  <td className="px-6 py-4">
                    <div
                      className="
flex
items-center
gap-2
"
                    >
                      <Briefcase size={18} className="text-blue-600" />

                      {service.name}
                    </div>
                  </td>

                  <td
                    className="
px-6 py-4
text-right
"
                  >
                    <button
                      onClick={() => openDrawer(service)}
                      className="
bg-teal-600
hover:bg-teal-700
text-white
px-3
py-2
rounded-lg
text-sm
"
                    >
                      Modify
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Drawer */}

      {showPanel && (
        <div
          className="
fixed
inset-0
bg-black/30
z-50
"
        >
          <div
            className="
absolute
right-0
top-0
h-full
w-full
max-w-md
bg-white
p-6
overflow-y-auto
"
          >
            <div
              className="
flex
justify-between
mb-6
"
            >
              <h2
                className="
text-lg
font-semibold
"
              >
                {selectedService.name}
              </h2>

              <button onClick={() => setShowPanel(false)}>✕</button>
            </div>

            <div
              className="
grid
grid-cols-2
gap-3
mb-5
"
            >
              <div
                className="
bg-blue-50
p-3
rounded-lg
"
              >
                Assigned
                <b>{assignedQuota}%</b>
              </div>

              <div
                className="
bg-green-50
p-3
rounded-lg
"
              >
                Remaining
                <b>{remainingQuota}%</b>
              </div>
            </div>
            <div className="mb-2">
              <select
                className="
      input-field
      w-full
      mt-3
    "
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
                className="
      border
      rounded-lg
      p-4
      mb-3
      bg-gray-50
    "
              >
                <div className="flex justify-between items-center mb-3">
                  <div className="font-medium">{item.center_name}</div>

                  <button
                    className="
          text-red-500
          text-sm
        "
                    onClick={() => {
                      const updated = assignments.filter((_, i) => i !== index);

                      setAssignments(updated);

                      const total = updated.reduce(
                        (sum, item) => sum + Number(item.percentage_quota || 0),
                        0,
                      );

                      setAssignedQuota(Number(total.toFixed(2)));

                      setRemainingQuota(Number((100 - total).toFixed(2)));
                    }}
                  >
                    Remove
                  </button>
                </div>

                {/* Quota */}

                <label className="label">Percentage Quota</label>

                <input
                  type="text"
                  inputMode="decimal"
                  className="
        input-field
        w-full
        mb-3
      "
                  value={item.percentage_quota}
                  onChange={(e) => {
                    const value = e.target.value;

                    // allow max 100 and 2 decimals
                    const regex = /^(100(\.00?)?|([0-9]{1,2})(\.[0-9]{0,2})?)$/;

                    if (value === "" || regex.test(value)) {
                      updateQuota(index, value);
                    }
                  }}
                  placeholder="50.00"
                />

                {/* POC Email */}

                <label className="label">POC Email</label>

                <input
                  type="email"
                  className="
        input-field
        w-full
        mb-3
      "
                  placeholder="poc@example.com"
                  value={item.poc_email}
                  onChange={(e) => {
                    const updated = [...assignments];

                    updated[index].poc_email = e.target.value;

                    setAssignments(updated);
                  }}
                />

                {/* CC Email */}

                <label className="label">CC Emails</label>

                <input
                  type="text"
                  className="
        input-field
        w-full
      "
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
              className="
w-full
bg-indigo-600
text-white
py-2
rounded-lg
mt-6
"
            >
              Save Allocation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
