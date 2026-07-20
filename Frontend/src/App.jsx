import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import Files from "./pages/Files";
import Centers from "./pages/Centers";
import Services from "./pages/Services";
import RoleProtectedRoute from "./components/RoleProctectedRoute";
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route
              path="dashboard"
              element={
                <RoleProtectedRoute allowedRoles={["admin", "agent"]}>
                  <Dashboard />
                </RoleProtectedRoute>
              }
            />
            <Route
              path="upload"
              element={
                <RoleProtectedRoute allowedRoles={["admin", "agent"]}>
                  <Upload />
                </RoleProtectedRoute>
              }
            />
            <Route
              path="files"
              element={
                <RoleProtectedRoute allowedRoles={["admin", "agent"]}>
                  <Files />
                </RoleProtectedRoute>
              }
            />
            <Route
              path="centers"
              element={
                <RoleProtectedRoute allowedRoles={["admin"]}>
                  <Centers />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="services"
              element={
                <RoleProtectedRoute allowedRoles={["admin"]}>
                  <Services />
                </RoleProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
