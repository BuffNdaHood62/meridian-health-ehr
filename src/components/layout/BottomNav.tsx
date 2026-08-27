import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Users, History, MessageSquare, ClipboardList,
} from "lucide-react";
import { cn } from "../../utils/cn";

const tabs = [
  { to: "/", icon: LayoutDashboard, label: "Dash" },
  { to: "/patients", icon: Users, label: "Patients" },
  { to: "/history", icon: History, label: "History" },
  { to: "/messages", icon: MessageSquare, label: "Messages" },
  { to: "/orders", icon: ClipboardList, label: "Orders" },
];

// ponytail: fixed 5-tab set; if nav grows, swap to a scrollable tab strip
export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary mobile navigation"
    >
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === "/"}
          className={({ isActive }) =>
            cn(
              "flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
              isActive
                ? "text-brand-700"
                : "text-slate-500 hover:text-slate-800"
            )
          }
        >
          <t.icon className="h-5 w-5" />
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
