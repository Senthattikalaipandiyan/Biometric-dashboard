export type AccessLevel = 1 | 2 | 3;

export type AttendanceStatusCode = 'P' | 'LATE' | 'HD' | 'LOP' | 'L';

export type AttendanceStatusLabel =
  | 'Present'
  | 'Late Punch-In'
  | 'Half-Day (Loss of Pay)'
  | 'Absent (Loss of Pay)'
  | 'Approved Leave';

export type WorkerCategory = 'Driver' | 'Sanitary Worker' | 'Supervisor';

export type WorkerGender = 'Male' | 'Female';

export type AttendanceMethod = 'Finger' | 'Face' | '--';

export type WorkerShift = 'Shift A' | 'Shift B' | 'Shift C';

export type DivisionNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface UserRoleRecord {
  user_id: string;
  employee_id: string;
  full_name: string;
  email: string;
  password_hash: string;
  access_level: AccessLevel;
  role_title: string;
  assigned_division: number | 'All';
  assigned_department: string;
  assigned_shift: string;
  account_status: string;
}

/**
 * Exact 11 client attendance fields + supporting biometric metadata
 * for Div SO / MHO / Commissioner workflow & Go + PostgreSQL backend migration.
 */
export interface AttendanceRecord {
  // 11 mandatory client fields
  s_no: number;
  employee_code: string; // 6-digit padded code e.g. "100101"
  division: DivisionNumber; // 1 to 7
  name: string;
  category: WorkerCategory; // "Driver" | "Sanitary worker"
  gender: WorkerGender; // "Male" | "Female"
  date: string; // ISO YYYY-MM-DD (default "2026-11-26")
  in_time: string; // e.g. "06:00 AM" or "--:--"
  out_time: string; // e.g. "02:00 PM" or "--:--"
  attendance_method: AttendanceMethod; // "Finger" | "Face"
  total_duration: string; // Calculated "HH:MM (Xh Ym)" | "In Progress" | "--"

  // Supporting workflow & payroll/approval fields
  log_id: string;
  shift: WorkerShift;
  raw_designation: string;
  father_or_husband_name?: string;
  cell_number?: string;
  status_code: AttendanceStatusCode;
  status_label: AttendanceStatusLabel;
  daily_wage_inr: number;
  lop_days: number;
  daily_lop_deduction_inr: number;
  verified_by: string;
  remarks: string;
}

export interface MonthlyLopApprovalRecord {
  approval_id: string;
  month_year: string;
  employee_code: string;
  division: DivisionNumber;
  name: string;
  category: WorkerCategory;
  gender: WorkerGender;
  days_present: number;
  late_count: number;
  approved_leaves: number;
  total_lop_days: number;
  daily_wage_inr: number;
  total_lop_deduction_inr: number;
  gm_approval_status: string;
  approved_by: string;
}

export interface DivisionSummary {
  division: DivisionNumber;
  label: string;
  totalWorkers: number;
  presentCount: number;
  lateOrHalfDayCount: number;
  approvedLeaveCount: number;
  absentLopCount: number;
  driverCount: number;
  sanitaryWorkerCount: number;
  fingerCount: number;
  faceCount: number;
  totalLopDays: number;
  totalLopDeductionInr: number;
  attendanceRatePct: number;
}

export interface AttendanceDataset {
  users: UserRoleRecord[];
  records: AttendanceRecord[];
  monthlyApprovals: MonthlyLopApprovalRecord[];
  latestDate: string;
  availableDates: string[];
  availableDivisions: DivisionNumber[];
  syncedAt: string;
  sourceFile: string;
  dataSourceMode?: 'api' | 'excel' | 'error';
  dataSourceMessage?: string;
}

export interface RegistrationPayload {
  fullName: string;
  employeeId: string;
  email: string;
  password: string;
  accessLevel: AccessLevel;
  division: DivisionNumber;
  shift: string;
}

export interface WorkerEnrollmentPayload {
  employee_code: string;
  name: string;
  division: DivisionNumber;
  shift: WorkerShift;
  category: WorkerCategory;
  gender: WorkerGender;
}

export interface WorkerUpdatePayload {
  employee_code: string;
  name: string;
  division: DivisionNumber;
  shift: WorkerShift;
  category: WorkerCategory;
  gender: WorkerGender;
}

export interface AttendanceRepository {
  loadAllData(): Promise<AttendanceDataset>;
  exportWorkbook(dataset: AttendanceDataset, filename?: string): void;
}
