// ============================================================================
// EHR Domain Types
// Centralized type definitions for the Electronic Health Record system.
// ============================================================================

export type PatientStatus =
  | "Admitted"
  | "Outpatient"
  | "Discharged"
  | "ICU"
  | "Observation";

export type AcuityLevel = "Critical" | "Serious" | "Stable" | "Fair";

export interface Allergy {
  id: string;
  substance: string;
  reaction: string;
  severity: "Mild" | "Moderate" | "Severe";
  noted: string;
}

export interface Medication {
  id: string;
  name: string;
  dose: string;
  route: string; // PO, IV, IM, etc.
  frequency: string; // BID, TID, QD
  status: "Active" | "Hold" | "Discontinued";
  startDate: string;
  prescribedBy: string;
  class: string;
}

export interface LabResult {
  id: string;
  name: string;
  value: string;
  unit: string;
  range: string;
  flag: "Normal" | "High" | "Low" | "Critical";
  category: "Hematology" | "Chemistry" | "Coagulation" | "Microbiology" | "Endocrinology";
  collected: string;
}

export interface VitalReading {
  id: string;
  timestamp: string;
  temp: number; // °F
  hr: number; // heart rate bpm
  bpSys: number; // systolic
  bpDia: number; // diastolic
  rr: number; // respiratory rate
  spo2: number; // oxygen saturation %
  pain: number; // 0-10
}

export interface HistoryEvent {
  id: string;
  date: string;
  title: string;
  type: "Diagnosis" | "Surgery" | "Imaging" | "Procedure" | "Visit" | "Vaccination" | "Allergy";
  description: string;
  provider: string;
}

export interface ClinicalNote {
  id: string;
  date: string;
  author: string;
  role: string;
  type: "Progress" | "Admission" | "Discharge" | "Nursing" | "Consult";
  content: string;
}

export interface Patient {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  dateOfBirth: string;
  gender: "Male" | "Female" | "Non-binary";
  pronouns: string;
  bloodType: string;
  phone: string;
  email: string;
  address: string;
  status: PatientStatus;
  acuity: AcuityLevel;
  primaryPhysician: string;
  room?: string;
  department: string;
  insurance: string;
  heightCm: number;
  weightKg: number;
  age: number;
  avatarColor: string;
  initials: string;
  allergies: Allergy[];
  medications: Medication[];
  labs: LabResult[];
  vitals: VitalReading[];
  history: HistoryEvent[];
  notes: ClinicalNote[];
  emergencyContact: { name: string; relation: string; phone: string };
  admitDate?: string;
  codeStatus: "Full Code" | "DNR" | "DNI" | "Comfort Care";
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  patientInitials: string;
  avatarColor: string;
  time: string;
  durationMin: number;
  type: "Follow-up" | "New Patient" | "Procedure" | "Telehealth" | "Surgery" | "Consult";
  department: string;
  status: "Scheduled" | "Checked-in" | "In Progress" | "Completed" | "Cancelled" | "No-show";
  notes?: string;
}

export interface Message {
  id: string;
  from: string;
  fromRole: string;
  subject: string;
  preview: string;
  body: string;
  time: string;
  read: boolean;
  priority: "Normal" | "High" | "Urgent";
  category: "Patient" | "Lab" | "Referral" | "System" | "Staff";
}

export type OrderType = "Medication" | "Laboratory" | "Imaging" | "Referral" | "Nursing";

export interface OrderItem {
  id: string;
  type: OrderType;
  name: string;
  detail: string;
  priority: "Routine" | "STAT" | "Urgent";
  status: "Pending" | "Active" | "Completed" | "Cancelled";
  ordered: string;
  orderedBy: string;
}

export interface Alert {
  id: string;
  patientName: string;
  patientId: string;
  avatarColor: string;
  initials: string;
  type: "Critical Lab" | "Fall Risk" | "Allergy" | "Medication" | "Vital" | "Code";
  message: string;
  time: string;
  severity: "Critical" | "Warning" | "Info";
}
