import axios from "axios";
import toast from "react-hot-toast";
import { BASE_URL } from "../config";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const api = axios.create({
  baseURL: BASE_URL,
});

api.interceptors.response.use(
  (response) => {
    const { config, data } = response;

    if (config.skipToast || config.responseType === "blob") {
      return response;
    }

    const method = config.method?.toUpperCase();

    if (MUTATION_METHODS.has(method)) {
      if (data?.success) {
        toast.success(data.message || "Operation completed successfully");
      } else if (data?.message) {
        toast.error(data.message);
      }
    } else if (!data?.success && data?.message) {
      toast.error(data.message);
    }

    return response;
  },
  (error) => {
    const { config } = error;

    if (!config?.skipToast) {
      toast.error(
        error.response?.data?.message || "Something went wrong. Please try again.",
      );
    }

    return Promise.reject(error);
  },
);

export default api;
