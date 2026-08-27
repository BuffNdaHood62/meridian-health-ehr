import {
  LayoutDashboard,
  Users,
  ClipboardList,
  FlaskConical,
  History,
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
  { label: "WWW Orders", to: "/orders", icon: ClipboardList },
  { label: "Lab Results", to: "/labs", icon: FlaskConical },
  { label: "Medical History", to: "/history", icon: History },
  { label: "Messages", to: "/messages", icon: MessageSquare },
  { label: "Settings", to: "/settings", icon: Settings },
];
