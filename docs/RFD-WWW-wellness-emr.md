# RFD — Wellness with Writingale EMR ("WWW")

**Status:** Draft v1.0 · **Source:** stakeholder raw feature request (2026-08-24) · **Baseline:** current React SPA (`meridian-health-ehr`, routes/components cited so engineers can map work 1:1)

---

## 1. Overview and Scope

- Transform the existing demo EHR front-end into **Wellness with Writingale EMR**, a small-facility wellness clinic system. Client-facing terminology becomes "**WWW Clients**" (patients).
- **Modules affected:** Dashboard, Patients→WWW Clients, Orders (CPOE), Lab Results, Medical History (+ new Medical Review flow), Schedule (removed), Messages, Auth/Sessions.
- **High-level goals:**
  1. Rebrand all clinical surfaces to WWW terminology without changing information architecture beyond what is specified.
  2. Replace the demo localStorage flag with real multi-user auth: roles, ≤5 concurrent users, auditable sessions.
  3. Add encryption-at-rest gates on Orders, Lab Results, and Medical History/Medical Review.
  4. Make client records visit-based, immutable-on-save, printable, and shareable by secure mail.
  5. Remove non-essential dashboard/schedule surfaces to reduce cognitive load for a small clinic.
- **Out of scope:** billing, pharmacy dispensing chains, HL7/FHIR interoperability (noted in §12 as future).

---

## 2. Naming, Branding, and Roles

### 2.1 UI labels

| Surface | Current | New |
|---|---|---|
| Product title / login brand | Meridian Health EHR | **Wellness with Writingale EMR** |
| Sidebar "Clinical Workspace" group | Clinical Workspace | WWW Clinical Workspace |
| Patients nav + page title | Patients / Patient Registry | **WWW Clients** |
| Orders page title | Computerized Provider Order Entry | WWW Orders |

### 2.2 Roles and access levels

| Role | Code | Access |
|---|---|---|
| Doctor | `doctor` | Everything; Orders entry requires personal doctor code (§6); signs orders |
| Nurse | `nurse` | Dashboard, WWW Clients, Lab Results (view+enter), Order History side-tab (view, set Administered), Messages |
| Reception | `reception` | Demographics intake, WWW Clients registry, Schedule-free booking notes, Messages |
| Admin | `admin` | User/role management, audit log export, cannot author clinical content |
| Lab | `lab` | Lab Results (create/update results), view client identity only |
| External recipient | `external` | No login; receives time-limited signed share links (§9.4) |

### 2.3 Multi-user login & session security
- Up to **5 concurrently logged-in users** per facility account (config constant `MAX_CONCURRENT_SESSIONS = 5`).
- Sessions: JWT access token 15 min + refresh token 8 h, sliding revocation on logout.
- Session record stores: user id, role, device label, IP, created/expiry. 6th simultaneous login rejected with `SESSIONS_EXHAUSTED`.
- All auth events (login, logout, denial, code-unlock) written to AuditLog.

---

## 3. Dashboard (DASHBOARD)

### 3.1 Retained KPI tiles — renamed

| Tile | Current label | New label | Data source |
|---|---|---|---|
| 1 | Active Patients | **WWW Clients** | count of patients with status `Admitted` ∪ `Observation` ∪ `ICU` |
| 2 | Bed Occupancy | **WWW Admitted Clients** | count status `Admitted` (absolute number replaces % gauge) |
| 3 | Today's Appointments | **WWW Scheduled Appointments** | visits with `scheduledFor = today`, excluding cancelled |
| 4 | Critical Alerts | *(retained, unchanged)* | alerts where severity `Critical` |

### 3.2 New slots (replace removed panels)
- **Demographics slot** — quick-intake form: client name, DOB, gender, phone, facility. Fields **auto-save** to the patient record 800 ms after last keystroke (debounced PATCH); visual "Saved ✓" state; creates patient shell if none selected.
- **Medical Review slot** — entry form registered as a Medical History record. Fields:
  - `clientName` (string, required, autocomplete over patients)
  - `diagnosis` (string, required)
  - `historyOfEvents` (text, required)
  - `vitalSigns` (embedded vitals group, same fields as §4.4)
  - `orders` (read-only display of today's orders for that client)
  - On submit → creates `MedicalReview` linked to patient + visit; appears in Medical History timeline.

### 3.3 Removed (delete components, not just hide)
Awaiting-review critical-alerts banner (`Dashboard.tsx` critical alerts Card), Today's schedule card, Patient snapshot card, Department census card, Admissions & discharges chart, Patients-requiring-attention table.
**Rationale:** single-practitioner wellness clinic; panels assume hospital census operations.

---

## 4. Patients Module → **WWW Clients**

### 4.1 Summary tiles

| Current | New |
|---|---|
| Total Patients | **WWW Clients** |
| Currently Admitted | **WWW Scheduled Patients** (visits today not yet completed) |
| Outpatient | **WWW Priority Clients** (flagged `priority = true`) |
| Critical Care tile | removed — duplicate of Priority concept |

*(Resolves the duplicate Outpatient/Priority tile.)*

### 4.2 Registry behavior
- Tapping a client name opens the full record (existing `/patients/:id` route retained).
- Each visit/check-up creates a **new Visit entry** in the record; history is append-only.

### 4.3 Patient record fields (on tap)

| Field | Type | Rules |
|---|---|---|
| `wwwNumber` | string `001`–`999`, display `WWW-001` | server-assigned sequential, zero-padded, **immutable after save**; unique index |
| `ageCategory` | enum: `LT_1Y` \| `1_4` \| `5_9` \| `10_12` \| `13_19` \| `20_PLUS` | derived from DOB at save; stored alongside DOB |
| `facility` | string | required |
| `status` | enum: `Admitted` \| `Not Admitted` | replaces 5-value PatientStatus for this deployment |
| `complaints` | text | presenting complaint(s) |
| `allergies` | Allergy[] | substance/reaction/severity (existing shape) |
| demographics | embedded | per §3.2 |

### 4.4 Vital signs (editable results)

| Field | Type | Validation |
|---|---|---|
| `temperatureC` | decimal(3,1) | 30.0–45.0 °C |
| `spo2Pct` | int | 50–100 |
| `bpSystolic` / `bpDiastolic` | int | 60–260 / 30–180, sys > dia |
| `pulseBpm` | int | 30–250 |
| `respirationRate` | int | 6–60 |
| `weightKg` | decimal(5,2) | 0.3–400 |

Vitals are editable within the open Visit; once the visit is closed they are read-only (immutability, §9.3).

### 4.5 Print/share
Every record renders a print stylesheet (`@media print`: hide chrome, show WWW header + client block + visits) and a **Share via Mail** action producing a password-protected PDF link to an external recipient (§9.4).

---

## 5. Orders

- **Access gate:** `/orders` route wrapped in `DoctorCodeGate` — requires the logged-in doctor's personal code (8+ chars, Argon2id-hashed, never stored plaintext). Unlock is session-scoped (re-prompt after 15 min idle or role change).
- **Encryption:** Order rows encrypted at rest (AES-256-GCM, §9.1).
- **Order History moves to a right-hand side tab** (persistent panel on the Orders page, collapsible), visible to nurses.
- Per-order additions:

| Field | Type | Rules |
|---|---|---|
| `signedByName` | string | stamped from authenticated doctor at sign; displayed on each row |
| `administered` | enum: `Pending` \| `Administered` \| `Not Administered` | nurse-settable; timestamp + nurse identity recorded |
| `recipientName` | string | who received/administered the order |

**Rationale:** separates prescribing authority (doctor code) from administration accountability (nurse signature trail).

---

## 6. Lab Results

- Route gated by role (`doctor`, `nurse`, `lab`); content encrypted at rest.
- **New result workflow:** Select client → select/create test → enter result → validate → save.
  - Required: patientId, testName, value, unit, referenceRange, flag, collectedAt, enteredBy.
  - Validation: flag ∈ {Normal, High, Low, Critical}; Critical triggers immediate Message to treating doctor (auto-compose, §8).
- API contract sketch:

```json
POST /api/v1/lab-results
{
  "patientId": "www-042",
  "visitId": "v-2026-0007",
  "testName": "Fasting Blood Sugar",   // string 1..120
  "value": "96",                        // string, numeric-or-qualitative
  "unit": "mg/dL",
  "referenceRange": "70-99",
  "flag": "Normal",
  "collectedAt": "2026-08-24T08:30:00Z",
  "enteredById": "usr_17"
}
→ 201 { "id": "lab_558", "createdAt": "...", "encryptedFields": ["value","referenceRange"] }
```

---

## 7. Medical History & Schedule & Messages

- **Medical History:** encrypted at rest; timeline consolidates `MedicalReview` entries (from §3.2) plus legacy HistoryEvents; entries immutable after save; corrections are appended addenda.
- **Schedule page: REMOVED** — delete route `/schedule`, nav item, and `Schedule.tsx`; "WWW Scheduled Appointments" dashboard tile reads Visits instead.
- **Messages:** layout preserved; backs the ≤5-concurrent-session model (§2.3); every message send/read audited; folder counts derive from live data (already implemented).

---

## 8. Security, Compliance, and Data Integrity

### 8.1 Encryption
- In transit: TLS 1.3 only.
- At rest: AES-256-GCM field-level encryption for Order, LabResult.value/referenceRange, MedicalReview, MedicalHistory payloads. DEKs wrapped by master key in KMS (or server env secret in Phase 2 MVP); key rotation every 90 days; no keys in client bundle.
- Doctor codes: Argon2id (m=64MB, t=3, p=1), per-user salt.

### 8.2 Access control matrix
Enforced server-side per §2.2; UI hides unauthorized affordances but **never** relies on hiding alone. No client-side role gates as sole protection.

### 8.3 Audit trails
Immutable `AuditLog(actorId, action, entity, entityId, before/after hash, at, ip)` for create/edit/delete on: Patient, Visit, MedicalReview, Order, LabResult. Deletes are soft-deletes (`deletedAt`), never hard rows.

### 8.4 Immutability constraints
- `wwwNumber`: immutable post-save.
- Closed Visit: vitals/labs/orders frozen.
- Signed Order: cannot be edited; can only be superseded by a new order referencing `supersedesOrderId`.

### 8.5 Export/print/mail
- PDF export per record; secure share = random-token URL, 72 h TTL, one-time download, recipient email logged.

---

## 9. Non-Functional Requirements
- Dashboard interactive ≤ 2 s on 3G Fast; first contentful paint ≤ 1.5 s.
- Uptime target 99.5% monthly; local-first read cache acceptable.
- Accessibility: WCAG 2.1 AA (contrast + focus-visible already in baseline; keep).
- Dates/times ISO-8601 UTC storage, clinic-local render; locale `en-US` initial, i18n-ready strings.
- All responsiveness/a11y work already shipped (dvh viewport, 44px targets) is carried forward as a hard requirement for new screens.

---

## 10. Acceptance Criteria (test cases)

| ID | Criterion |
|---|---|
| AC-1 | All §2.1/§3.1/§4.1 renames render exactly as specified; old strings absent from DOM |
| AC-2 | Removed dashboard cards + Schedule route return 404/redirect and appear nowhere in nav |
| AC-3 | Saving a new client assigns sequential `WWW-###`, second save gets next number, field shows read-only afterwards |
| AC-4 | Age category derives correctly for boundary DOBs (e.g., 1st birthday → `1_4`) |
| AC-5 | Demographics form autosaves ≤1.5 s after typing stops; reload shows persisted values |
| AC-6 | Medical Review submit appears immediately in Medical History timeline for that client |
| AC-7 | Orders page prompts for doctor code; wrong code ×5 locks 15 min; nurse accounts get 403 at API |
| AC-8 | Nurse sets `Administered` + recipient name in side-tab; audit row created |
| AC-9 | Lab result flagged `Critical` auto-creates Message to treating doctor |
| AC-10 | DB inspection shows ciphertext for Order/LabResult/MedicalHistory payloads; API responses decrypt for authorized roles only |
| AC-11 | 6th concurrent login rejected with visible `SESSIONS_EXHAUSTED` message |
| AC-12 | Print preview of a client record shows branded sheet without app chrome; share link expires after 72 h / first download |
| AC-13 | Vitals outside validation ranges blocked with inline errors |
| AC-14 | Every create/edit/delete on scoped entities produces an AuditLog entry with actor + timestamp |

---

## 11. Data Models (high-level)

```
User(id, name, roleCode, doctorCodeHash?, email, active)
Session(id, userId, deviceLabel, ip, createdAt, expiresAt, revokedAt)
Role(code, permissions[])                       // doctor|nurse|reception|admin|lab
Patient(id, wwwNumber UNIQUE, firstName, lastName, dob, ageCategory,
        gender, phone, facility, status ENUM(Admitted|Not Admitted),
        priority BOOL, complaints TEXT, allergies JSON, demographics JSON,
        createdBy, createdAt, deletedAt?)
Visit(id, patientId FK, scheduledFor, checkedInAt, closedAt NULL,
      reason, createdBy)                        // 1 Patient → N Visits
Demographics                                    // embedded in Patient (§3.2)
MedicalReview(id, patientId FK, visitId FK, diagnosis, historyOfEvents,
              vitalsJSON, ordersSnapshot JSON, authorId, createdAt)
MedicalHistory(id, patientId FK, sourceType ENUM(Review|Legacy),
               sourceId, title, description, provider, date)
Order(id, patientId FK, visitId FK, type, name, detail, priority,
      status, administered ENUM, recipientName, signedByName,
      supersedesOrderId NULL, orderedAt, orderedBy)
LabResult(id, patientId FK, visitId FK, testName, value ENC, unit,
          referenceRange ENC, flag, collectedAt, enteredById, createdAt)
Message(id, fromUserId, subject, body, priority, category,
        readAt NULL, relatedEntity REF)
AuditLog(id, actorId, action, entity, entityId, beforeHash, afterHash,
         at, ip)                                 // append-only
```

Relationships: Patient 1—N Visit; Visit 1—N Order/LabResult/MedicalReview; Patient 1—N MedicalHistory; User 1—N Session; all writes → AuditLog.

---

## 12. API & Integration Notes
- REST under `/api/v1`; Bearer JWT; JSON bodies; ISO-8601 UTC.
- Conventions: `GET/POST /patients`, `GET/PATCH /patients/:id`, `POST /patients/:id/visits`, `POST /visits/:id/orders`, `PATCH /orders/:id/administration`, `POST /lab-results`, `POST /medical-reviews`, `GET /audit-log?entity=&from=`, `POST /shares` (returns TTL link).
- Errors: `{ code, message, field? }`; rate-limit auth endpoints (5/min/IP).
- Encryption markers: responses include `encryptedFields` for transparency; decryption happens server-side post-authorization only.
- Future: FHIR R4 mapping layer noted, not built in Phases 1–4.

---

## 13. Deliverables & Phased Plan

**Prioritized backlog (top items):**
1. Rename pass + removals (labels, dashboard cards, Schedule deletion)
2. Patient model changes (wwwNumber, ageCategory, status enum, priority)
3. Auth upgrade: roles, sessions cap, doctor-code gate
4. Visit-based records + immutability rules
5. Encrypted entities + audit log
6. Medical Review/Demographics dashboard slots
7. Print/share pipeline
8. Lab critical-result messaging

**Wireframe guidance:** Dashboard = 2 KPI rows + two stacked slots (Demographics left, Medical Review right). Orders = builder left, CDS center, collapsible History side-tab right. Client record = header (WWW number prominent) + visit tabs. Mobile keeps shipped bottom-nav pattern.

**Phases**
| Phase | Scope | Exit criteria |
|---|---|---|
| 1 — Rename & structure | §2.1, §3, §4 labels/removals, Schedule delete | AC-1, AC-2 green |
| 2 — Encryption & history | §5 gate, §6/§7 encryption, audit log, models | AC-6..AC-10, AC-14 |
| 3 — Sharing & printing | §4.5 print/PDF/secure mail | AC-12 |
| 4 — Multi-user login | §2.3 sessions, role matrix end-to-end | AC-7, AC-8, AC-11 |

---
*Rationale anchors: renames preserve stakeholder terminology verbatim; removals shrink surface to solo-clinic reality; encryption targets only PHI-bearing pages rather than whole-DB crypto to stay implementable in Phase 2; immutability applies at visit close, keeping intra-visit correction frictionless.*
