import { NavLink, useNavigate } from "react-router-dom";
import {
  UploadCloud,
  FileText,
  LogOut,
  Zap,
  Menu,
  X,
  LayoutDashboard,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/upload", icon: UploadCloud, label: "Upload Job" },
  { to: "/files", icon: FileText, label: "View Files" },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(window.innerWidth < 768);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };
  useEffect(() => {
    const handleResize = () => {
      setCollapsed(window.innerWidth < 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return (
    <>
      <div
        className={`
        fixed inset-y-0 left-0 z-40 flex flex-col
        bg-sidebar-bg border-r border-sidebar-border
        transition-all duration-300 ease-in-out
        ${collapsed ? "w-[80px]" : "w-56"}
      `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-900/40">
            <Zap size={15} className="text-white" />
          </div>
          {!collapsed && (
            <span className="font-semibold text-sm text-white tracking-tight truncate">
              LeadSet Pro
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto text-gray-300 hover:text-white transition-colors"
          >
            {collapsed ? <Menu size={16} /> : <X size={16} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 space-y-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
                 ${
                   isActive
                     ? "bg-indigo-500 text-white border border-indigo-600/30"
                     : "text-slate-400 hover:text-slate-100 hover:bg-indigo-500/50"
                 }`
              }
            >
              <Icon size={17} className="flex-shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-sidebar-border px-2 py-3">
          {!collapsed && (
            <div className="px-3 py-2 mb-1">
              <p className="text-xs font-semibold text-slate-300 truncate capitalize">
                {user?.name}
              </p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            title={collapsed ? "Logout" : undefined}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                       text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
          >
            <LogOut size={17} className="flex-shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </div>

      {/* Spacer */}
      <div
        className={`flex-shrink-0 transition-all duration-300 ${
          collapsed ? "w-[80px]" : "w-56"
        }`}
      />
    </>
  );
}
