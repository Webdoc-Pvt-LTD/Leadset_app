import { createContext, useContext, useState } from "react";
import api from "../lib/api";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const storedUser = sessionStorage.getItem("user");
    return storedUser ? JSON.parse(storedUser) : null;
  });

  const login = async (email, password) => {
    try {
      const { data } = await api.post("/users/login", {
        email,
        password,
      });

      if (data.success) {
        setUser(data.data);

        sessionStorage.setItem("user", JSON.stringify(data.data));

        return {
          success: true,
        };
      }

      return {
        success: false,
        message: data.message,
      };
    } catch (err) {
      return {
        success: false,
        message:
          err.response?.data?.message || "Unable to login. Please try again.",
      };
    }
  };

  const logout = () => {
    setUser(null);
    sessionStorage.removeItem("user");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
