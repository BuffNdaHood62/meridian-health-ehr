import { useState } from "react";
import {
  Inbox, Star, Send, Archive, Search, Mail, AlertCircle, FlaskConical,
  UserRound, Server, ClipboardList, CornerUpLeft, Trash2, Paperclip,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Avatar } from "../components/ui/Avatar";
import { Badge, type Tone } from "../components/ui/Badge";
import { loadMessages, useAsync } from "../data/api";
import { formatDateTime } from "../utils/format";
import { cn } from "../utils/cn";

const categoryIcon: Record<string, React.ElementType> = {
  Patient: UserRound, Lab: FlaskConical, Referral: ClipboardList, System: Server, Staff: Mail,
};
const priorityTone: Record<string, Tone> = { Urgent: "red", High: "amber", Normal: "slate" };

export default function Messages() {
  const { data: messages, loading } = useAsync(loadMessages, []);
  const [activeId, setActiveId] = useState<string>(messages?.[0]?.id ?? "");
  const [folder, setFolder] = useState("Inbox");
  const [query, setQuery] = useState("");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const viewed = (messages ?? []).map((m) => (readIds.has(m.id) ? { ...m, read: true } : m));
  const active = viewed.find((m) => m.id === activeId);

  const folders = [
    { label: "Inbox", icon: Inbox, count: viewed.length },
    { label: "Unread", icon: Mail, count: viewed.filter((m) => !m.read).length },
    { label: "Urgent", icon: AlertCircle, count: viewed.filter((m) => m.priority === "Urgent").length },
    { label: "Starred", icon: Star, count: 0 },
    { label: "Sent", icon: Send, count: 0 },
    { label: "Archive", icon: Archive, count: 0 },
  ];

  const list = viewed.filter((m) => {
    const matchesQuery =
      !query.trim() ||
      m.subject.toLowerCase().includes(query.toLowerCase()) ||
      m.from.toLowerCase().includes(query.toLowerCase());
    const matchesFolder =
      folder === "Inbox" ||
      (folder === "Unread" && !m.read) ||
      (folder === "Urgent" && m.priority === "Urgent") ||
      (folder === "Starred" && false) ||
      (folder === "Sent" && false) ||
      (folder === "Archive" && false);
    return matchesQuery && matchesFolder;
  });

  const openMessage = (id: string) => {
    setActiveId(id);
    setReadIds((s) => new Set(s).add(id));
  };

  const unreadCount = viewed.filter((m) => !m.read).length;

  return (
    <div data-testid="messages-page">
      {loading && <p className="mb-4 text-sm text-slate-500">Loading messages…</p>}
      <PageHeader
        title="Secure Messages"
        subtitle="Encrypted clinical communications between care team members."
        actions={
          <button className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            <PenIcon /> Compose
          </button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        {/* Folders */}
        <div className="space-y-1">
          {folders.map((f) => (
            <button
              key={f.label}
              onClick={() => setFolder(f.label)}
              className={cn(
                "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                folder === f.label ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <span className="flex items-center gap-2.5">
                <f.icon className="h-4 w-4" /> {f.label}
              </span>
              {f.count > 0 && (
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  folder === f.label ? "bg-brand-200 text-brand-800" : "bg-slate-200 text-slate-600"
                )}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* List + reading pane */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* List */}
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search messages…"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>
            <div className="max-h-[640px] divide-y divide-slate-50 overflow-y-auto">
              {list.map((m) => {
                const CatIcon = categoryIcon[m.category] ?? Mail;
                return (
                  <button
                    key={m.id}
                    onClick={() => openMessage(m.id)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50",
                      activeId === m.id && "bg-brand-50/60"
                    )}
                  >
                    <div className="relative">
                      <Avatar initials={m.from.split(" ").map((w) => w[0]).join("").slice(0, 2)} color={m.priority === "Urgent" ? "#e11d48" : m.priority === "High" ? "#b45309" : "#13726c"} size="sm" />
                      {!m.read && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-brand-500" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn("truncate text-sm", m.read ? "font-medium text-slate-700" : "font-bold text-slate-900")}>{m.from}</p>
                        <span className="shrink-0 text-[11px] text-slate-500">{formatDateTime(m.time)}</span>
                      </div>
                      <p className={cn("truncate text-xs", m.read ? "text-slate-500" : "font-semibold text-slate-700")}>{m.subject}</p>
                      <p className="truncate text-xs text-slate-500">{m.preview}</p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500"><CatIcon className="h-3 w-3" />{m.category}</span>
                        {m.priority !== "Normal" && <Badge tone={priorityTone[m.priority]}>{m.priority}</Badge>}
                      </div>
                    </div>
                  </button>
                );
              })}
              {list.length === 0 && (
                <div className="flex flex-col items-center px-4 py-12 text-center">
                  <Mail className="mb-2 h-8 w-8 text-slate-300" />
                  <p className="text-sm text-slate-500">No messages in this folder</p>
                </div>
              )}
            </div>
          </Card>

          {/* Reading pane */}
          {active ? (
            <Card className="flex flex-col">
              <div className="border-b border-slate-100 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-bold text-slate-900">{active.subject}</h3>
                  {active.priority !== "Normal" && <Badge tone={priorityTone[active.priority]} dot>{active.priority}</Badge>}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Avatar initials={active.from.split(" ").map((w) => w[0]).join("").slice(0, 2)} color="#13726c" size="md" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">{active.from}</p>
                    <p className="text-xs text-slate-500">{active.fromRole} · {formatDateTime(active.time)}</p>
                  </div>
                  <div className="flex gap-1">
                    <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-600" aria-label="Reply"><CornerUpLeft className="h-4 w-4" /></button>
                    <button className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
              <div className="flex-1 p-5">
                <p className="text-sm leading-relaxed text-slate-700">{active.body}</p>
              </div>
              <div className="border-t border-slate-100 p-4">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <input placeholder="Write a reply…" className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500" />
                  <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200" aria-label="Attach"><Paperclip className="h-4 w-4" /></button>
                  <button className="rounded-lg bg-brand-600 p-1.5 text-white hover:bg-brand-700" aria-label="Send"><Send className="h-4 w-4" /></button>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="flex items-center justify-center p-12 text-center">
              <div>
                <Mail className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-500">Select a message to read</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-slate-500">
        <span className="font-semibold text-slate-500">{unreadCount} unread</span> · Messages are encrypted end-to-end and audited per HIPAA policy
      </p>
    </div>
  );
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
