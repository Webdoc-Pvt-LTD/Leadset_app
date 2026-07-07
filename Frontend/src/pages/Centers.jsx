import { Search, Plus, Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import axios from "axios";
import { BASE_URL } from "../config";
import LoaderSpinner from "../components/loader";

export default function Centers() {
  const [centers, setCenters] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    fetchCenters();
  }, []);

  const filteredCenters = centers.filter((center) =>
    center.name.toLowerCase().includes(search.toLowerCase()),
  );

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
          className="
            flex items-center gap-2
            bg-indigo-600
            hover:bg-indigo-500
            text-white
            px-4 py-2
            rounded-lg
            text-sm
          "
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
                        className="
                          text-blue-600
                          hover:text-blue-800
                          text-sm
                        "
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
    </div>
  );
}
