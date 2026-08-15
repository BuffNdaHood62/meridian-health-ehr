import type {
  Patient,
  Appointment,
  Message,
  OrderItem,
  Alert,
  VitalReading,
} from "../types";

// ============================================================================
// Current authenticated provider (mock session)
// ============================================================================
export const currentUser = {
  name: "Dr. Sarah Chen",
  role: "Attending Physician — Internal Medicine",
  credentials: "MD, FACP",
  id: "PHY-0142",
  department: "Internal Medicine",
  initials: "SC",
  npi: "1487265930",
};

// ============================================================================
// Helper: synthesize a series of vital readings for trend charts
// ============================================================================
function genVitals(seed: number, count: number): VitalReading[] {
  const out: VitalReading[] = [];
  let t = seed,
    hr = 78 + (seed % 8),
    sys = 122 + (seed % 12),
    dia = 78 + (seed % 7),
    spo2 = 96 + (seed % 3),
    temp = 98.4 + (seed % 3) * 0.3,
    rr = 16 + (seed % 4);
  const pain = seed % 4;
  const rand = () => {
    t = (t * 9301 + 49297) % 233280;
    return t / 233280;
  };
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 6 * 3600 * 1000);
    hr = Math.round(Math.min(120, Math.max(58, hr + (rand() - 0.5) * 10)));
    sys = Math.round(Math.min(150, Math.max(104, sys + (rand() - 0.5) * 8)));
    dia = Math.round(Math.min(96, Math.max(62, dia + (rand() - 0.5) * 6)));
    spo2 = Math.round(Math.min(100, Math.max(91, spo2 + (rand() - 0.5) * 2)));
    temp = Math.round((temp + (rand() - 0.5) * 0.6) * 10) / 10;
    rr = Math.round(Math.min(24, Math.max(12, rr + (rand() - 0.5) * 2)));
    out.push({
      id: `v-${seed}-${i}`,
      timestamp: d.toISOString(),
      temp: Math.round(Math.min(102.5, Math.max(97, temp)) * 10) / 10,
      hr,
      bpSys: sys,
      bpDia: dia,
      rr,
      spo2,
      pain: Math.min(10, Math.max(0, pain)),
    });
  }
  return out;
}

// ============================================================================
// Patients
// ============================================================================
export const patients: Patient[] = [
  {
    id: "P-1001",
    mrn: "MRN-558210",
    firstName: "Robert",
    lastName: "Hawkins",
    dateOfBirth: "1958-03-12",
    gender: "Male",
    pronouns: "he/him",
    bloodType: "A+",
    phone: "(415) 555-0142",
    email: "r.hawkins@example.com",
    address: "1280 Cedar Lane, Apt 4B, San Francisco, CA 94110",
    status: "ICU",
    acuity: "Critical",
    primaryPhysician: "Dr. Sarah Chen",
    room: "ICU-04",
    department: "Intensive Care",
    insurance: "Blue Cross Blue Shield",
    heightCm: 178,
    weightKg: 84,
    age: 67,
    avatarColor: "#13726c",
    initials: "RH",
    codeStatus: "Full Code",
    admitDate: "2026-01-08",
    emergencyContact: { name: "Linda Hawkins", relation: "Spouse", phone: "(415) 555-0199" },
    allergies: [
      { id: "a1", substance: "Penicillin", reaction: "Anaphylaxis", severity: "Severe", noted: "1998" },
      { id: "a2", substance: "Shellfish", reaction: "Hives", severity: "Moderate", noted: "2010" },
    ],
    medications: [
      { id: "m1", name: "Vancomycin", dose: "1 g", route: "IV", frequency: "Q12H", status: "Active", startDate: "2026-01-08", prescribedBy: "Dr. Sarah Chen", class: "Antibiotic" },
      { id: "m2", name: "Metoprolol", dose: "50 mg", route: "PO", frequency: "BID", status: "Active", startDate: "2026-01-08", prescribedBy: "Dr. Sarah Chen", class: "Beta-blocker" },
      { id: "m3", name: "Furosemide", dose: "40 mg", route: "IV", frequency: "QD", status: "Active", startDate: "2026-01-08", prescribedBy: "Dr. Sarah Chen", class: "Diuretic" },
      { id: "m4", name: "Heparin", dose: "5000 units", route: "SC", frequency: "Q8H", status: "Hold", startDate: "2026-01-09", prescribedBy: "Dr. Sarah Chen", class: "Anticoagulant" },
      { id: "m5", name: "Acetaminophen", dose: "650 mg", route: "PO", frequency: "Q6H PRN", status: "Active", startDate: "2026-01-08", prescribedBy: "Dr. Sarah Chen", class: "Analgesic" },
    ],
    labs: [
      { id: "l1", name: "White Blood Cell", value: "18.4", unit: "K/uL", range: "4.0-11.0", flag: "Critical", category: "Hematology", collected: "2026-01-10 06:00" },
      { id: "l2", name: "Hemoglobin", value: "10.1", unit: "g/dL", range: "13.5-17.5", flag: "Low", category: "Hematology", collected: "2026-01-10 06:00" },
      { id: "l3", name: "Lactate", value: "3.2", unit: "mmol/L", range: "0.5-2.0", flag: "High", category: "Chemistry", collected: "2026-01-10 06:00" },
      { id: "l4", name: "Creatinine", value: "1.9", unit: "mg/dL", range: "0.7-1.3", flag: "High", category: "Chemistry", collected: "2026-01-10 06:00" },
      { id: "l5", name: "Sodium", value: "136", unit: "mmol/L", range: "135-145", flag: "Normal", category: "Chemistry", collected: "2026-01-10 06:00" },
      { id: "l6", name: "Troponin I", value: "0.08", unit: "ng/mL", range: "<0.04", flag: "High", category: "Chemistry", collected: "2026-01-10 06:00" },
      { id: "l7", name: "Platelets", value: "152", unit: "K/uL", range: "150-400", flag: "Normal", category: "Hematology", collected: "2026-01-10 06:00" },
      { id: "l8", name: "INR", value: "1.1", unit: "", range: "0.8-1.2", flag: "Normal", category: "Coagulation", collected: "2026-01-10 06:00" },
    ],
    vitals: genVitals(11, 16),
    history: [
      { id: "h1", date: "2026-01-08", title: "Hospital Admission — Septic Shock", type: "Visit", description: "Admitted to ICU via ED with fever, hypotension and suspected pneumonia. Started on broad-spectrum antibiotics.", provider: "Dr. Sarah Chen" },
      { id: "h2", date: "2024-06-15", title: "Coronary Artery Disease", type: "Diagnosis", description: "Diagnosed with CAD after abnormal stress test. Started on statin and beta-blocker therapy.", provider: "Dr. Sarah Chen" },
      { id: "h3", date: "2023-09-02", title: "Hypertension", type: "Diagnosis", description: "Stage 2 hypertension diagnosed. Lisinopril prescribed.", provider: "Dr. Alan Frye" },
      { id: "h4", date: "2021-11-20", title: "Appendectomy", type: "Surgery", description: "Laparoscopic appendectomy, uncomplicated recovery.", provider: "Dr. Maria Gomez" },
      { id: "h5", date: "2020-02-10", title: "Chest X-Ray", type: "Imaging", description: "No acute cardiopulmonary findings.", provider: "Dr. Alan Frye" },
      { id: "h6", date: "2019-10-05", title: "Influenza Vaccine", type: "Vaccination", description: "Quadrivalent influenza vaccine administered.", provider: "Primary Care" },
    ],
    notes: [
      { id: "n1", date: "2026-01-10 07:30", author: "Dr. Sarah Chen", role: "Attending", type: "Progress", content: "Patient remains in ICU. WBC trending down from 22 to 18.4, lactate improving. Vasopressors weaned, MAP stable at 72. Continue current antibiotic regimen. Plan: reassess in 12h, consider step-down to floor if hemodynamics remain stable." },
      { id: "n2", date: "2026-01-09 14:10", author: "Nurse Patel", role: "RN", type: "Nursing", content: "Patient reports pain 4/10, managed with acetaminophen. Tolerating clear liquids. Family updated on plan of care." },
      { id: "n3", date: "2026-01-08 22:45", author: "Dr. Sarah Chen", role: "Attending", type: "Admission", content: "67M presenting with 3-day fever, productive cough and confusion. BP 86/52 on arrival, HR 112. Septic workup initiated. Blood cultures drawn. Admitted to ICU for septic shock management." },
    ],
  },
  {
    id: "P-1002",
    mrn: "MRN-558344",
    firstName: "Maria",
    lastName: "Gonzalez",
    dateOfBirth: "1972-07-25",
    gender: "Female",
    pronouns: "she/her",
    bloodType: "O-",
    phone: "(415) 555-0288",
    email: "maria.g@example.com",
    address: "452 Oakwood Drive, San Francisco, CA 94114",
    status: "Admitted",
    acuity: "Serious",
    primaryPhysician: "Dr. Sarah Chen",
    room: "412",
    department: "Cardiology",
    insurance: "Aetna PPO",
    heightCm: 162,
    weightKg: 70,
    age: 53,
    avatarColor: "#7c3aed",
    initials: "MG",
    codeStatus: "Full Code",
    admitDate: "2026-01-09",
    emergencyContact: { name: "Carlos Gonzalez", relation: "Son", phone: "(415) 555-0277" },
    allergies: [
      { id: "a1", substance: "Latex", reaction: "Contact dermatitis", severity: "Mild", noted: "2015" },
    ],
    medications: [
      { id: "m1", name: "Atorvastatin", dose: "40 mg", route: "PO", frequency: "QD", status: "Active", startDate: "2026-01-09", prescribedBy: "Dr. Sarah Chen", class: "Statin" },
      { id: "m2", name: "Aspirin", dose: "81 mg", route: "PO", frequency: "QD", status: "Active", startDate: "2026-01-09", prescribedBy: "Dr. Sarah Chen", class: "Antiplatelet" },
      { id: "m3", name: "Clopidogrel", dose: "75 mg", route: "PO", frequency: "QD", status: "Active", startDate: "2026-01-09", prescribedBy: "Dr. Sarah Chen", class: "Antiplatelet" },
      { id: "m4", name: "Metoprolol", dose: "25 mg", route: "PO", frequency: "BID", status: "Active", startDate: "2026-01-09", prescribedBy: "Dr. Sarah Chen", class: "Beta-blocker" },
    ],
    labs: [
      { id: "l1", name: "Troponin I", value: "0.32", unit: "ng/mL", range: "<0.04", flag: "High", category: "Chemistry", collected: "2026-01-10 05:00" },
      { id: "l2", name: "Total Cholesterol", value: "232", unit: "mg/dL", range: "<200", flag: "High", category: "Chemistry", collected: "2026-01-10 05:00" },
      { id: "l3", name: "LDL", value: "158", unit: "mg/dL", range: "<100", flag: "High", category: "Chemistry", collected: "2026-01-10 05:00" },
      { id: "l4", name: "HDL", value: "42", unit: "mg/dL", range: ">40", flag: "Normal", category: "Chemistry", collected: "2026-01-10 05:00" },
      { id: "l5", name: "Glucose", value: "118", unit: "mg/dL", range: "70-99", flag: "High", category: "Chemistry", collected: "2026-01-10 05:00" },
      { id: "l6", name: "Hemoglobin", value: "13.2", unit: "g/dL", range: "12.0-15.5", flag: "Normal", category: "Hematology", collected: "2026-01-10 05:00" },
    ],
    vitals: genVitals(27, 16),
    history: [
      { id: "h1", date: "2026-01-09", title: "Hospital Admission — NSTEMI", type: "Visit", description: "Admitted with non-ST elevation myocardial infarction. Cardiac cath scheduled. Started on dual antiplatelet therapy.", provider: "Dr. Sarah Chen" },
      { id: "h2", date: "2025-03-18", title: "Type 2 Diabetes Mellitus", type: "Diagnosis", description: "New diagnosis, A1c 7.8%. Started on metformin.", provider: "Dr. Alan Frye" },
      { id: "h3", date: "2024-11-02", title: "Hyperlipidemia", type: "Diagnosis", description: "Dyslipidemia confirmed on fasting panel.", provider: "Dr. Alan Frye" },
      { id: "h4", date: "2022-05-14", title: "Echocardiogram", type: "Imaging", description: "LVEF 58%, mild mitral regurgitation.", provider: "Dr. Sarah Chen" },
      { id: "h5", date: "2021-08-09", title: "Tdap Booster", type: "Vaccination", description: "Tetanus/diphtheria/pertussis booster.", provider: "Primary Care" },
    ],
    notes: [
      { id: "n1", date: "2026-01-10 08:00", author: "Dr. Sarah Chen", role: "Attending", type: "Progress", content: "NSTEMI, troponin plateaued. Pain-free since admission. Scheduled for cardiac catheterization today. Continue DAPT. Monitor telemetry." },
      { id: "n2", date: "2026-01-09 19:20", author: "Dr. Sarah Chen", role: "Attending", type: "Admission", content: "53F with 2 hours of substernal chest pressure radiating to left arm, diaphoresis. EKG showed T-wave inversions laterally. Troponin positive. NSTEMI protocol initiated." },
    ],
  },
  {
    id: "P-1003",
    mrn: "MRN-558901",
    firstName: "James",
    lastName: "O'Connor",
    dateOfBirth: "1995-11-30",
    gender: "Male",
    pronouns: "he/him",
    bloodType: "B+",
    phone: "(415) 555-0356",
    email: "j.oconnor@example.com",
    address: "77 Mission Street, San Francisco, CA 94105",
    status: "Outpatient",
    acuity: "Stable",
    primaryPhysician: "Dr. Sarah Chen",
    department: "Internal Medicine",
    insurance: "Kaiser Permanente",
    heightCm: 183,
    weightKg: 79,
    age: 30,
    avatarColor: "#2563eb",
    initials: "JO",
    codeStatus: "Full Code",
    emergencyContact: { name: "Eileen O'Connor", relation: "Mother", phone: "(415) 555-0344" },
    allergies: [],
    medications: [
      { id: "m1", name: "Sertraline", dose: "50 mg", route: "PO", frequency: "QD", status: "Active", startDate: "2025-09-01", prescribedBy: "Dr. Sarah Chen", class: "SSRI" },
      { id: "m2", name: "Loratadine", dose: "10 mg", route: "PO", frequency: "QD PRN", status: "Active", startDate: "2024-04-10", prescribedBy: "Dr. Alan Frye", class: "Antihistamine" },
    ],
    labs: [
      { id: "l1", name: "Complete Blood Count", value: "Normal", unit: "", range: "—", flag: "Normal", category: "Hematology", collected: "2025-12-12 09:00" },
      { id: "l2", name: "Comprehensive Metabolic Panel", value: "Normal", unit: "", range: "—", flag: "Normal", category: "Chemistry", collected: "2025-12-12 09:00" },
      { id: "l3", name: "TSH", value: "2.1", unit: "uIU/mL", range: "0.4-4.0", flag: "Normal", category: "Endocrinology", collected: "2025-12-12 09:00" },
    ],
    vitals: genVitals(33, 6),
    history: [
      { id: "h1", date: "2025-09-01", title: "Generalized Anxiety Disorder", type: "Diagnosis", description: "GAD diagnosed. Started sertraline and referred to CBT.", provider: "Dr. Sarah Chen" },
      { id: "h2", date: "2025-12-12", title: "Annual Wellness Exam", type: "Visit", description: "Routine physical, all systems within normal limits.", provider: "Dr. Sarah Chen" },
      { id: "h3", date: "2025-10-01", title: "Influenza Vaccine", type: "Vaccination", description: "Flu vaccine administered.", provider: "Primary Care" },
      { id: "h4", date: "2018-04-22", title: "Left Ankle Sprain", type: "Diagnosis", description: "Grade II lateral ankle sprain, conservative management.", provider: "Dr. Alan Frye" },
    ],
    notes: [
      { id: "n1", date: "2025-12-12 10:15", author: "Dr. Sarah Chen", role: "Attending", type: "Progress", content: "30M doing well on sertraline, anxiety well-controlled. Reports good sleep and exercise adherence. Continue current regimen, follow up in 6 months." },
    ],
  },
  {
    id: "P-1004",
    mrn: "MRN-559122",
    firstName: "Aisha",
    lastName: "Bennett",
    dateOfBirth: "1988-02-18",
    gender: "Female",
    pronouns: "she/her",
    bloodType: "AB+",
    phone: "(415) 555-0490",
    email: "aisha.b@example.com",
    address: "910 Fillmore Street, San Francisco, CA 94117",
    status: "Observation",
    acuity: "Serious",
    primaryPhysician: "Dr. Sarah Chen",
    room: "Obs-2",
    department: "Internal Medicine",
    insurance: "United Healthcare",
    heightCm: 168,
    weightKg: 96,
    age: 37,
    avatarColor: "#db2777",
    initials: "AB",
    codeStatus: "Full Code",
    admitDate: "2026-01-10",
    emergencyContact: { name: "Marcus Bennett", relation: "Spouse", phone: "(415) 555-0411" },
    allergies: [
      { id: "a1", substance: "Sulfa drugs", reaction: "Rash", severity: "Moderate", noted: "2012" },
      { id: "a2", substance: "Codeine", reaction: "Nausea", severity: "Mild", noted: "2019" },
    ],
    medications: [
      { id: "m1", name: "Insulin Glargine", dose: "24 units", route: "SC", frequency: "QD", status: "Active", startDate: "2024-02-01", prescribedBy: "Dr. Sarah Chen", class: "Insulin" },
      { id: "m2", name: "Metformin", dose: "1000 mg", route: "PO", frequency: "BID", status: "Active", startDate: "2023-06-10", prescribedBy: "Dr. Sarah Chen", class: "Antidiabetic" },
      { id: "m3", name: "Lisinopril", dose: "20 mg", route: "PO", frequency: "QD", status: "Active", startDate: "2023-06-10", prescribedBy: "Dr. Sarah Chen", class: "ACE inhibitor" },
    ],
    labs: [
      { id: "l1", name: "Hemoglobin A1c", value: "9.4", unit: "%", range: "<5.7", flag: "Critical", category: "Endocrinology", collected: "2026-01-10 07:00" },
      { id: "l2", name: "Glucose", value: "312", unit: "mg/dL", range: "70-99", flag: "Critical", category: "Chemistry", collected: "2026-01-10 07:00" },
      { id: "l3", name: "Ketones", value: "Positive", unit: "", range: "Negative", flag: "High", category: "Chemistry", collected: "2026-01-10 07:00" },
      { id: "l4", name: "Potassium", value: "5.4", unit: "mmol/L", range: "3.5-5.0", flag: "High", category: "Chemistry", collected: "2026-01-10 07:00" },
      { id: "l5", name: "pH", value: "7.28", unit: "", range: "7.35-7.45", flag: "Low", category: "Chemistry", collected: "2026-01-10 07:00" },
    ],
    vitals: genVitals(41, 14),
    history: [
      { id: "h1", date: "2026-01-10", title: "ED Visit — Diabetic Ketoacidosis", type: "Visit", description: "Presented with nausea, vomiting, fruity breath. Glucose 312, ketones positive, pH 7.28. DKA protocol, admitted to observation.", provider: "Dr. Sarah Chen" },
      { id: "h2", date: "2023-06-10", title: "Type 2 Diabetes Mellitus", type: "Diagnosis", description: "A1c 8.9% at diagnosis. Started on metformin and lifestyle modification.", provider: "Dr. Sarah Chen" },
      { id: "h3", date: "2023-06-10", title: "Hypertension", type: "Diagnosis", description: "Essential hypertension, started lisinopril.", provider: "Dr. Sarah Chen" },
      { id: "h4", date: "2024-09-15", title: "Retinal Exam", type: "Imaging", description: "Mild non-proliferative diabetic retinopathy.", provider: "Dr. Omar Reyes" },
      { id: "h5", date: "2018-01-20", title: "Cesarean Section", type: "Surgery", description: "Uncomplicated low-transverse C-section.", provider: "Dr. Lena Park" },
    ],
    notes: [
      { id: "n1", date: "2026-01-10 09:00", author: "Dr. Sarah Chen", role: "Attending", type: "Progress", content: "DKA. On insulin drip, glucose trending down, ketones clearing. Potassium repleted. Continue fluids and hourly glucose checks. Address insulin adherence on discharge." },
      { id: "n2", date: "2026-01-10 03:30", author: "Dr. Sarah Chen", role: "Attending", type: "Admission", content: "37F with 2 days of GI symptoms, found in DKA. Likely missed insulin doses. Aggressive fluid resuscitation and insulin drip initiated." },
    ],
  },
  {
    id: "P-1005",
    mrn: "MRN-559300",
    firstName: "Daniel",
    lastName: "Kim",
    dateOfBirth: "1965-09-05",
    gender: "Male",
    pronouns: "he/him",
    bloodType: "O+",
    phone: "(415) 555-0512",
    email: "d.kim@example.com",
    address: "33 Powell Street, San Francisco, CA 94102",
    status: "Discharged",
    acuity: "Stable",
    primaryPhysician: "Dr. Sarah Chen",
    department: "Orthopedics",
    insurance: "Cigna",
    heightCm: 175,
    weightKg: 88,
    age: 60,
    avatarColor: "#ea580c",
    initials: "DK",
    codeStatus: "Full Code",
    emergencyContact: { name: "Soyeon Kim", relation: "Daughter", phone: "(415) 555-0503" },
    allergies: [
      { id: "a1", substance: "Aspirin", reaction: "GI upset", severity: "Mild", noted: "2008" },
    ],
    medications: [
      { id: "m1", name: "Lisinopril", dose: "20 mg", route: "PO", frequency: "QD", status: "Active", startDate: "2019-05-01", prescribedBy: "Dr. Alan Frye", class: "ACE inhibitor" },
      { id: "m2", name: "Atorvastatin", dose: "20 mg", route: "PO", frequency: "QD", status: "Active", startDate: "2019-05-01", prescribedBy: "Dr. Alan Frye", class: "Statin" },
    ],
    labs: [
      { id: "l1", name: "Complete Blood Count", value: "Normal", unit: "", range: "—", flag: "Normal", category: "Hematology", collected: "2026-01-05 08:00" },
      { id: "l2", name: "Creatinine", value: "1.0", unit: "mg/dL", range: "0.7-1.3", flag: "Normal", category: "Chemistry", collected: "2026-01-05 08:00" },
      { id: "l3", name: "Hemoglobin A1c", value: "5.6", unit: "%", range: "<5.7", flag: "Normal", category: "Endocrinology", collected: "2026-01-05 08:00" },
    ],
    vitals: genVitals(58, 6),
    history: [
      { id: "h1", date: "2026-01-06", title: "Discharge — Post-op TKR", type: "Visit", description: "Discharged home after total knee replacement. PT arranged, opioid-sparing pain regimen.", provider: "Dr. Omar Reyes" },
      { id: "h2", date: "2026-01-04", title: "Total Knee Replacement (Right)", type: "Surgery", description: "Uncomplicated right total knee arthroplasty for osteoarthritis.", provider: "Dr. Omar Reyes" },
      { id: "h3", date: "2025-08-20", title: "Osteoarthritis (Right Knee)", type: "Diagnosis", description: "Advanced tricompartmental OA, failed conservative management.", provider: "Dr. Omar Reyes" },
      { id: "h4", date: "2019-05-01", title: "Hypertension", type: "Diagnosis", description: "Essential hypertension.", provider: "Dr. Alan Frye" },
      { id: "h5", date: "2025-09-10", title: "Knee X-Ray", type: "Imaging", description: "Severe joint space narrowing, medial compartment.", provider: "Dr. Omar Reyes" },
    ],
    notes: [
      { id: "n1", date: "2026-01-06 14:00", author: "Dr. Omar Reyes", role: "Surgeon", type: "Discharge", content: "60M post-op day 2 from R TKR. Ambulating with walker, pain controlled, wound clean. Discharged home with home PT. Follow up in 2 weeks." },
    ],
  },
  {
    id: "P-1006",
    mrn: "MRN-559415",
    firstName: "Eleanor",
    lastName: "Whitfield",
    dateOfBirth: "1942-12-03",
    gender: "Female",
    pronouns: "she/her",
    bloodType: "A-",
    phone: "(415) 555-0633",
    email: "e.whitfield@example.com",
    address: "2200 Golden Gate Ave, San Francisco, CA 94118",
    status: "Admitted",
    acuity: "Serious",
    primaryPhysician: "Dr. Sarah Chen",
    room: "305",
    department: "Neurology",
    insurance: "Medicare",
    heightCm: 160,
    weightKg: 58,
    age: 83,
    avatarColor: "#0891b2",
    initials: "EW",
    codeStatus: "DNI",
    admitDate: "2026-01-10",
    emergencyContact: { name: "Thomas Whitfield", relation: "Son", phone: "(415) 555-0621" },
    allergies: [
      { id: "a1", substance: "Penicillin", reaction: "Rash", severity: "Moderate", noted: "2001" },
      { id: "a2", substance: "Iodine contrast", reaction: "Hives", severity: "Moderate", noted: "2016" },
    ],
    medications: [
      { id: "m1", name: "Aspirin", dose: "81 mg", route: "PO", frequency: "QD", status: "Active", startDate: "2020-01-01", prescribedBy: "Dr. Sarah Chen", class: "Antiplatelet" },
      { id: "m2", name: "Atorvastatin", dose: "40 mg", route: "PO", frequency: "QD", status: "Active", startDate: "2020-01-01", prescribedBy: "Dr. Sarah Chen", class: "Statin" },
      { id: "m3", name: "Donepezil", dose: "10 mg", route: "PO", frequency: "QD", status: "Active", startDate: "2023-03-15", prescribedBy: "Dr. Sarah Chen", class: "Cholinesterase inhibitor" },
      { id: "m4", name: "Amlodipine", dose: "5 mg", route: "PO", frequency: "QD", status: "Active", startDate: "2021-06-01", prescribedBy: "Dr. Alan Frye", class: "CCB" },
    ],
    labs: [
      { id: "l1", name: "Sodium", value: "133", unit: "mmol/L", range: "135-145", flag: "Low", category: "Chemistry", collected: "2026-01-10 04:00" },
      { id: "l2", name: "Creatinine", value: "1.4", unit: "mg/dL", range: "0.6-1.1", flag: "High", category: "Chemistry", collected: "2026-01-10 04:00" },
      { id: "l3", name: "Hemoglobin", value: "11.0", unit: "g/dL", range: "12.0-15.5", flag: "Low", category: "Hematology", collected: "2026-01-10 04:00" },
      { id: "l4", name: "PT/INR", value: "1.0", unit: "", range: "0.8-1.2", flag: "Normal", category: "Coagulation", collected: "2026-01-10 04:00" },
    ],
    vitals: genVitals(64, 12),
    history: [
      { id: "h1", date: "2026-01-10", title: "Hospital Admission — Acute Ischemic Stroke", type: "Visit", description: "83F with sudden right-sided weakness and aphasia, onset 90 min prior. Outside thrombolytic window; admitted for stroke workup and rehab planning.", provider: "Dr. Sarah Chen" },
      { id: "h2", date: "2023-03-15", title: "Alzheimer's Dementia", type: "Diagnosis", description: "Moderate-stage dementia, started donepezil.", provider: "Dr. Sarah Chen" },
      { id: "h3", date: "2020-01-01", title: "Atrial Fibrillation", type: "Diagnosis", description: "Paroxysmal AFib, on aspirin (anticoagulation deferred due to fall risk).", provider: "Dr. Sarah Chen" },
      { id: "h4", date: "2021-06-01", title: "Hypertension", type: "Diagnosis", description: "Started amlodipine.", provider: "Dr. Alan Frye" },
      { id: "h5", date: "2026-01-10", title: "CT Head", type: "Imaging", description: "No hemorrhage. Hypodensity in left MCA territory consistent with acute infarct.", provider: "Dr. Sarah Chen" },
    ],
    notes: [
      { id: "n1", date: "2026-01-10 06:00", author: "Dr. Sarah Chen", role: "Attending", type: "Progress", content: "Acute L MCA stroke. NIHSS 9. Stable neurologically. Continue stroke pathway, speech and PT consult. Goals of care discussion with family given dementia and code status (DNI)." },
      { id: "n2", date: "2026-01-10 02:15", author: "Dr. Sarah Chen", role: "Attending", type: "Admission", content: "83F, acute onset R hemiparesis and expressive aphasia. Last known well 90 min before arrival — outside tPA window. CT negative for bleed. Admitted to neurology." },
    ],
  },
  {
    id: "P-1007",
    mrn: "MRN-559520",
    firstName: "Liam",
    lastName: "Foster",
    dateOfBirth: "2019-04-14",
    gender: "Male",
    pronouns: "he/him",
    bloodType: "B-",
    phone: "(415) 555-0719",
    email: "parent.foster@example.com",
    address: "555 Valencia Street, San Francisco, CA 94110",
    status: "Outpatient",
    acuity: "Stable",
    primaryPhysician: "Dr. Sarah Chen",
    department: "Pediatrics",
    insurance: "Blue Cross Blue Shield",
    heightCm: 98,
    weightKg: 15,
    age: 6,
    avatarColor: "#16a34a",
    initials: "LF",
    codeStatus: "Full Code",
    emergencyContact: { name: "Rachel Foster", relation: "Mother", phone: "(415) 555-0702" },
    allergies: [
      { id: "a1", substance: "Peanuts", reaction: "Anaphylaxis", severity: "Severe", noted: "2022" },
    ],
    medications: [
      { id: "m1", name: "Epinephrine Auto-injector", dose: "0.15 mg", route: "IM", frequency: "PRN", status: "Active", startDate: "2022-08-01", prescribedBy: "Dr. Sarah Chen", class: "Emergency" },
      { id: "m2", name: "Cetirizine", dose: "5 mg", route: "PO", frequency: "QD PRN", status: "Active", startDate: "2023-02-01", prescribedBy: "Dr. Sarah Chen", class: "Antihistamine" },
    ],
    labs: [
      { id: "l1", name: "Complete Blood Count", value: "Normal", unit: "", range: "—", flag: "Normal", category: "Hematology", collected: "2025-11-01 10:00" },
      { id: "l2", name: "Lead Screen", value: "<3.5", unit: "ug/dL", range: "<3.5", flag: "Normal", category: "Chemistry", collected: "2025-11-01 10:00" },
    ],
    vitals: genVitals(72, 4),
    history: [
      { id: "h1", date: "2025-11-01", title: "Well-Child Visit (Age 6)", type: "Visit", description: "Routine check-up, growth on track, developmental milestones met.", provider: "Dr. Sarah Chen" },
      { id: "h2", date: "2022-08-01", title: "Peanut Allergy", type: "Allergy", description: "Anaphylaxis after accidental exposure. EpiPen prescribed.", provider: "Dr. Sarah Chen" },
      { id: "h3", date: "2025-11-01", title: "MMR & DTaP Boosters", type: "Vaccination", description: "Age-appropriate immunizations administered.", provider: "Dr. Sarah Chen" },
      { id: "h4", date: "2024-03-10", title: "Acute Otitis Media", type: "Diagnosis", description: "Resolved with amoxicillin course.", provider: "Dr. Sarah Chen" },
    ],
    notes: [
      { id: "n1", date: "2025-11-01 10:30", author: "Dr. Sarah Chen", role: "Attending", type: "Progress", content: "6yo healthy, growing well. Peanut allergy action plan reviewed with parents, EpiPen refilled. Next well-child visit age 7." },
    ],
  },
  {
    id: "P-1008",
    mrn: "MRN-559688",
    firstName: "Sofia",
    lastName: "Rossi",
    dateOfBirth: "2001-06-22",
    gender: "Female",
    pronouns: "she/her",
    bloodType: "A+",
    phone: "(415) 555-0884",
    email: "sofia.rossi@example.com",
    address: "1400 Market Street, San Francisco, CA 94102",
    status: "Outpatient",
    acuity: "Fair",
    primaryPhysician: "Dr. Sarah Chen",
    department: "Internal Medicine",
    insurance: "Aetna PPO",
    heightCm: 170,
    weightKg: 62,
    age: 24,
    avatarColor: "#9333ea",
    initials: "SR",
    codeStatus: "Full Code",
    emergencyContact: { name: "Gianna Rossi", relation: "Sister", phone: "(415) 555-0870" },
    allergies: [],
    medications: [
      { id: "m1", name: "Levothyroxine", dose: "75 mcg", route: "PO", frequency: "QD", status: "Active", startDate: "2022-10-01", prescribedBy: "Dr. Sarah Chen", class: "Thyroid hormone" },
      { id: "m2", name: "Oral Contraceptive", dose: "1 tab", route: "PO", frequency: "QD", status: "Active", startDate: "2023-01-15", prescribedBy: "Dr. Sarah Chen", class: "Hormonal" },
    ],
    labs: [
      { id: "l1", name: "TSH", value: "2.8", unit: "uIU/mL", range: "0.4-4.0", flag: "Normal", category: "Endocrinology", collected: "2025-12-20 09:00" },
      { id: "l2", name: "Free T4", value: "1.2", unit: "ng/dL", range: "0.9-1.7", flag: "Normal", category: "Endocrinology", collected: "2025-12-20 09:00" },
      { id: "l3", name: "Complete Blood Count", value: "Normal", unit: "", range: "—", flag: "Normal", category: "Hematology", collected: "2025-12-20 09:00" },
    ],
    vitals: genVitals(83, 4),
    history: [
      { id: "h1", date: "2022-10-01", title: "Hypothyroidism", type: "Diagnosis", description: "Hashimoto's thyroiditis, started levothyroxine.", provider: "Dr. Sarah Chen" },
      { id: "h2", date: "2025-12-20", title: "Annual Exam", type: "Visit", description: "Routine exam, thyroid stable, counseling provided.", provider: "Dr. Sarah Chen" },
      { id: "h3", date: "2025-10-05", title: "HPV Vaccine (Dose 2)", type: "Vaccination", description: "Gardasil series continued.", provider: "Dr. Sarah Chen" },
    ],
    notes: [
      { id: "n1", date: "2025-12-20 09:45", author: "Dr. Sarah Chen", role: "Attending", type: "Progress", content: "24F, hypothyroidism well-controlled on current dose, TSH normal. Continue levothyroxine. Recheck thyroid panel in 6 months." },
    ],
  },
];

// ============================================================================
// Today's Schedule / Appointments
// ============================================================================
export const appointments: Appointment[] = [
  { id: "ap1", patientId: "P-1003", patientName: "James O'Connor", patientInitials: "JO", avatarColor: "#2563eb", time: "08:30", durationMin: 30, type: "Follow-up", department: "Internal Medicine", status: "Completed", notes: "Anxiety management follow-up" },
  { id: "ap2", patientId: "P-1008", patientName: "Sofia Rossi", patientInitials: "SR", avatarColor: "#9333ea", time: "09:15", durationMin: 20, type: "Telehealth", department: "Internal Medicine", status: "Completed", notes: "Thyroid panel review" },
  { id: "ap3", patientId: "P-1006", patientName: "Eleanor Whitfield", patientInitials: "EW", avatarColor: "#0891b2", time: "10:00", durationMin: 45, type: "Consult", department: "Neurology", status: "In Progress", notes: "Acute stroke — family meeting" },
  { id: "ap4", patientId: "P-1004", patientName: "Aisha Bennett", patientInitials: "AB", avatarColor: "#db2777", time: "11:00", durationMin: 30, type: "Follow-up", department: "Internal Medicine", status: "Checked-in", notes: "DKA management rounds" },
  { id: "ap5", patientId: "P-1002", patientName: "Maria Gonzalez", patientInitials: "MG", avatarColor: "#7c3aed", time: "13:00", durationMin: 60, type: "Procedure", department: "Cardiology", status: "Scheduled", notes: "Cardiac catheterization" },
  { id: "ap6", patientId: "P-1005", patientName: "Daniel Kim", patientInitials: "DK", avatarColor: "#ea580c", time: "14:30", durationMin: 30, type: "Follow-up", department: "Orthopedics", status: "Scheduled", notes: "Post-op TKR — 2 week check" },
  { id: "ap7", patientId: "P-1007", patientName: "Liam Foster", patientInitials: "LF", avatarColor: "#16a34a", time: "15:15", durationMin: 20, type: "New Patient", department: "Pediatrics", status: "Scheduled", notes: "Allergy action plan review" },
  { id: "ap8", patientId: "P-1001", patientName: "Robert Hawkins", patientInitials: "RH", avatarColor: "#13726c", time: "16:00", durationMin: 45, type: "Follow-up", department: "Intensive Care", status: "Scheduled", notes: "ICU rounds — sepsis reassessment" },
];

// ============================================================================
// Secure Messages / Inbox
// ============================================================================
export const messages: Message[] = [
  { id: "msg1", from: "Lab — Chemistry", fromRole: "Automated", subject: "CRITICAL: Lactate 3.2 — Robert Hawkins", preview: "Critical value requires immediate physician notification...", body: "Critical lab value reported for patient Robert Hawkins (MRN-558210). Lactate: 3.2 mmol/L (ref 0.5-2.0). Per protocol, immediate physician acknowledgment is required. Patient is in ICU-04.", time: "07:42", read: false, priority: "Urgent", category: "Lab" },
  { id: "msg2", from: "Nurse Patel", fromRole: "RN, ICU", subject: "Re: R. Hawkins — Vasopressor weaning", preview: "MAP holding at 72 off pressors, agreeing with your plan...", body: "Dr. Chen, confirming Robert Hawkins has been off norepinephrine for 4 hours with MAP stable at 72. He is following commands and tolerating the CPAP trial. Agree with step-down plan pending the 12h reassessment.", time: "07:15", read: false, priority: "High", category: "Patient" },
  { id: "msg3", from: "Cardiology — Dr. Reyes", fromRole: "Interventional", subject: "M. Gonzalez cath confirmation", preview: "Cath lab booked for 13:00, radial access planned...", body: "Confirming cardiac catheterization for Maria Gonzalez at 13:00 today. We'll plan radial access given her anticoagulation status. Will call with findings.", time: "Yesterday", read: true, priority: "Normal", category: "Referral" },
  { id: "msg4", from: "Pharmacy", fromRole: "Clinical Pharmacist", subject: "Drug interaction alert — A. Bennett", preview: "Metformin + contrast hold recommendation...", body: "Reminder: Aisha Bennett is on metformin. If any iodinated contrast imaging is planned, metformin should be held 48h prior and renal function rechecked. No contrast currently scheduled.", time: "Yesterday", read: true, priority: "Normal", category: "Patient" },
  { id: "msg5", from: "IT — System", fromRole: "Administrator", subject: "Scheduled maintenance — EHR downtime", preview: "Brief read-only mode Sunday 02:00-04:00...", body: "A planned EHR maintenance window will place the system in read-only mode this Sunday from 02:00 to 04:00. Downtime forms will be available on the intranet.", time: "2 days ago", read: true, priority: "Normal", category: "System" },
  { id: "msg6", from: "Dr. Alan Frye", fromRole: "Hospitalist", subject: "E. Whitfield — goals of care", preview: "Family meeting at 10:00, son requesting to discuss...", body: "Family meeting for Eleanor Whitfield set for 10:00. Her son Thomas wants to discuss escalation limits given the stroke and her DNI status. I'll join you.", time: "Yesterday", read: false, priority: "High", category: "Patient" },
];

// ============================================================================
// Orders (CPOE) — active + recent
// ============================================================================
export const orders: OrderItem[] = [
  { id: "o1", type: "Medication", name: "Vancomycin 1g IV Q12H", detail: "Trough level before 4th dose", priority: "STAT", status: "Active", ordered: "2026-01-08 14:20", orderedBy: "Dr. Sarah Chen" },
  { id: "o2", type: "Laboratory", name: "Blood Cultures x2", detail: "Aerobic & anaerobic, peripheral", priority: "STAT", status: "Completed", ordered: "2026-01-08 14:25", orderedBy: "Dr. Sarah Chen" },
  { id: "o3", type: "Imaging", name: "Chest X-Ray (Portable)", detail: "PA/AP, ICU", priority: "Routine", status: "Completed", ordered: "2026-01-08 14:30", orderedBy: "Dr. Sarah Chen" },
  { id: "o4", type: "Laboratory", name: "CBC w/ Differential", detail: "AM draw", priority: "Routine", status: "Completed", ordered: "2026-01-10 06:00", orderedBy: "Dr. Sarah Chen" },
  { id: "o5", type: "Medication", name: "Insulin Drip (DKA protocol)", detail: "0.1 units/kg/hr, titrate", priority: "STAT", status: "Active", ordered: "2026-01-10 04:10", orderedBy: "Dr. Sarah Chen" },
  { id: "o6", type: "Nursing", name: "Neuro Checks Q1H", detail: "GCS, pupils, extremity strength", priority: "Urgent", status: "Active", ordered: "2026-01-10 02:30", orderedBy: "Dr. Sarah Chen" },
  { id: "o7", type: "Referral", name: "Physical Therapy Consult", detail: "Stroke rehab evaluation", priority: "Routine", status: "Pending", ordered: "2026-01-10 06:15", orderedBy: "Dr. Sarah Chen" },
  { id: "o8", type: "Imaging", name: "CT Head w/o Contrast", detail: "Rule out hemorrhage", priority: "STAT", status: "Completed", ordered: "2026-01-10 02:20", orderedBy: "Dr. Sarah Chen" },
];

// ============================================================================
// Clinical Alerts / Notifications
// ============================================================================
export const alerts: Alert[] = [
  { id: "al1", patientName: "Robert Hawkins", patientId: "P-1001", avatarColor: "#13726c", initials: "RH", type: "Critical Lab", message: "WBC 18.4 K/uL and Lactate 3.2 mmol/L — critical values", time: "07:42", severity: "Critical" },
  { id: "al2", patientName: "Aisha Bennett", patientId: "P-1004", avatarColor: "#db2777", initials: "AB", type: "Critical Lab", message: "Glucose 312 mg/dL, A1c 9.4% — DKA protocol active", time: "07:10", severity: "Critical" },
  { id: "al3", patientName: "Eleanor Whitfield", patientId: "P-1006", avatarColor: "#0891b2", initials: "EW", type: "Fall Risk", message: "High fall risk — bed alarm & hourly rounding enabled", time: "06:30", severity: "Warning" },
  { id: "al4", patientName: "Maria Gonzalez", patientId: "P-1002", avatarColor: "#7c3aed", initials: "MG", type: "Medication", message: "Dual antiplatelet therapy — bleeding risk before cath", time: "Yesterday", severity: "Warning" },
  { id: "al5", patientName: "Robert Hawkins", patientId: "P-1001", avatarColor: "#13726c", initials: "RH", type: "Allergy", message: "Severe Penicillin allergy — Vancomycin substituted", time: "Jan 8", severity: "Info" },
];

// ============================================================================
// Department census (for dashboard widgets)
// ============================================================================
export const departmentStats = [
  { department: "Intensive Care", census: 12, capacity: 16, acuity: "Critical" },
  { department: "Cardiology", census: 24, capacity: 30, acuity: "Serious" },
  { department: "Internal Medicine", census: 41, capacity: 48, acuity: "Moderate" },
  { department: "Neurology", census: 18, capacity: 22, acuity: "Serious" },
  { department: "Orthopedics", census: 15, capacity: 20, acuity: "Stable" },
  { department: "Pediatrics", census: 9, capacity: 14, acuity: "Stable" },
];

export const weeklyAdmissions = [
  { day: "Mon", admitted: 28, discharged: 19 },
  { day: "Tue", admitted: 34, discharged: 22 },
  { day: "Wed", admitted: 31, discharged: 27 },
  { day: "Thu", admitted: 42, discharged: 24 },
  { day: "Fri", admitted: 38, discharged: 31 },
  { day: "Sat", admitted: 22, discharged: 18 },
  { day: "Sun", admitted: 17, discharged: 20 },
];

// Quick lookup
export const getPatientById = (id: string) =>
  patients.find((p) => p.id === id);
