import { Search, Plus, Building2, PencilIcon } from "lucide-react";
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
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState(true);
  const [updating, setUpdating] = useState(false);
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
  const handleUpdateCenter = async () => {
    if (!editName.trim()) return;

    try {
      setUpdating(true);

      const { data } = await axios.put(
        `${BASE_URL}/centers/update/${selectedCenter.id}`,
        {
          name: editName,
          is_active: editStatus,
        },
      );

      if (data.success) {
        setShowPanel(false);
        setSelectedCenter(null);
        fetchCenters();
      }
    } catch (err) {
      console.log(err.response?.data?.message || "Failed to update center");
    } finally {
      setUpdating(false);
    }
  };
  useEffect(() => {
    fetchCenters();
  }, []);

  const filteredCenters = centers.filter((center) =>
    center.name.toLowerCase().includes(search.toLowerCase()),
  );
  console.log("filteredCenters", editStatus);
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
                          setEditName(center.name);
                          setEditStatus(center.is_active);
                          setShowPanel(true);
                        }}
                        className="bg-teal-600 hover:bg-teal-700 text-white text-sm px-3 py-2 rounded-lg"
                      >
                        Edit
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
      {showPanel && selectedCenter && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-5">Edit Center</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Center Name
              </label>

              <input
                type="text"
                className="input-field w-full"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium mb-2">Status</label>

              <select
                className="input-field w-full"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
              >
                <option value={1}>Active</option>

                <option value={0}>Inactive</option>
              </select>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowPanel(false);
                  setSelectedCenter(null);
                }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                onClick={handleUpdateCenter}
                disabled={updating}
                className="
            px-4 py-2
            bg-teal-600
            text-white
            rounded-lg
            hover:bg-teal-700
            disabled:opacity-50
          "
              >
                {updating ? "Updating..." : "Update"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
