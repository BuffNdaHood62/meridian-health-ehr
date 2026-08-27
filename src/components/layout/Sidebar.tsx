import { useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { LogOut, ShieldCheck, X, UserPlus } from "lucide-react";
import { navItems } from "./nav";
import { currentUser } from "../../data/mockData";
import { useAuth } from "../../auth";
import { Avatar } from "../ui/Avatar";
import { cn } from "../../utils/cn";

function isActive(to: string, match: ((p: string) => boolean) | undefined, pathname: string) {
  if (match) return match(pathname);
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  // Escape closes the mobile drawer
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onClose]);

  const handleLogout = () => {
    onClose();
    logout();
    navigate("/login");
  };

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={cn(
          "fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        data-testid="sidebar"
      >
        {/* Brand */}
        <div className="flex h-16 items-center justify-between gap-3 border-b border-slate-100 px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-200">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v18M3 12h18" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold leading-tight text-slate-900">Wellness with Writingale</p>
              <p className="text-[11px] font-medium leading-tight text-brand-600">EMR Platform</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="tappable rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            WWW Clinical Workspace
          </p>
          {navItems.map((item) => {
            const active = isActive(item.to, item.match, pathname);
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                data-testid={`nav-${item.label.toLowerCase().replace(/[^a-z]/g, "")}`}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    active ? "text-brand-600" : "text-slate-500 group-hover:text-slate-600"
                  )}
                />
                {item.label}
                {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-500" />}
              </NavLink>
            );
          })}
        </nav>

        {/* Compliance + session footer */}
        <div className="space-y-3 border-t border-slate-100 p-3">
          <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-100">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div>
              <p className="text-[11px] font-semibold text-emerald-800">HIPAA Secure Session</p>
              <p className="text-[10px] leading-tight text-emerald-600">Encrypted · no idle auto-lock</p>
            </div>
          </div>

          <button
            onClick={() => {
              onClose();
              navigate("/settings");
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-50"
          >
            <Avatar initials={(useAuth().currentUser?.initials) ?? currentUser.initials} color="#13726c" size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{(useAuth().currentUser?.name) ?? currentUser.name}</p>
              <p className="truncate text-xs text-slate-500">{useAuth().currentUser?.id ?? currentUser.id}</p>
            </div>
          </button>

          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
            data-testid="logout-button"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Sign out
          </button>

          <button
            onClick={() => {
              // ponytail: multi-account = one account per browser tab. Switching
              // means signing out this tab and returning to the picker; open a new
              // tab to keep both sessions live (server impl: account switcher).
              onClose();
              logout();
              navigate("/login");
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50"
            data-testid="switch-account-button"
          >
            <UserPlus className="h-[18px] w-[18px]" />
            Switch account
          </button>
        </div>
      </aside>
    </>
  );
}
