import type {
  AccessLevel,
  AttendanceMethod,
  AttendanceRecord,
  AttendanceStatusCode,
  AttendanceStatusLabel,
  DivisionNumber,
  DivisionSummary,
  MonthlyLopApprovalRecord,
  UserRoleRecord,
  WorkerCategory,
  WorkerGender,
} from '../types/attendance';

export const DEFAULT_CLC_DATE = '2026-11-26';
export const ALL_DIVISIONS: DivisionNumber[] = [1, 2, 3, 4, 5, 6, 7];

export const STATUS_LABELS: Record<AttendanceStatusCode, AttendanceStatusLabel> = {
  P: 'Present',
  LATE: 'Late Punch-In',
  HD: 'Half-Day (Loss of Pay)',
  LOP: 'Absent (Loss of Pay)',
  L: 'Approved Leave',
};

export function formatDisplayDate(isoDate: string): string {
  const trimmed = isoDate.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return trimmed;
}

export function formatInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function calculateLopDays(statusCode: AttendanceStatusCode): number {
  if (statusCode === 'LOP') return 1.0;
  if (statusCode === 'HD') return 0.5;
  return 0.0;
}

export function getStatusLabel(statusCode: AttendanceStatusCode): AttendanceStatusLabel {
  return STATUS_LABELS[statusCode] ?? 'Present';
}

export function normalizeStatusCode(raw: unknown): AttendanceStatusCode {
  const value = String(raw ?? 'P').trim().toUpperCase();
  if (value === 'P' || value === 'LATE' || value === 'HD' || value === 'LOP' || value === 'L') {
    return value;
  }
  return 'P';
}

export function normalizeEmployeeCode(raw: unknown, fallbackNum: number): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length >= 6) {
    return digits.slice(0, 6);
  }
  if (digits.length > 0) {
    return digits.padStart(6, '0');
  }
  return String(fallbackNum).padStart(6, '0');
}

export function normalizeDivision(raw: unknown, sheetFallback = 1): DivisionNumber {
  const match = String(raw ?? '').match(/[1-7]/);
  const num = match ? Number(match[0]) : sheetFallback;
  if (num >= 1 && num <= 7) {
    return num as DivisionNumber;
  }
  return 1;
}

export function normalizeName(rawName: unknown): string {
  return String(rawName ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCategory(rawDesignation: unknown): WorkerCategory {
  const value = String(rawDesignation ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (value.includes('driver')) {
    return 'Driver';
  }
  if (value.includes('supervisor')) {
    return 'Supervisor';
  }
  return 'Sanitary Worker';
}

export function getDailyWageByCategory(category: WorkerCategory): number {
  if (category === 'Driver') return 750;
  if (category === 'Supervisor') return 850;
  return 620;
}

export function normalizeGender(rawGender: unknown): WorkerGender {
  const value = String(rawGender ?? '').trim().toLowerCase();
  if (value.startsWith('f')) {
    return 'Female';
  }
  return 'Male';
}

export function normalizeAttendanceMethod(raw: unknown, indexSeed = 0): AttendanceMethod {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'face') return 'Face';
  if (value === 'finger' || value === 'fingerprint') return 'Finger';
  return indexSeed % 3 === 0 ? 'Face' : 'Finger';
}

export function parseTimeToMinutes(timeStr: string): number | null {
  const cleaned = timeStr.trim().toUpperCase();
  if (!cleaned || cleaned === '--:--' || cleaned === '--' || cleaned === 'N/A') {
    return null;
  }

  const amPmMatch = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (amPmMatch) {
    let hours = Number(amPmMatch[1]);
    const mins = Number(amPmMatch[2]);
    const period = amPmMatch[3];
    if (hours < 1 || hours > 12 || mins < 0 || mins > 59) return null;
    if (period === 'AM' && hours === 12) hours = 0;
    if (period === 'PM' && hours !== 12) hours += 12;
    return hours * 60 + mins;
  }

  const militaryMatch = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (militaryMatch) {
    const hours = Number(militaryMatch[1]);
    const mins = Number(militaryMatch[2]);
    if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
    return hours * 60 + mins;
  }

  return null;
}

/**
 * Automatically calculates Total Working Hours (out_time - in_time) as "HH:MM (Xh Ym)",
 * or "Still on Duty" when out_time is missing, or "--" when absent.
 */
export function calculateTotalDuration(inTime: string, outTime: string): string {
  const inMins = parseTimeToMinutes(inTime);
  if (inMins === null) {
    return '--';
  }

  const outMinsRaw = parseTimeToMinutes(outTime);
  if (outMinsRaw === null) {
    return 'Still on Duty';
  }

  let diff = outMinsRaw - inMins;
  if (diff < 0) {
    diff += 24 * 60;
  }

  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  const hh = String(hours).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  return `${hh}:${mm} (${hours}h ${mm}m)`;
}

export function getRoleTitleByLevel(
  level: AccessLevel,
  division?: number | 'All'
): string {
  switch (level) {
    case 1:
      return typeof division === 'number' ? `Div ${division} SO` : 'Div SO';
    case 2:
      return 'MHO';
    case 3:
      return 'Commissioner';
  }
}

export function buildApprovalsFromRecords(
  records: AttendanceRecord[],
  existingApprovals?: Map<string, { gm_approval_status: string; approved_by: string }>
): MonthlyLopApprovalRecord[] {
  const grouped = new Map<string, AttendanceRecord[]>();
  for (const rec of records) {
    const list = grouped.get(rec.employee_code) ?? [];
    list.push(rec);
    grouped.set(rec.employee_code, list);
  }

  const result: MonthlyLopApprovalRecord[] = [];
  let idx = 1;
  for (const [empCode, empLogs] of grouped.entries()) {
    const first = empLogs[0];
    const daysPresent = empLogs.reduce((acc, log) => {
      if (log.status_code === 'P' || log.status_code === 'LATE') return acc + 1;
      if (log.status_code === 'HD') return acc + 0.5;
      return acc;
    }, 0);
    const lateCount = empLogs.filter((l) => l.status_code === 'LATE').length;
    const approvedLeaves = empLogs.filter((l) => l.status_code === 'L').length;
    const totalLopDays = empLogs.reduce((acc, l) => acc + l.lop_days, 0);
    const totalDeduction = Math.round(totalLopDays * first.daily_wage_inr);

    const existing = existingApprovals?.get(empCode);
    const defaultStatus =
      totalLopDays > 0 || approvedLeaves > 0
        ? 'Pending Commissioner Sign-Off'
        : 'Approved';
    const defaultApprover =
      defaultStatus === 'Approved' ? 'M. Subramanian (Commissioner)' : 'Pending';

    result.push({
      approval_id: `APR-202611-${String(idx).padStart(3, '0')}`,
      month_year: 'Nov-2026',
      employee_code: empCode,
      division: first.division,
      name: first.name,
      category: first.category,
      gender: first.gender,
      days_present: daysPresent,
      late_count: lateCount,
      approved_leaves: approvedLeaves,
      total_lop_days: totalLopDays,
      daily_wage_inr: first.daily_wage_inr,
      total_lop_deduction_inr: totalDeduction,
      gm_approval_status: existing?.gm_approval_status ?? defaultStatus,
      approved_by: existing?.approved_by ?? defaultApprover,
    });
    idx++;
  }

  return result;
}

export function computeDivisionSummaries(
  recordsForDate: AttendanceRecord[],
  divisionsToShow: DivisionNumber[] = ALL_DIVISIONS
): DivisionSummary[] {
  return divisionsToShow.map((div) => {
    const divLogs = recordsForDate.filter((r) => r.division === div);
    const presentCount = divLogs.filter((l) => l.status_code === 'P').length;
    const lateOrHalfDayCount = divLogs.filter(
      (l) => l.status_code === 'LATE' || l.status_code === 'HD'
    ).length;
    const approvedLeaveCount = divLogs.filter((l) => l.status_code === 'L').length;
    const absentLopCount = divLogs.filter((l) => l.status_code === 'LOP').length;

    const driverCount = divLogs.filter((l) => l.category === 'Driver').length;
    const sanitaryWorkerCount = divLogs.filter(
      (l) => l.category === 'Sanitary Worker'
    ).length;
    const fingerCount = divLogs.filter(
      (l) => l.attendance_method === 'Finger'
    ).length;
    const faceCount = divLogs.filter(
      (l) => l.attendance_method === 'Face'
    ).length;

    const totalLopDays = divLogs.reduce((sum, l) => sum + l.lop_days, 0);
    const totalLopDeductionInr = divLogs.reduce(
      (sum, l) => sum + l.daily_lop_deduction_inr,
      0
    );

    const totalWorkers = divLogs.length;
    const effectivePresent = presentCount + lateOrHalfDayCount;
    const attendanceRatePct =
      totalWorkers > 0
        ? Math.round((effectivePresent / totalWorkers) * 1000) / 10
        : 0;

    return {
      division: div,
      label: `Division ${div}`,
      totalWorkers,
      presentCount,
      lateOrHalfDayCount,
      approvedLeaveCount,
      absentLopCount,
      driverCount,
      sanitaryWorkerCount,
      fingerCount,
      faceCount,
      totalLopDays,
      totalLopDeductionInr,
      attendanceRatePct,
    };
  });
}

export function buildDefaultUsers(): UserRoleRecord[] {
  const divSoNames: Record<DivisionNumber, string> = {
    1: 'Kallidoss U',
    2: 'S. Rajendran',
    3: 'R. Vasanth',
    4: 'P. Arumugam',
    5: 'Muthupandi S',
    6: 'N. Selvam',
    7: 'K. Murugan',
  };

  const divUsers: UserRoleRecord[] = ALL_DIVISIONS.map((div) => ({
    user_id: `USR-${String(div).padStart(3, '0')}`,
    employee_id: `EMP-10${div}`,
    full_name: divSoNames[div],
    email: `div${div}.so@clc.gov.in`,
    password_hash: `pw_clc_div${div}`,
    access_level: 1,
    role_title: `Div ${div} SO`,
    assigned_division: div,
    assigned_department: `Division ${div}`,
    assigned_shift: 'Shift A',
    account_status: 'Active',
  }));

  return [
    ...divUsers,
    {
      user_id: 'USR-008',
      employee_id: 'EMP-201',
      full_name: 'K. Meenakshi',
      email: 'mho@clc.gov.in',
      password_hash: 'pw_clc_mho',
      access_level: 2,
      role_title: 'MHO',
      assigned_division: 'All',
      assigned_department: 'All',
      assigned_shift: 'All',
      account_status: 'Active',
    },
    {
      user_id: 'USR-009',
      employee_id: 'EMP-301',
      full_name: 'M. Subramanian',
      email: 'commissioner@clc.gov.in',
      password_hash: 'pw_clc_commissioner',
      access_level: 3,
      role_title: 'Commissioner',
      assigned_division: 'All',
      assigned_department: 'All',
      assigned_shift: 'All',
      account_status: 'Active',
    },
  ];
}
