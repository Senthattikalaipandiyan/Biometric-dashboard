import type {
  AttendanceDataset,
  AttendanceMethod,
  AttendanceRecord,
  AttendanceStatusCode,
  DivisionNumber,
  WorkerShift,
} from '../types/attendance';
import {
  buildApprovalsFromRecords,
  buildDefaultUsers,
  calculateLopDays,
  calculateTotalDuration,
  DEFAULT_CLC_DATE,
  excelAttendanceService,
  getDailyWageByCategory,
  getStatusLabel,
  normalizeCategory,
  normalizeDivision,
  normalizeEmployeeCode,
  normalizeGender,
  normalizeName,
} from './excelAttendanceService';

export const BASE_URL = (
  import.meta.env.VITE_BIOMETRIC_API_URL || 'https://tporjpmdb.ritrjpm.edu.in'
).replace(/\/+$/, '');

export const API_KEY = (import.meta.env.VITE_BIOMETRIC_API_KEY || '').trim();

export const DEVICE_LOGS_TABLE = (
  import.meta.env.VITE_BIOMETRIC_LOGS_TABLE || 'DeviceLogs_11_2026'
).trim();

const API_FETCH_BASE = BASE_URL.includes('tporjpmdb.ritrjpm.edu.in')
  ? '/biometric-api'
  : BASE_URL;

const REQUEST_TIMEOUT_MS = 10000;

interface EttlEmployeeRow {
  EmployeeId: number;
  EmployeeName?: string | null;
  EmployeeCode?: string | null;
  EmployeeCodeInDevice?: string | null;
  Gender?: string | null;
  DepartmentId?: number | null;
  Designation?: string | null;
  Division?: string | number | null;
  ContactNo?: string | null;
  Status?: string | null;
}

interface EttlDeviceRow {
  DeviceId: number;
  DeviceFName?: string | null;
  DeviceSName?: string | null;
  SerialNumber?: string | null;
  DeviceLocation?: string | null;
}

interface EttlDepartmentRow {
  DepartmentId: number;
  DepartmentFName?: string | null;
  DepartmentSName?: string | null;
}

interface EttlDeviceLogRow {
  DeviceLogId: number;
  DeviceId: number;
  UserId?: string | number | null;
  LogDate: string;
  C1?: string | null;
  C5?: string | number | null;
}

function isConfiguredApiKey(key: string): boolean {
  return Boolean(key && key !== 'your_api_key_here');
}

function parseIsoWallClock(isoDateTime: string): {
  date: string;
  time12: string;
  minutesOfDay: number;
} {
  const match = String(isoDateTime ?? '').match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/
  );
  if (!match) {
    return { date: DEFAULT_CLC_DATE, time12: '--:--', minutesOfDay: 0 };
  }
  const date = match[1];
  const h24 = Number(match[2]);
  const mins = Number(match[3]);
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const time12 = `${String(h12).padStart(2, '0')}:${String(mins).padStart(
    2,
    '0'
  )} ${period}`;
  return { date, time12, minutesOfDay: h24 * 60 + mins };
}

function mapVerifyCodeToMethod(c5: unknown): AttendanceMethod {
  const code = Number(String(c5 ?? '').trim());
  if (code >= 15 && code <= 20) {
    return 'Face';
  }
  return 'Finger';
}

function inferShiftFromMinutes(minutesOfDay: number): WorkerShift {
  if (minutesOfDay >= 22 * 60 || minutesOfDay < 6 * 60) return 'Shift C';
  if (minutesOfDay >= 14 * 60) return 'Shift B';
  return 'Shift A';
}

function resolveDivision(
  excelMaster: AttendanceRecord | undefined,
  emp: EttlEmployeeRow | undefined,
  device: EttlDeviceRow | undefined,
  dept: EttlDepartmentRow | undefined
): DivisionNumber {
  if (excelMaster) return excelMaster.division;
  if (
    emp?.Division !== null &&
    emp?.Division !== undefined &&
    String(emp.Division).trim() !== ''
  ) {
    return normalizeDivision(emp.Division, 1);
  }
  const deviceText = `${device?.DeviceFName ?? ''} ${device?.DeviceSName ?? ''} ${
    device?.DeviceLocation ?? ''
  }`;
  if (/[1-7]/.test(deviceText)) {
    return normalizeDivision(deviceText, 1);
  }
  const deptText = `${dept?.DepartmentFName ?? ''} ${dept?.DepartmentSName ?? ''}`;
  if (/[1-7]/.test(deptText)) {
    return normalizeDivision(deptText, 1);
  }
  return 1;
}

class BiometricApiService {
  private getHeaders(): HeadersInit {
    return {
      'X-API-Key': API_KEY,
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

    try {
      const response = await fetch(`${API_FETCH_BASE}${path}`, {
        ...init,
        headers: {
          ...this.getHeaders(),
          ...(init?.headers ?? {}),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(
          `Database API ${path} returned HTTP ${response.status}${
            errBody ? `: ${errBody}` : ''
          }`
        );
      }

      return (await response.json()) as T;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async runQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    const data = await this.requestJson<{ rows?: T[] }>('/query', {
      method: 'POST',
      body: JSON.stringify({ sql }),
    });
    return Array.isArray(data.rows) ? data.rows : [];
  }

  async fetchLiveAttendance(): Promise<AttendanceDataset> {
    if (!isConfiguredApiKey(API_KEY)) {
      throw new Error(
        'VITE_BIOMETRIC_API_KEY is missing or set to a placeholder in .env.local'
      );
    }

    const activeLogTable = DEVICE_LOGS_TABLE;

    // Fetch live table rows + optionally load Excel worker master for enrichment
    const [logsRes, employeesRes, devicesRes, departmentsRes, excelDataset] =
      await Promise.all([
        this.requestJson<{ rows?: EttlDeviceLogRow[] }>(
          `/tables/${encodeURIComponent(activeLogTable)}?limit=1000`
        ),
        this.requestJson<{ rows?: EttlEmployeeRow[] }>(
          '/tables/Employees?limit=500'
        ),
        this.requestJson<{ rows?: EttlDeviceRow[] }>('/tables/Devices?limit=200'),
        this.requestJson<{ rows?: EttlDepartmentRow[] }>(
          '/tables/Departments?limit=100'
        ),
        excelAttendanceService.loadAllData().catch(() => null),
      ]);

    const rawDeviceLogs = logsRes.rows ?? [];
    const employees = employeesRes.rows ?? [];
    const devices = devicesRes.rows ?? [];
    const departments = departmentsRes.rows ?? [];

    const excelByCode = new Map<string, AttendanceRecord>();
    if (excelDataset) {
      for (const rec of excelDataset.records) {
        excelByCode.set(rec.employee_code, rec);
        excelByCode.set(String(Number(rec.employee_code)), rec);
      }
    }

    const deviceMap = new Map<number, EttlDeviceRow>();
    for (const d of devices) {
      deviceMap.set(d.DeviceId, d);
    }

    const deptMap = new Map<number, EttlDepartmentRow>();
    for (const dept of departments) {
      deptMap.set(dept.DepartmentId, dept);
    }

    const empByCode = new Map<string, EttlEmployeeRow>();
    for (const emp of employees) {
      const code = String(
        emp.EmployeeCodeInDevice ?? emp.EmployeeCode ?? emp.EmployeeId
      ).trim();
      empByCode.set(code, emp);
      if (emp.EmployeeCode) {
        empByCode.set(String(emp.EmployeeCode).trim(), emp);
      }
    }

    // Group device punches by (UserId, Date)
    const punchesByUserDate = new Map<string, EttlDeviceLogRow[]>();
    const allDatesSet = new Set<string>();

    for (const log of rawDeviceLogs) {
      const userId = String(log.UserId ?? '').trim();
      if (!userId) continue;
      const { date } = parseIsoWallClock(log.LogDate);
      allDatesSet.add(date);
      const key = `${userId}__${date}`;
      const bucket = punchesByUserDate.get(key) ?? [];
      bucket.push(log);
      punchesByUserDate.set(key, bucket);
    }

    const sortedDates = Array.from(allDatesSet).sort((a, b) =>
      b.localeCompare(a)
    );
    const latestDate = sortedDates[0] ?? DEFAULT_CLC_DATE;

    const records: AttendanceRecord[] = [];
    let serial = 1;
    const matchedCodesOnLatestDate = new Set<string>();

    // 1. Live punch records from DeviceLogs_11_2026 merged with Excel/Employees master
    for (const [key, dayPunches] of punchesByUserDate.entries()) {
      const [userId, date] = key.split('__');

      dayPunches.sort((a, b) => a.LogDate.localeCompare(b.LogDate));
      const firstPunch = dayPunches[0];
      const lastPunch = dayPunches[dayPunches.length - 1];

      const firstWall = parseIsoWallClock(firstPunch.LogDate);
      const lastWall = parseIsoWallClock(lastPunch.LogDate);

      const inTime = firstWall.time12;
      const hasSeparateOut =
        dayPunches.length > 1 &&
        lastWall.minutesOfDay !== firstWall.minutesOfDay;
      const outTime = hasSeparateOut ? lastWall.time12 : '--:--';

      const emp = empByCode.get(userId);
      const device = deviceMap.get(firstPunch.DeviceId);
      const dept = emp?.DepartmentId ? deptMap.get(emp.DepartmentId) : undefined;

      const paddedCode = normalizeEmployeeCode(
        emp?.EmployeeCode ?? userId,
        100000 + serial
      );
      const excelMaster =
        excelByCode.get(paddedCode) ?? excelByCode.get(userId);

      if (date === latestDate) {
        matchedCodesOnLatestDate.add(userId);
        matchedCodesOnLatestDate.add(paddedCode);
      }

      const division = resolveDivision(excelMaster, emp, device, dept);
      const name =
        excelMaster?.name ||
        normalizeName(emp?.EmployeeName) ||
        `Employee #${userId}`;
      const rawDesignation =
        excelMaster?.raw_designation ||
        String(emp?.Designation ?? '').trim() ||
        'Sanitary Worker';
      const category =
        excelMaster?.category ?? normalizeCategory(rawDesignation);
      const gender = excelMaster?.gender ?? normalizeGender(emp?.Gender);
      const method = mapVerifyCodeToMethod(lastPunch.C5 ?? firstPunch.C5);
      const totalDuration = calculateTotalDuration(inTime, outTime);
      const statusCode: AttendanceStatusCode = 'P';
      const dailyWage = getDailyWageByCategory(category);
      const lopDays = calculateLopDays(statusCode);

      records.push({
        s_no: serial,
        employee_code: paddedCode,
        division,
        name,
        category,
        gender,
        date,
        in_time: inTime,
        out_time: outTime,
        attendance_method: method,
        total_duration: totalDuration,
        log_id: `DB-${firstPunch.DeviceLogId}-${userId}`,
        shift: excelMaster?.shift ?? inferShiftFromMinutes(firstWall.minutesOfDay),
        raw_designation: rawDesignation,
        cell_number:
          excelMaster?.cell_number ||
          (emp?.ContactNo ? String(emp.ContactNo).trim() : undefined),
        status_code: statusCode,
        status_label: getStatusLabel(statusCode),
        daily_wage_inr: dailyWage,
        lop_days: lopDays,
        daily_lop_deduction_inr: Math.round(lopDays * dailyWage),
        verified_by: device?.DeviceFName?.trim() || 'Biometric Device',
        remarks: `${dayPunches.length} device punch(es) via ${
          device?.DeviceFName?.trim() || `Device #${firstPunch.DeviceId}`
        }`,
      });

      serial++;
    }

    // 2. Include Employees from API without punches on latestDate as Absent (Loss of Pay)
    for (const emp of employees) {
      const rawUserCode = String(
        emp.EmployeeCodeInDevice ?? emp.EmployeeCode ?? emp.EmployeeId
      ).trim();
      const paddedCode = normalizeEmployeeCode(
        emp.EmployeeCode ?? rawUserCode,
        100000 + serial
      );
      if (
        matchedCodesOnLatestDate.has(rawUserCode) ||
        matchedCodesOnLatestDate.has(paddedCode)
      ) {
        continue;
      }

      const excelMaster =
        excelByCode.get(paddedCode) ?? excelByCode.get(rawUserCode);
      const dept = emp.DepartmentId ? deptMap.get(emp.DepartmentId) : undefined;
      const division = resolveDivision(excelMaster, emp, undefined, dept);
      const rawDesignation =
        excelMaster?.raw_designation ||
        String(emp.Designation ?? '').trim() ||
        'Sanitary Worker';
      const category =
        excelMaster?.category ?? normalizeCategory(rawDesignation);
      const gender = excelMaster?.gender ?? normalizeGender(emp.Gender);
      const dailyWage = getDailyWageByCategory(category);

      records.push({
        s_no: serial,
        employee_code: paddedCode,
        division,
        name:
          excelMaster?.name ||
          normalizeName(emp.EmployeeName) ||
          `Employee #${rawUserCode}`,
        category,
        gender,
        date: latestDate,
        in_time: '--:--',
        out_time: '--:--',
        attendance_method: '--',
        total_duration: '--',
        log_id: `DB-ABS-${emp.EmployeeId}`,
        shift: excelMaster?.shift ?? 'Shift A',
        raw_designation: rawDesignation,
        cell_number:
          excelMaster?.cell_number ||
          (emp.ContactNo ? String(emp.ContactNo).trim() : undefined),
        status_code: 'LOP',
        status_label: getStatusLabel('LOP'),
        daily_wage_inr: dailyWage,
        lop_days: 1.0,
        daily_lop_deduction_inr: dailyWage,
        verified_by: 'Pending',
        remarks: `No punch found in ${activeLogTable} on ${latestDate}`,
      });

      serial++;
    }

    // 3. Include remaining Excel master workers not yet punched if Excel workbook is present
    if (excelDataset) {
      for (const exRec of excelDataset.records) {
        if (matchedCodesOnLatestDate.has(exRec.employee_code)) continue;
        matchedCodesOnLatestDate.add(exRec.employee_code);
        records.push({
          ...exRec,
          s_no: serial,
          date: latestDate,
        });
        serial++;
      }
    }

    const users = buildDefaultUsers();
    const monthlyApprovals = buildApprovalsFromRecords(records);
    const availableDates = Array.from(
      new Set(records.map((r) => r.date))
    ).sort((a, b) => b.localeCompare(a));
    const availableDivisions = Array.from(
      new Set(records.map((r) => r.division))
    ).sort((a, b) => a - b);

    return {
      users,
      records,
      monthlyApprovals,
      latestDate: availableDates[0] ?? DEFAULT_CLC_DATE,
      availableDates:
        availableDates.length > 0 ? availableDates : [DEFAULT_CLC_DATE],
      availableDivisions,
      syncedAt: new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      sourceFile: `${BASE_URL}/tables/${activeLogTable}`,
      dataSourceMode: 'api',
      dataSourceMessage: `Connected to Database (${BASE_URL} • ${activeLogTable}) — ${records.length} attendance rows loaded from ${rawDeviceLogs.length} device punches`,
    };
  }

  async fetchAttendanceWithFallback(): Promise<AttendanceDataset> {
    try {
      return await this.fetchLiveAttendance();
    } catch (apiErr) {
      const reason =
        apiErr instanceof Error && apiErr.name === 'AbortError'
          ? 'connection timed out'
          : apiErr instanceof Error
          ? apiErr.message
          : 'network unreachable';

      try {
        const excelData = await excelAttendanceService.loadAllData();
        return {
          ...excelData,
          dataSourceMode: 'excel',
          dataSourceMessage: `Live device server unavailable (${reason}) — showing local register (CLC Worker list as on 26.11.26.xlsx)`,
        };
      } catch {
        return this.createEmptyErrorDataset(
          `Database API unavailable (${reason}) and local Excel register was not found in public/.`
        );
      }
    }
  }

  createEmptyErrorDataset(errorMessage: string): AttendanceDataset {
    return {
      users: buildDefaultUsers(),
      records: [],
      monthlyApprovals: [],
      latestDate: DEFAULT_CLC_DATE,
      availableDates: [DEFAULT_CLC_DATE],
      availableDivisions: [],
      syncedAt: new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      sourceFile: BASE_URL,
      dataSourceMode: 'error',
      dataSourceMessage: errorMessage,
    };
  }
}

export const biometricApiService = new BiometricApiService();
