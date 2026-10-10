import { node } from "./dom";

// ============================================================================
// Record export (print / email) — Phase 1 hardening
// ============================================================================
//
// Two controls the previous implementation lacked:
//  1. No HTML string concatenation. The sheet is built with DOM nodes and
//     `textContent`, so client-supplied text (complaints, allergies, names) is
//     data, never markup — the old `document.write` path was an injection
//     surface inside a second window.
//  2. Every export is audited. A printed or mailed chart is a disclosure and has
//     to leave a trail (§164.312(b)).
//
// ponytail: mailto() carries the record through the user's mail client, which is
// not a secure channel. Interim control = explicit authorization step + audit.
// Phase 3 replaces it with the expiring share link (public.shares + redeem_share)
// so the record never enters an email body.

import type { WwwVisitEntry } from "../types";
import { clientRecordText } from "./wwwRecords";
import { appendAudit } from "./audit";
import { DEMO_MODE, APP_NAME } from "../config";

/** Header stamps so a sheet cannot circulate without provenance. */
function provenanceLines(): string[] {
  const lines = [`Generated ${new Date().toLocaleString()}`, `Source: ${APP_NAME}`];
  if (DEMO_MODE) lines.unshift("*** DEMO DATA — NOT A REAL PATIENT RECORD ***");
  return lines;
}

/**
 * Open a print sheet for one immutable visit and audit the disclosure.
 * Returns false when the browser blocked the popup, so the caller can tell the
 * user instead of appearing to have printed nothing.
 */
export function printClientRecord(e: WwwVisitEntry): boolean {
  const win = window.open("", "_blank", "width=720,height=900");
  if (!win) return false;
  const doc = win.document;

  doc.title = `WWW ${e.wwwNumber} — ${e.clientName}`;
  doc.body.setAttribute("style", "font-family:system-ui,sans-serif;padding:32px");
  doc.body.appendChild(node(doc, "h2", "Wellness with Writingale EMR — Client Record", "margin:0 0 4px"));
  for (const line of provenanceLines()) {
    doc.body.appendChild(
      node(doc, "p", line, `margin:0 0 6px;color:${DEMO_MODE ? "#b91c1c" : "#555"};font-size:${DEMO_MODE ? "13px" : "12px"}`)
    );
  }
  doc.body.appendChild(node(doc, "pre", clientRecordText(e), "white-space:pre-wrap;font:14px/1.6 system-ui,sans-serif;margin-top:16px"));

  win.focus();
  win.print();
  appendAudit("export", "WwwVisit", e.id, "printed client record");
  return true;
}

/**
 * Draft an email carrying the record. The caller must have obtained the
 * user's explicit authorization first (recipient is a disclosure decision).
 */
export function emailClientRecord(e: WwwVisitEntry): void {
  const body = encodeURIComponent(
    `${provenanceLines().join("\n")}\n\n${clientRecordText(e)}\n\n— Disclosed from ${APP_NAME}`
  );
  const subject = encodeURIComponent(`WWW client record ${e.wwwNumber} — ${e.clientName}`);
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
  appendAudit("export", "WwwVisit", e.id, "emailed client record (disclosure authorized by user)");
}
