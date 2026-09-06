import { useMemo, useState } from "react";
import {
  Inbox, Star, Send, Archive, Search, Mail, AlertCircle, FlaskConical,
  UserRound, Server, ClipboardList, CornerUpLeft,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Avatar } from "../components/ui/Avatar";
import { Badge, type Tone } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { loadMessages, sendMessage, useAsync } from "../data/api";
import type { Message } from "../types";
import { formatDateTime } from "../utils/format";
import { cn } from "../utils/cn";
import { useAuth } from "../auth";

const categoryIcon: Record<string, React.ElementType> = {
  Patient: UserRound, Lab: FlaskConical, Referral: ClipboardList, System: Server, Staff: Mail,
};
const priorityTone: Record<string, Tone> = { Urgent: "red", High: "amber", Normal: "slate" };
const avatarColorFor = (m: { priority: string; sent?: boolean }) =>
  m.sent ? "#13726c" : m.priority === "Urgent" ? "#e11d48" : m.priority === "High" ? "#b45309" : "#13726c";

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-500 focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100";

type Draft = {
  to: string;
  category: Message["category"];
  priority: Message["priority"];
  subject: string;
  body: string;
};

const emptyDraft: Draft = { to: "", category: "Staff", priority: "Normal", subject: "", body: "" };

export default function Messages() {
  const { data: messages, loading } = useAsync(loadMessages, []);
  const { currentUser } = useAuth();

  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [folder, setFolder] = useState("Inbox");
  const [query, setQuery] = useState("");

  const [sent, setSent] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [viewing, setViewing] = useState<Message | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});

  // Received thread + any messages composed this session.
  const all = useMemo<Message[]>(
    () => [...sent, ...(messages ?? [])],
    [sent, messages]
  );
  const viewed = all.map((m) => (readIds.has(m.id) ? { ...m, read: true } : m));

  const folders = useMemo(
    () => [
      { label: "Inbox", icon: Inbox, count: viewed.filter((m) => !m.sent).length },
      { label: "Unread", icon: Mail, count: viewed.filter((m) => !m.read && !m.sent).length },
      { label: "Urgent", icon: AlertCircle, count: viewed.filter((m) => m.priority === "Urgent").length },
      { label: "Starred", icon: Star, count: 0 },
      { label: "Sent", icon: Send, count: viewed.filter((m) => m.sent).length },
      { label: "Archive", icon: Archive, count: 0 },
    ],
    [viewed]
  );

  const list = viewed.filter((m) => {
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      m.subject.toLowerCase().includes(q) ||
      m.from.toLowerCase().includes(q) ||
      (m.to?.toLowerCase().includes(q) ?? false);
    const matchesFolder =
      (folder === "Inbox" && !m.sent) ||
      (folder === "Unread" && !m.read && !m.sent) ||
      (folder === "Urgent" && m.priority === "Urgent") ||
      (folder === "Starred" && false) ||
      (folder === "Sent" && !!m.sent) ||
      (folder === "Archive" && false);
    return matchesQuery && matchesFolder;
  });

  // Known care-team recipients for compose autocomplete (free text still allowed).
  const recipientOptions = useMemo(
    () => Array.from(new Set((messages ?? []).map((m) => m.from))),
    [messages]
  );

  const openMessage = (m: Message) => {
    setViewing(m);
    if (!m.sent) setReadIds((s) => new Set(s).add(m.id));
  };

  const startCompose = (preset?: Partial<Draft>) => {
    setViewing(null);
    setDraft({ ...emptyDraft, ...preset });
    setErrors({});
    setComposeOpen(true);
  };

  const closeCompose = () => {
    setComposeOpen(false);
    setDraft(emptyDraft);
    setErrors({});
    setSendError("");
  };

  const send = async () => {
    const next: Partial<Record<keyof Draft, string>> = {};
    if (!draft.to.trim()) next.to = "Add at least one recipient.";
    if (!draft.subject.trim()) next.subject = "Subject is required.";
    if (!draft.body.trim()) next.body = "Write a message before sending.";
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    const msg: Message = {
      id: `msg-${Date.now()}`,
      from: currentUser?.name ?? "Dr. Sarah Chen",
      fromRole: currentUser ? capitalize(currentUser.role) : "Physician",
      to: draft.to.trim(),
      subject: draft.subject.trim(),
      preview: draft.body.trim().slice(0, 80),
      body: draft.body.trim(),
      time: new Date().toISOString(),
      read: true,
      priority: draft.priority,
      category: draft.category,
      sent: true,
    };
    setSending(true);
    setSendError("");
    const err = await sendMessage(msg);
    setSending(false);
    if (err) {
      setSendError(`Could not send: ${err}`);
      return;
    }
    setSent((s) => [msg, ...s]);
    setFolder("Sent");
    closeCompose();
  };

  const unreadCount = viewed.filter((m) => !m.read && !m.sent).length;

  return (
    <div data-testid="messages-page">
      {loading && <p className="mb-4 text-sm text-slate-500">Loading messages…</p>}
      <PageHeader
        title="Secure Messages"
        subtitle="Encrypted clinical communications between care team members."
        actions={
          <button
            onClick={() => startCompose()}
            data-testid="compose-button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
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

        {/* List (full width — reading happens in a popup, see below) */}
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search messages…"
                className={inputCls}
              />
            </div>
          </div>
          <div className="max-h-[640px] divide-y divide-slate-50 overflow-y-auto">
            {list.map((m) => {
              const CatIcon = categoryIcon[m.category] ?? Mail;
              return (
                <button
                  key={m.id}
                  onClick={() => openMessage(m)}
                  data-testid="message-item"
                  className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="relative">
                    <Avatar
                      initials={initialsFor(m.from)}
                      color={avatarColorFor(m)}
                      size="sm"
                    />
                    {!m.read && !m.sent && (
                      <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-brand-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("truncate text-sm", m.read || m.sent ? "font-medium text-slate-700" : "font-bold text-slate-900")}>
                        {m.sent ? `To: ${m.to}` : m.from}
                      </p>
                      <span className="shrink-0 text-[11px] text-slate-500">{formatDateTime(m.time)}</span>
                    </div>
                    <p className={cn("truncate text-xs", m.read || m.sent ? "text-slate-500" : "font-semibold text-slate-700")}>{m.subject}</p>
                    <p className="truncate text-xs text-slate-500">{m.preview}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
                        <CatIcon className="h-3 w-3" />
                        {m.sent ? `Sent · ${m.category}` : m.category}
                      </span>
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
      </div>

      <p className="mt-4 text-center text-xs text-slate-500">
        <span className="font-semibold text-slate-500">{unreadCount} unread</span> · Messages are encrypted end-to-end and audited per HIPAA policy
      </p>

      {/* ---- Reading popup (replaces the old side-by-side pane) ---- */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.subject ?? ""}
        description={viewing ? `${viewing.from} · ${viewing.fromRole}` : undefined}
        size="lg"
      >
        {viewing && (
          <div className="flex flex-col">
            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
              <Avatar initials={initialsFor(viewing.from)} color={avatarColorFor(viewing)} size="md" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {viewing.sent ? `To: ${viewing.to}` : viewing.from}
                </p>
                <p className="text-xs text-slate-500">
                  {viewing.sent ? viewing.from : viewing.fromRole} · {formatDateTime(viewing.time)}
                </p>
              </div>
              {viewing.priority !== "Normal" && (
                <Badge tone={priorityTone[viewing.priority]} dot>{viewing.priority}</Badge>
              )}
            </div>
            <div className="px-5 py-5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{viewing.body}</p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button
                onClick={() =>
                  startCompose({
                    to: viewing.sent ? viewing.to : viewing.from,
                    category: viewing.category,
                    priority: viewing.priority,
                    subject: viewing.subject.startsWith("Re:") ? viewing.subject : `Re: ${viewing.subject}`,
                  })
                }
                data-testid="reply-button"
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                <CornerUpLeft className="h-4 w-4" /> Reply
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Compose popup ---- */}
      <Modal
        open={composeOpen}
        onClose={closeCompose}
        title="New secure message"
        description="Encrypted and audited per HIPAA policy"
        size="lg"
      >
        <div className="space-y-4 px-5 py-5">
          <div>
            <label htmlFor="compose-to" className="mb-1.5 block text-xs font-semibold text-slate-700">
              To
            </label>
            <input
              id="compose-to"
              list="recipient-options"
              value={draft.to}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              placeholder="Care team member or role"
              aria-invalid={!!errors.to}
              data-testid="compose-to"
              className={inputCls}
            />
            <datalist id="recipient-options">
              {recipientOptions.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            {errors.to && <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.to}</p>}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="compose-category" className="mb-1.5 block text-xs font-semibold text-slate-700">
                Category
              </label>
              <select
                id="compose-category"
                value={draft.category}
                onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as Draft["category"] }))}
                data-testid="compose-category"
                className={inputCls}
              >
                <option value="Staff">Staff</option>
                <option value="Patient">Patient</option>
                <option value="Lab">Lab</option>
                <option value="Referral">Referral</option>
                <option value="System">System</option>
              </select>
            </div>
            <div>
              <label htmlFor="compose-priority" className="mb-1.5 block text-xs font-semibold text-slate-700">
                Priority
              </label>
              <select
                id="compose-priority"
                value={draft.priority}
                onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value as Draft["priority"] }))}
                data-testid="compose-priority"
                className={inputCls}
              >
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="compose-subject" className="mb-1.5 block text-xs font-semibold text-slate-700">
              Subject
            </label>
            <input
              id="compose-subject"
              value={draft.subject}
              onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
              placeholder="Subject"
              aria-invalid={!!errors.subject}
              data-testid="compose-subject"
              className={inputCls}
            />
            {errors.subject && <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.subject}</p>}
          </div>

          <div>
            <label htmlFor="compose-body" className="mb-1.5 block text-xs font-semibold text-slate-700">
              Message
            </label>
            <textarea
              id="compose-body"
              value={draft.body}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              rows={6}
              placeholder="Write your message…"
              aria-invalid={!!errors.body}
              data-testid="compose-body"
              className={cn(inputCls, "resize-y")}
            />
            {errors.body && <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.body}</p>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          {sendError && (
            <p role="alert" data-testid="compose-send-error" className="mr-auto text-xs font-medium text-rose-600">
              {sendError}
            </p>
          )}
          <button
            onClick={closeCompose}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={send}
            disabled={sending}
            data-testid="compose-send"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send className="h-4 w-4" /> {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </Modal>
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

function initialsFor(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
