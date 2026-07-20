// Central typed API client. Components never call fetch directly (see CLAUDE.md).
import type {
  AdminOverview,
  Appointment,
  AuditEntry,
  DashboardStats,
  Diagnosis,
  Encounter,
  EncounterSummary,
  Facility,
  Icd10Item,
  Medication,
  Notification,
  Order,
  Patient,
  PatientSummary,
  Permission,
  RoleDef,
  Token,
  User,
  Vitals,
} from "../types";

const TOKEN_KEY = "emr_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    if (!path.startsWith("/auth/login")) window.location.href = "/login";
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// --- Auth ---
export const api = {
  login: (username: string, password: string) =>
    request<Token>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<User>("/auth/me"),

  // --- Reference ---
  facilities: () => request<Facility[]>("/facilities"),
  providers: (department?: string) =>
    request<User[]>(`/providers${department && department !== "All" ? `?department=${encodeURIComponent(department)}` : ""}`),
  departments: () => request<string[]>("/departments"),

  // --- Admin console: users, roles, permissions, audit ---
  listStaff: () => request<User[]>("/users"),
  createStaff: (data: StaffInput) =>
    request<User>("/users", { method: "POST", body: JSON.stringify(data) }),
  updateStaff: (id: number, data: Partial<StaffInput> & { is_active?: boolean }) =>
    request<User>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deactivateStaff: (id: number) =>
    request<User>(`/users/${id}/deactivate`, { method: "POST" }),
  listRoles: () => request<RoleDef[]>("/roles"),
  createRole: (data: { key: string; name: string; description?: string; permissions: string[] }) =>
    request<RoleDef>("/roles", { method: "POST", body: JSON.stringify(data) }),
  updateRole: (id: number, data: { name?: string; description?: string; permissions?: string[] }) =>
    request<RoleDef>(`/roles/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  listPermissions: () => request<Permission[]>("/permissions"),
  adminOverview: () => request<AdminOverview>("/admin/overview"),
  auditLog: (params: { user?: string; patient_id?: number; action?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.user) qs.set("user", params.user);
    if (params.patient_id) qs.set("patient_id", String(params.patient_id));
    if (params.action) qs.set("action", params.action);
    const q = qs.toString();
    return request<AuditEntry[]>(`/audit${q ? `?${q}` : ""}`);
  },
  transferPatient: (patientId: number, toProviderId: number, reason: string) =>
    request<Patient>(`/patients/${patientId}/transfer`, {
      method: "POST",
      body: JSON.stringify({ to_provider_id: toProviderId, reason }),
    }),
  searchIcd10: (q: string) => request<Icd10Item[]>(`/reference/icd10?q=${encodeURIComponent(q)}`),
  dashboard: () => request<DashboardStats>("/dashboard"),
  notifications: (opts: { category?: string; patient_id?: number } = {}) => {
    const qs = new URLSearchParams();
    if (opts.category) qs.set("category", opts.category);
    if (opts.patient_id) qs.set("patient_id", String(opts.patient_id));
    const q = qs.toString();
    return request<Notification[]>(`/notifications${q ? `?${q}` : ""}`);
  },

  // --- Patients ---
  listPatients: (q = "") =>
    request<PatientSummary[]>(`/patients${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  getPatient: (id: number) => request<Patient>(`/patients/${id}`),
  createPatient: (data: Partial<Patient>) =>
    request<Patient>("/patients", { method: "POST", body: JSON.stringify(data) }),
  updatePatient: (id: number, data: Partial<Patient>) =>
    request<Patient>(`/patients/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  addMedication: (patientId: number, med: Partial<Medication>) =>
    request<Medication>(`/patients/${patientId}/medications`, {
      method: "POST",
      body: JSON.stringify(med),
    }),
  discontinueMedication: (patientId: number, medId: number) =>
    request<Medication>(`/patients/${patientId}/medications/${medId}/discontinue`, {
      method: "POST",
    }),

  // --- Appointments ---
  visitTypes: () => request<string[]>("/reference/visit-types"),
  listAppointments: (params: AppointmentQuery = {}) => {
    const qs = new URLSearchParams();
    if (params.date_from) qs.set("date_from", params.date_from);
    if (params.date_to) qs.set("date_to", params.date_to);
    if (params.appointment_type && params.appointment_type !== "All")
      qs.set("appointment_type", params.appointment_type);
    if (params.reason) qs.set("reason", params.reason);
    if (params.sort) qs.set("sort", params.sort);
    const q = qs.toString();
    return request<Appointment[]>(`/appointments${q ? `?${q}` : ""}`);
  },
  createAppointment: (data: AppointmentInput) =>
    request<Appointment>("/appointments", { method: "POST", body: JSON.stringify(data) }),

  // --- Encounters ---
  listPatientEncounters: (patientId: number) =>
    request<EncounterSummary[]>(`/patients/${patientId}/encounters`),
  getEncounter: (id: number) => request<Encounter>(`/encounters/${id}`),
  createEncounter: (data: EncounterInput) =>
    request<Encounter>("/encounters", { method: "POST", body: JSON.stringify(data) }),
  updateEncounter: (id: number, data: Partial<EncounterInput>) =>
    request<Encounter>(`/encounters/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  signEncounter: (id: number) =>
    request<Encounter>(`/encounters/${id}/sign`, { method: "POST" }),
};

export interface StaffInput {
  username: string;
  full_name: string;
  email: string;
  password: string;
  role: string;
  credentials?: string;
  department?: string;
  scope_level?: string;
  scope_county?: string;
}

export interface AppointmentQuery {
  date_from?: string;
  date_to?: string;
  appointment_type?: string;
  reason?: string;
  sort?: "asc" | "desc";
}

export interface AppointmentInput {
  patient_id: number;
  provider_id?: number; // required for front-desk booking
  scheduled_at: string; // ISO datetime
  appointment_type: string; // visit type (required)
  reason?: string;
}

export interface EncounterInput extends Vitals {
  patient_id: number;
  provider_id?: number | null;
  encounter_type?: string;
  reason?: string;
  chief_complaint?: string;
  history_present_illness?: string;
  review_of_systems?: string;
  physical_exam?: string;
  patient_instructions?: string;
  follow_up?: string;
  diagnoses?: Diagnosis[];
  orders?: Order[];
  medications?: Partial<Medication>[];
}
