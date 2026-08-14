import {
  LayoutDashboard,
  Users,
  ClipboardList,
  FlaskConical,
  History,
  CalendarDays,
  MessageSquare,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  match?: (pathname: string) => boolean; // custom active matcher
}

export const navItems: NavItem[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  {
    label: "Patients",
    to: "/patients",
    icon: Users,
    match: (p) => p.startsWith("/patients"),
  },
  { label: "Orders (CPOE)", to: "/orders", icon: ClipboardList, match: (p) => p.startsWith("/orders") },
  { label: "Lab Results", to: "/labs", icon: FlaskConical },
  { label: "Medical History", to: "/history", icon: History },
  { label: "Schedule", to: "/schedule", icon: CalendarDays },
  { label: "Messages", to: "/messages", icon: MessageSquare },
  { label: "Settings", to: "/settings", icon: Settings },
];
