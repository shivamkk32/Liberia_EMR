// Shared TypeScript types — mirror the backend Pydantic schemas.

export type Role = "admin" | "physician" | "nurse" | "front_desk" | "lab" | "pharmacy";

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  credentials: string;
  role: Role;
  department: string;
  doctor_id: string; // e.g. DOC-0001
  facility_id: number | null;
  scope_level: string; // National / County / District / Facility
  scope_county: string;
  is_active: boolean;
  must_change_password: boolean;
  permissions: string[]; // effective permission codes
}

export interface Permission {
  code: string;
  domain: string;
  description: string;
}

export interface RoleDef {
  id: number;
  key: string;
  name: string;
  description: string;
  is_system: boolean;
  permissions: string[];
}

export interface AuditEntry {
  id: number;
  username: string;
  role: string;
  scope: string;
  action: string;
  entity: string;
  entity_id: number | null;
  patient_id: number | null;
  patient_name: string | null;
  decision: string; // allow / deny
  detail: string;
  timestamp: string | null;
}

export interface AdminOverview {
  total_users: number;
  active_users: number;
  inactive_users: number;
  total_doctors: number;
  total_patients: number;
  total_appointments: number;
  upcoming_appointments: number;
  total_encounters: number;
  total_facilities: number;
  total_roles: number;
  total_permissions: number;
  pending_onboarding: number;
  denials_recent: number;
  users_by_role: { key: string; name: string; count: number }[];
  doctors_by_department: { department: string; count: number }[];
  recent_users: User[];
  recent_activity: AuditEntry[];
}

export interface Token {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Facility {
  id: number;
  name: string;
  code: string;
  county: string;
  facility_type: string;
}

export interface Allergy {
  id?: number;
  substance: string;
  reaction: string;
  severity: string;
  status: string;
  noted_date?: string | null;
}

export interface Problem {
  id?: number;
  description: string;
  icd10_code: string;
  status: string;
  onset_date?: string | null;
}

export interface Medication {
  id?: number;
  name: string;
  dose: string;
  form: string;
  route: string;
  frequency: string;
  status: string;
  start_date?: string | null;
  encounter_id?: number | null;
}

export interface PatientSummary {
  id: number;
  mrn: string;
  prn?: string | null;
  national_id: string;
  title: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: string;
  phone: string;
  insurance_provider: string;
  portal_enrolled: boolean;
  active: boolean;
}

export interface Patient extends PatientSummary {
  middle_name: string;
  marital_status: string;
  blood_group: string;
  race: string;
  nationality: string;
  occupation: string;
  religion: string;
  disability: string;
  language: string;
  alt_phone: string;
  email: string;
  address: string;
  town: string;
  district: string;
  county: string;
  next_of_kin_name: string;
  next_of_kin_relationship: string;
  next_of_kin_phone: string;
  insurance_id: string;
  insurance_scheme: string;
  primary_provider_id: number | null;
  primary_provider_name: string | null;
  facility_id: number | null;
  facility_name: string | null;
  created_at: string | null;
  allergies: Allergy[];
  problems: Problem[];
  medications: Medication[];
}

export interface Diagnosis {
  id?: number;
  description: string;
  icd10_code: string;
  status: string;
  onset_date?: string | null;
}

export interface Order {
  id?: number;
  order_type: string;
  description: string;
  status: string;
  ordered_at?: string | null;
}

export interface Vitals {
  bp_systolic?: number | null;
  bp_diastolic?: number | null;
  heart_rate?: number | null;
  resp_rate?: number | null;
  temperature_f?: number | null;
  spo2?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  bmi?: number | null;
  pain_score?: number | null;
}

export interface EncounterSummary {
  id: number;
  patient_id: number;
  encounter_type: string;
  status: string;
  reason: string;
  chief_complaint: string;
  provider_id: number;
  provider_name: string | null;
  created_at: string | null;
  signed_at: string | null;
}

export interface Encounter extends EncounterSummary, Vitals {
  history_present_illness: string;
  review_of_systems: string;
  physical_exam: string;
  patient_instructions: string;
  follow_up: string;
  facility_id: number | null;
  patient_name: string | null;
  diagnoses: Diagnosis[];
  orders: Order[];
  medications: Medication[];
}

export interface Appointment {
  id: number;
  patient_id: number;
  patient_name: string | null;
  provider_id: number;
  provider_name: string | null;
  scheduled_at: string;
  appointment_type: string;
  status: string;
  reason: string;
}

export interface Notification {
  id: number;
  title: string;
  message: string;
  level: string; // info | warning | critical | success
  category: string;
  patient_id: number | null;
  patient_name: string | null;
  patient_mrn: string | null;
  created_at: string | null;
}

export interface DashboardStats {
  scope: "provider" | "facility";
  provider_name: string | null;
  my_patients: number;
  encounters_today: number;
  upcoming_appointments: number;
  draft_encounters: number;
  signed_encounters: number;
  total_encounters: number;
  patients: PatientSummary[];
  todays_encounters: EncounterSummary[];
  upcoming: Appointment[];
  notifications: Notification[];
}

export interface Icd10Item {
  code: string;
  description: string;
}
