import * as XLSX from 'xlsx';
import type {
  AttendanceDataset,
  AttendanceMethod,
  AttendanceRecord,
  AttendanceRepository,
  AttendanceStatusCode,
  RegistrationPayload,
  UserRoleRecord,
  WorkerCategory,
  WorkerEnrollmentPayload,
  WorkerShift,
  WorkerUpdatePayload,
} from '../types/attendance';
import {
  ALL_DIVISIONS,
  buildApprovalsFromRecords,
  buildDefaultUsers,
  calculateLopDays,
  calculateTotalDuration,
  computeDivisionSummaries,
  DEFAULT_CLC_DATE,
  formatDisplayDate,
  formatInr,
  getDailyWageByCategory,
  getRoleTitleByLevel,
  getStatusLabel,
  normalizeAttendanceMethod,
  normalizeCategory,
  normalizeDivision,
  normalizeEmployeeCode,
  normalizeGender,
  normalizeName,
  normalizeStatusCode,
  parseTimeToMinutes,
  STATUS_LABELS,
} from '../utils/attendanceHelpers';

export {
  ALL_DIVISIONS,
  buildApprovalsFromRecords,
  buildDefaultUsers,
  calculateLopDays,
  calculateTotalDuration,
  computeDivisionSummaries,
  DEFAULT_CLC_DATE,
  formatDisplayDate,
  formatInr,
  getDailyWageByCategory,
  getRoleTitleByLevel,
  getStatusLabel,
  normalizeAttendanceMethod,
  normalizeCategory,
  normalizeDivision,
  normalizeEmployeeCode,
  normalizeGender,
  normalizeName,
  normalizeStatusCode,
  parseTimeToMinutes,
  STATUS_LABELS,
};

export const CLC_WORKBOOK_PATH = '/CLC Worker list as on 26.11.26.xlsx';

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
