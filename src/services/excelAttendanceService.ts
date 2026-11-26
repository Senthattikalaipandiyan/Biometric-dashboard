import * as XLSX from 'xlsx';
import type {
  AccessLevel,
  AttendanceDataset,
  AttendanceMethod,
  AttendanceRecord,
  AttendanceRepository,
  AttendanceStatusCode,
  AttendanceStatusLabel,
  DivisionNumber,
  DivisionSummary,
  MonthlyLopApprovalRecord,
  RegistrationPayload,
  UserRoleRecord,
  WorkerCategory,
  WorkerEnrollmentPayload,
  WorkerGender,
  WorkerShift,
  WorkerUpdatePayload,
} from '../types/attendance';

export const CLC_WORKBOOK_PATH = '/CLC Worker list as on 26.11.26.xlsx';
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

export function normalizeExcelDate(raw: unknown): string {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const yyyy = String(parsed.y).padStart(4, '0');
      const mm = String(parsed.m).padStart(2, '0');
      const dd = String(parsed.d).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  const str = String(raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  const dmyMatch = str.match(/^(\d{2})\.(\d{2})\.(\d{2,4})$/);
  if (dmyMatch) {
    const dd = dmyMatch[1];
    const mm = dmyMatch[2];
    const yyyy = dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  const parsedDate = new Date(str);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString().slice(0, 10);
  }
  return DEFAULT_CLC_DATE;
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

function formatMinutesAs12Hour(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${period}`;
}

function deriveDeterministicPunch(
  index: number,
  category: WorkerCategory
): {
  inTime: string;
  outTime: string;
  statusCode: AttendanceStatusCode;
  method: AttendanceMethod;
  remarks: string;
} {
  const method: AttendanceMethod = index % 3 === 0 ? 'Face' : 'Finger';
  const mod = index % 20;

  if (mod === 6 || mod === 17) {
    return {
      inTime: '--:--',
      outTime: '--:--',
      statusCode: 'LOP',
      method,
      remarks: 'No punch recorded — absent without leave',
    };
  }

  if (mod === 13) {
    return {
      inTime: '--:--',
      outTime: '--:--',
      statusCode: 'L',
      method,
      remarks: 'Approved leave — no salary cut',
    };
  }

  if (mod === 4 || mod === 11) {
    const lateOffset = 20 + ((index * 7) % 28);
    const inTime = formatMinutesAs12Hour(6 * 60 + lateOffset);
    const outTime = formatMinutesAs12Hour(14 * 60 + ((index * 3) % 15));
    return {
      inTime,
      outTime,
      statusCode: 'LATE',
      method,
      remarks: `Late ${method === 'Face' ? 'face scan' : 'fingerprint'} punch-in (+${lateOffset} mins)`,
    };
  }

  if (mod === 19) {
    const inTime = formatMinutesAs12Hour(6 * 60 + (index % 8));
    return {
      inTime,
      outTime: '--:--',
      statusCode: 'P',
      method,
      remarks: `${category} still on duty — punch out pending`,
    };
  }

  const inOffset = (index * 3) % 14;
  const outOffset = (index * 5) % 18;
  const inTime = formatMinutesAs12Hour(6 * 60 - 3 + inOffset);
  const outTime = formatMinutesAs12Hour(14 * 60 + outOffset);

  return {
    inTime,
    outTime,
    statusCode: 'P',
    method,
    remarks: `Marked by ${method === 'Face' ? 'Face Scan' : 'Fingerprint'}`,
  };
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

class ExcelAttendanceService implements AttendanceRepository {
  async loadAllData(): Promise<AttendanceDataset> {
    return await this.loadClcWorkbook();
  }

  private async fetchWorkbook(path: string): Promise<XLSX.WorkBook> {
    const res = await fetch(`${path}?t=${Date.now()}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${path} (${res.status})`);
    }
    const buffer = await res.arrayBuffer();
    return XLSX.read(buffer, { type: 'array' });
  }

  private async loadClcWorkbook(): Promise<AttendanceDataset> {
    const workbook = await this.fetchWorkbook(CLC_WORKBOOK_PATH);
    const records: AttendanceRecord[] = [];
    let globalSerial = 1;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(
        sheet,
        { header: 1, defval: null }
      );

      // Skip top banner rows and locate row 3 header containing NAME
      const headerRowIdx = matrix.findIndex(
        (row) =>
          Array.isArray(row) &&
          row.some((cell) => String(cell ?? '').trim().toUpperCase() === 'NAME')
      );

      if (headerRowIdx === -1) continue;

      const headers = matrix[headerRowIdx].map((h) =>
        String(h ?? '').trim().toUpperCase()
      );
      const findCol = (matcher: (h: string) => boolean) =>
        headers.findIndex(matcher);

      const colSno = findCol(
        (h) => h.includes('S.') || h === 'SNO' || h === 'S_NO' || h === 'S NO'
      );
      const colDiv = findCol((h) => h.includes('DIVISION'));
      const colName = findCol((h) => h === 'NAME');
      const colFather = findCol((h) => h.includes('FATHER'));
      const colGender = findCol((h) => h === 'GENDER');
      const colCell = findCol((h) => h.includes('CELL'));
      const colDesignation = findCol(
        (h) =>
          h.includes('DESIGNATION') ||
          h.includes('DESINATION') ||
          h.includes('CATEGORY')
      );
      const colEmpCode = findCol(
        (h) => h.includes('EMPLOYEE') && h.includes('CODE')
      );
      const colDate = findCol((h) => h === 'DATE');
      const colIn = findCol((h) => h === 'IN_TIME' || h === 'IN TIME');
      const colOut = findCol((h) => h === 'OUT_TIME' || h === 'OUT TIME');
      const colMethod = findCol(
        (h) => h.includes('ATTENDANCE') && h.includes('METHOD')
      );
      const colStatus = findCol((h) => h.includes('STATUS'));

      const sheetDivNum = normalizeDivision(sheetName, 1);
      let divRowCounter = 1;

      for (let r = headerRowIdx + 1; r < matrix.length; r++) {
        const row = matrix[r];
        if (!Array.isArray(row)) continue;
        const rawName = colName >= 0 ? row[colName] : null;
        const name = normalizeName(rawName);
        if (!name) continue;

        const rawDivisionCell = colDiv >= 0 ? row[colDiv] : null;
        const division = normalizeDivision(
          rawDivisionCell !== null && String(rawDivisionCell).trim() !== ''
            ? rawDivisionCell
            : sheetDivNum,
          sheetDivNum
        );
        const rawDesignation =
          colDesignation >= 0 && row[colDesignation]
            ? String(row[colDesignation]).replace(/\s+/g, ' ').trim()
            : 'Sanitary Worker';
        const category = normalizeCategory(rawDesignation);
        const gender = normalizeGender(colGender >= 0 ? row[colGender] : 'Male');

        const generatedEmpCode = 100000 + division * 100 + divRowCounter;
        const employeeCode = normalizeEmployeeCode(
          colEmpCode >= 0 ? row[colEmpCode] : null,
          generatedEmpCode
        );

        const date =
          colDate >= 0 && row[colDate]
            ? normalizeExcelDate(row[colDate])
            : DEFAULT_CLC_DATE;

        const derived = deriveDeterministicPunch(globalSerial, category);
        const inTime =
          colIn >= 0 && row[colIn] ? String(row[colIn]).trim() : derived.inTime;
        const outTime =
          colOut >= 0 && row[colOut]
            ? String(row[colOut]).trim()
            : derived.outTime;
        const method =
          colMethod >= 0 && row[colMethod]
            ? normalizeAttendanceMethod(row[colMethod], globalSerial)
            : derived.method;
        const statusCode =
          colStatus >= 0 && row[colStatus]
            ? normalizeStatusCode(row[colStatus])
            : derived.statusCode;

        const totalDuration = calculateTotalDuration(inTime, outTime);
        const dailyWageInr = getDailyWageByCategory(category);
        const lopDays = calculateLopDays(statusCode);

        records.push({
          s_no: globalSerial,
          employee_code: employeeCode,
          division,
          name,
          category,
          gender,
          date,
          in_time: inTime,
          out_time: outTime,
          attendance_method: method,
          total_duration: totalDuration,

          log_id: `CLC-${division}-${String(divRowCounter).padStart(3, '0')}`,
          shift: 'Shift A',
          raw_designation: rawDesignation,
          father_or_husband_name:
            colFather >= 0 && row[colFather]
              ? normalizeName(row[colFather])
              : undefined,
          cell_number:
            colCell >= 0 && row[colCell]
              ? String(row[colCell]).trim()
              : undefined,
          status_code: statusCode,
          status_label: getStatusLabel(statusCode),
          daily_wage_inr: dailyWageInr,
          lop_days: lopDays,
          daily_lop_deduction_inr: Math.round(lopDays * dailyWageInr),
          verified_by:
            statusCode === 'LOP' ? 'Pending' : 'K. Meenakshi',
          remarks:
            colSno >= 0 && row[colSno]
              ? `${derived.remarks} (Sheet S.No ${row[colSno]})`
              : derived.remarks,
        });

        globalSerial++;
        divRowCounter++;
      }
    }

    if (records.length === 0) {
      throw new Error('No worker records found inside CLC workbook.');
    }

    const users = buildDefaultUsers();
    const monthlyApprovals = buildApprovalsFromRecords(records);
    const availableDates = Array.from(new Set(records.map((r) => r.date))).sort(
      (a, b) => b.localeCompare(a)
    );
    const availableDivisions = Array.from(
      new Set(records.map((r) => r.division))
    ).sort((a, b) => a - b);

    return {
      users,
      records,
      monthlyApprovals,
      latestDate: availableDates[0] ?? DEFAULT_CLC_DATE,
      availableDates,
      availableDivisions,
      syncedAt: new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      sourceFile: CLC_WORKBOOK_PATH,
    };
  }

  createRegisteredUser(
    existingUsers: UserRoleRecord[],
    payload: RegistrationPayload
  ): UserRoleRecord {
    const nextNum = existingUsers.length + 1;
    const userId = `USR-${String(nextNum).padStart(3, '0')}`;
    return {
      user_id: userId,
      employee_id: payload.employeeId.trim().toUpperCase(),
      full_name: payload.fullName.trim(),
      email: payload.email.trim().toLowerCase(),
      password_hash: payload.password,
      access_level: payload.accessLevel,
      role_title: getRoleTitleByLevel(
        payload.accessLevel,
        payload.accessLevel === 1 ? payload.division : 'All'
      ),
      assigned_division: payload.accessLevel === 1 ? payload.division : 'All',
      assigned_department:
        payload.accessLevel === 1 ? `Division ${payload.division}` : 'All',
      assigned_shift: payload.accessLevel === 1 ? payload.shift : 'All',
      account_status: 'Active',
    };
  }

  createAttendanceRecord(
    existingRecords: AttendanceRecord[],
    payload: WorkerEnrollmentPayload,
    verifiedBy: string
  ): AttendanceRecord {
    const nextSno = existingRecords.length + 1;
    const fallbackCode = 100000 + payload.division * 100 + nextSno;
    const employeeCode = normalizeEmployeeCode(
      payload.employee_code,
      fallbackCode
    );
    const dailyWage = getDailyWageByCategory(payload.category);

    return {
      s_no: nextSno,
      employee_code: employeeCode,
      division: payload.division,
      name: payload.name.trim(),
      category: payload.category,
      gender: payload.gender,
      date: DEFAULT_CLC_DATE,
      in_time: '--:--',
      out_time: '--:--',
      attendance_method: '--',
      total_duration: '--',
      log_id: `CLC-${payload.division}-REG-${String(nextSno).padStart(3, '0')}`,
      shift: payload.shift,
      raw_designation: payload.category,
      status_code: 'LOP',
      status_label: getStatusLabel('LOP'),
      daily_wage_inr: dailyWage,
      lop_days: 0,
      daily_lop_deduction_inr: 0,
      verified_by: verifiedBy,
      remarks: `Enrolled by ${verifiedBy}; pending biometric device punch`,
    };
  }

  updateEmployeeProfile(
    records: AttendanceRecord[],
    payload: WorkerUpdatePayload,
    verifiedBy: string
  ): AttendanceRecord[] {
    const dailyWage = getDailyWageByCategory(payload.category);
    return records.map((rec) => {
      if (rec.employee_code !== payload.employee_code) return rec;
      return {
        ...rec,
        name: payload.name.trim(),
        division: payload.division,
        shift: payload.shift as WorkerShift,
        category: payload.category,
        gender: payload.gender,
        daily_wage_inr: dailyWage,
        daily_lop_deduction_inr: Math.round(rec.lop_days * dailyWage),
        verified_by: verifiedBy,
        remarks: `Employee profile & shift (${payload.shift}) updated by ${verifiedBy}`,
      };
    });
  }

  updateAttendanceRecord(
    records: AttendanceRecord[],
    logId: string,
    updates: {
      status_code: AttendanceStatusCode;
      category: WorkerCategory;
      in_time: string;
      out_time: string;
      attendance_method: AttendanceMethod;
      verified_by: string;
      remarks: string;
    }
  ): AttendanceRecord[] {
    return records.map((rec) => {
      if (rec.log_id !== logId) return rec;
      const lopDays = calculateLopDays(updates.status_code);
      const dailyWage = getDailyWageByCategory(updates.category);
      const totalDuration = calculateTotalDuration(
        updates.in_time,
        updates.out_time
      );

      return {
        ...rec,
        category: updates.category,
        in_time: updates.in_time,
        out_time: updates.out_time,
        attendance_method: updates.attendance_method,
        total_duration: totalDuration,
        status_code: updates.status_code,
        status_label: getStatusLabel(updates.status_code),
        daily_wage_inr: dailyWage,
        lop_days: lopDays,
        daily_lop_deduction_inr: Math.round(lopDays * dailyWage),
        verified_by: updates.verified_by,
        remarks: updates.remarks,
      };
    });
  }

  exportWorkbook(
    dataset: AttendanceDataset,
    filename = 'CLC_Biometric_Attendance_Export.xlsx'
  ): void {
    const wb = XLSX.utils.book_new();
    const attendanceExport = dataset.records.map((r) => ({
      s_no: r.s_no,
      employee_code: r.employee_code,
      division: r.division,
      name: r.name,
      category: r.category,
      gender: r.gender,
      date: r.date,
      in_time: r.in_time,
      out_time: r.out_time,
      attendance_method: r.attendance_method,
      total_duration: r.total_duration,
      status_code: r.status_code,
      lop_days: r.lop_days,
      daily_lop_deduction_inr: r.daily_lop_deduction_inr,
      verified_by: r.verified_by,
      remarks: r.remarks,
    }));

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(attendanceExport),
      'Attendance_Logs'
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(dataset.monthlyApprovals),
      'Monthly_LOP_Approval'
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(dataset.users),
      'Users_Roles'
    );
    XLSX.writeFile(wb, filename);
  }
}

export const excelAttendanceService = new ExcelAttendanceService();
