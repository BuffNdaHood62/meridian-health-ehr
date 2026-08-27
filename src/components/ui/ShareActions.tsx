import { useState } from "react";
import { Printer, Mail, X } from "lucide-react";
import { createShare } from "../../utils/share";
import { appendAudit } from "../../utils/audit";

// RFD §4.5 — Print + Share via Mail actions for a client record.
// ponytail: print = native window.print with @media print styles; "PDF" is the
// browser's print-to-PDF. Server-side PDF generation replaces if fidelity needed.

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100";

export function ShareActions({ patientId, patientName }: { patientId: string; patientName: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState("");

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const share = () => {
    if (!validEmail) {
      setError("Enter a valid recipient email.");
      return;
    }
    const rec = createShare(patientId, email);
    appendAudit("create", "Share", rec.id, `${patientName} → ${email} (72h TTL)`);
    setLink(`${window.location.origin}${window.location.pathname}#/share/${rec.token}`);
  };

  return (
    <>
      <button
        onClick={() => window.print()}
        data-testid="print-record"
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 no-print"
        aria-label={`Print ${patientName}'s record`}
      >
        <Printer className="h-4 w-4" /> Print
      </button>
      <button
        onClick={() => setOpen(true)}
        data-testid="share-record"
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 no-print"
        aria-label={`Share ${patientName}'s record by mail`}
      >
        <Mail className="h-4 w-4" /> Share
      </button>

      {open && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Share client record">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Share record securely</h3>
              <button onClick={() => setOpen(false)} aria-label="Close" className="tappable rounded-lg text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-xs text-slate-500">
              Generates a one-time link to <strong>{patientName}</strong>'s record. Expires after 72 hours
              and is consumed on first open.
            </p>
            {!link ? (
              <>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  placeholder="recipient@hospital.org"
                  aria-label="Recipient email"
                  aria-invalid={!!error}
                  data-testid="share-email"
                  className={inputCls}
                />
                {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
                <button
                  onClick={share}
                  disabled={!email}
                  data-testid="share-generate"
                  className="mt-3 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:bg-slate-300"
                >
                  Generate secure link
                </button>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold text-emerald-700">Link ready — send it via your mail app:</p>
                <code className="mt-2 block break-all rounded-lg bg-slate-50 p-3 text-xs text-slate-700" data-testid="share-link">
                  {link}
                </code>
                <a
                  href={`mailto:${email}?subject=${encodeURIComponent(`Secure record link — ${patientName}`)}&body=${encodeURIComponent(`A one-time secure link to the clinical record (valid 72 hours):\n\n${link}`)}`}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
                  data-testid="share-mailto"
                >
                  <Mail className="h-4 w-4" /> Open in mail app
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
