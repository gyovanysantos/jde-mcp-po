import { useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ShieldCheck,
  FileText,
  MessageSquare,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { logout } from "../lib/api";
import ChatPanel from "./ChatPanel";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/approvals", icon: ShieldCheck, label: "Approvals" },
  { to: "/purchase-orders", icon: FileText, label: "Purchase Orders" },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-64 bg-sidebar text-sidebar-text
          transform transition-transform duration-200 ease-in-out
          lg:relative lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex h-16 items-center gap-3 px-6 border-b border-white/10">
          <FileText className="h-7 w-7 text-primary" />
          <span className="text-lg font-bold tracking-tight">JDE PO Hub</span>
        </div>

        <nav className="mt-4 space-y-1 px-3">
          {navItems.map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium
                  transition-colors
                  ${active
                    ? "bg-primary text-white"
                    : "text-sidebar-text/70 hover:bg-white/10 hover:text-white"
                  }
                `}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-4 left-0 right-0 px-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm
                       font-medium text-sidebar-text/70 hover:bg-white/10 hover:text-white
                       transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b bg-white px-4 lg:px-6">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-lg p-2 hover:bg-gray-100 lg:hidden"
          >
            {sidebarOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>

          <h1 className="text-lg font-semibold text-gray-800 hidden lg:block">
            Purchase Order Management
          </h1>

          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={`
              flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium
              transition-colors
              ${chatOpen
                ? "bg-primary text-white"
                : "bg-primary/10 text-primary hover:bg-primary/20"
              }
            `}
          >
            <MessageSquare className="h-4 w-4" />
            AI Assistant
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-gray-50 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* Chat panel */}
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}
    </div>
  );
}
