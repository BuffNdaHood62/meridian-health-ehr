import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, XCircle, Mail } from "lucide-react";
import { consumeShare } from "../utils/share";
import { getPatientById } from "../data/mockData";
import { ageFromDob, formatDate } from "../utils/format";
import { Card, CardHeader } from "../components/ui/Card";
import { StatusBadge, AcuityBadge } from "../components/ui/Badge";

// RFD §8.5 — external recipient view: one-time token → read-only record sheet.
// ponytail: renders the same mock record for any valid token until backend
// scopes shares to encrypted snapshots.
export default function ShareView() {
  const { token } = useParams();
  const [consumed] = useState(() => !!token && !!consumeShare(token));
  const patient = consumed ? getPatientById("P-1001") : null; // demo: single shared record

  if (!consumed || !patient) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center">
        <XCircle className="h-10 w-10 text-rose-500" />
        <h1 className="text-lg font-bold text-slate-900">Link unavailable</h1>
        <p className="max-w-sm text-sm text-slate-500">
          This share link is invalid, expired (72 h), or has already been used. Ask the sender for a new one.
        </p>
        <Link to="/" className="text-sm font-medium text-brand-600 hover:text-brand-700 no-print">
          Go to sign-in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl bg-slate-50 p-6" data-testid="share-view">
      <div className="mb-4 flex items-center gap-2 text-emerald-700 no-print">
        <CheckCircle2 className="h-5 w-5" />
        <p className="text-sm font-semibold">Link verified — one-time access granted.</p>
      </div>

      <Card className="mb-4 overflow-hidden">
        <CardHeader
          title={`${patient.firstName} ${patient.lastName}`}
          subtitle={`WWW ${patient.id} · ${patient.mrn}`}
          icon={<Mail className="h-[18px] w-[18px]" />}
          action={<StatusBadge status={patient.status} />}
        />
        <div className="grid gap-x-6 gap-y-3 p-5 sm:grid-cols-2 text-sm">
          <p><span className="text-slate-500">Age:</span> {ageFromDob(patient.dateOfBirth)}y · {patient.gender}</p>
          <p><span className="text-slate-500">Blood type:</span> {patient.bloodType}</p>
          <p><span className="text-slate-500">Facility dept:</span> {patient.department}</p>
          <p><span className="text-slate-500">Admitted:</span> {patient.admitDate ? formatDate(patient.admitDate) : "—"}</p>
          <div className="sm:col-span-2">
            <span className="text-slate-500">Acuity:</span> <AcuityBadge acuity={patient.acuity} />
          </div>
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader title="Allergies" subtitle="Documented reactions" icon={<Mail className="h-[18px] w-[18px]" />} />
        <ul className="divide-y divide-slate-50">
          {patient.allergies.map((a) => (
            <li key={a.id} className="px-5 py-2.5 text-sm">
              <strong>{a.substance}</strong> — {a.reaction} ({a.severity})
            </li>
          ))}
          {patient.allergies.length === 0 && <li className="px-5 py-2.5 text-sm text-slate-400">None documented</li>}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Recent History" subtitle="Clinical events" icon={<Mail className="h-[18px] w-[18px]" />} />
        <ul className="divide-y divide-slate-50">
          {patient.history.slice(0, 5).map((h) => (
            <li key={h.id} className="px-5 py-2.5 text-sm">
              <strong>{h.title}</strong> · {formatDate(h.date)} — {h.description}
            </li>
          ))}
        </ul>
      </Card>

      <p className="mt-6 text-center text-xs text-slate-400">
        This link has been consumed and cannot be reopened. · Wellness with Writingale EMR
      </p>
    </div>
  );
}
