import React, { useMemo, useState } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  Edit3,
  Eye,
  FileWarning,
  Fingerprint,
  RefreshCw,
  ScanFace,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import type {
  AccessLevel,
  AttendanceDataset,
  AttendanceMethod,
  AttendanceRecord,
  AttendanceStatusCode,
  DivisionNumber,
  RegistrationPayload,
  UserRoleRecord,
  WorkerCategory,
  WorkerEnrollmentPayload,
  WorkerGender,
  WorkerShift,
  WorkerUpdatePayload,
} from '../types/attendance';
import {
  ALL_DIVISIONS,
  calculateLopDays,
  calculateTotalDuration,
  excelAttendanceService,
  formatDisplayDate,
  formatInr,
  getStatusLabel,
} from '../services/excelAttendanceService';
import { AppShell, type SidebarNavItem } from './AppShell';
import { StatusBadge } from './StatusBadge';
import { LogDetailsModal } from './LogDetailsModal';

interface Level2TimekeeperViewProps {
  user: UserRoleRecord;
  dataset: AttendanceDataset;
  isRefreshing: boolean;
  onRefresh: () => void;
  onUpdateRecord: (
    logId: string,
    updates: {
      status_code: AttendanceStatusCode;
      category: WorkerCategory;
      in_time: string;
      out_time: string;
      attendance_method: AttendanceMethod;
      remarks: string;
    }
  ) => void;
  onEnrollWorker: (payload: WorkerEnrollmentPayload) => AttendanceRecord;
  onUpdateEmployee: (payload: WorkerUpdatePayload) => void;
  onRegisterUser: (payload: RegistrationPayload) => UserRoleRecord;
  onSignOut: () => void;
}

const STATUS_OPTIONS: { code: AttendanceStatusCode; label: string }[] = [
  { code: 'P', label: 'P — Present (No Salary Cut)' },
  { code: 'L', label: 'L — Approved Leave (No Salary Cut)' },
  { code: 'LATE', label: 'LATE — Late Punch-In (No Salary Cut)' },
  { code: 'HD', label: 'HD — Half-Day (0.5 Day Loss of Pay)' },
  { code: 'LOP', label: 'LOP — Absent (1.0 Day Loss of Pay)' },
];

export const Level2TimekeeperView: React.FC<Level2TimekeeperViewProps> = ({
  user,
  dataset,
  isRefreshing,
  onRefresh,
  onUpdateRecord,
  onEnrollWorker,
  onUpdateEmployee,
  onRegisterUser,
  onSignOut,
}) => {
  const [activeNav, setActiveNav] = useState<
    'attendance' | 'lop_records' | 'biometric_logs' | 'registration'
  >('attendance');
  const [regTab, setRegTab] = useState<'register' | 'update' | 'portal'>(
    'register'
  );

  // Worker Master & Shift Registration / Update state (NO manual punch fields)
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [selectedEmpCodeToUpdate, setSelectedEmpCodeToUpdate] = useState('');
  const [formEmpCode, setFormEmpCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formDivision, setFormDivision] = useState<DivisionNumber>(1);
  const [formShift, setFormShift] = useState<WorkerShift>('Shift A');
  const [formCategory, setFormCategory] =
    useState<WorkerCategory>('Sanitary Worker');
  const [formGender, setFormGender] = useState<WorkerGender>('Male');

  // Portal User Registration state
  const [portalFullName, setPortalFullName] = useState('');
  const [portalEmpId, setPortalEmpId] = useState('');
  const [portalEmail, setPortalEmail] = useState('');
  const [portalPassword, setPortalPassword] = useState('');
  const [portalAccessLevel, setPortalAccessLevel] = useState<AccessLevel>(1);
  const [portalDivision, setPortalDivision] = useState<DivisionNumber>(1);
  const [portalShift, setPortalShift] = useState('Shift A');

  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);
  const [toastBanner, setToastBanner] = useState<string | null>(null);

  const [selectedDivision, setSelectedDivision] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedGender, setSelectedGender] = useState('ALL');
  const [selectedMethod, setSelectedMethod] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState(dataset.latestDate);
  const [searchQuery, setSearchQuery] = useState('');

  const [viewingRecord, setViewingRecord] = useState<AttendanceRecord | null>(
    null
  );
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(
    null
  );
  const [editStatusCode, setEditStatusCode] =
    useState<AttendanceStatusCode>('P');
  const [editCategory, setEditCategory] =
    useState<WorkerCategory>('Sanitary Worker');
  const [editInTime, setEditInTime] = useState('06:00 AM');
  const [editOutTime, setEditOutTime] = useState('02:00 PM');
  const [editMethod, setEditMethod] = useState<AttendanceMethod>('Finger');
  const [editRemarks, setEditRemarks] = useState('');

  const recordsForSelectedDate = useMemo(() => {
    if (selectedDate === 'ALL') return dataset.records;
    return dataset.records.filter((r) => r.date === selectedDate);
  }, [dataset.records, selectedDate]);

  const kpis = useMemo(() => {
    const todayRecords =
      selectedDate === 'ALL'
        ? dataset.records
        : dataset.records.filter((r) => r.date === selectedDate);

    const totalWorkers = todayRecords.length;
    const presentToday = todayRecords.filter(
      (l) =>
        l.status_code === 'P' ||
        l.status_code === 'LATE' ||
        l.status_code === 'HD'
    ).length;
    const absentNoPunch = todayRecords.filter(
      (l) => l.status_code === 'LOP'
    ).length;
    const onApprovedLeave = todayRecords.filter(
      (l) => l.status_code === 'L'
    ).length;
    return {
      totalWorkers,
      presentToday,
      absentNoPunch,
      onApprovedLeave,
    };
  }, [dataset.records, selectedDate]);

  const matchesSearchQuery = (rec: AttendanceRecord, query: string): boolean => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const divisionText = `division ${rec.division} div ${rec.division}`;
    const displayDate = formatDisplayDate(rec.date).toLowerCase();
    return (
      rec.employee_code.toLowerCase().includes(q) ||
      rec.name.toLowerCase().includes(q) ||
      divisionText.includes(q) ||
      String(rec.division).includes(q) ||
      rec.category.toLowerCase().includes(q) ||
      rec.gender.toLowerCase().includes(q) ||
      rec.status_code.toLowerCase().includes(q) ||
      rec.status_label.toLowerCase().includes(q) ||
      rec.attendance_method.toLowerCase().includes(q) ||
      rec.date.toLowerCase().includes(q) ||
      displayDate.includes(q) ||
      String(rec.s_no).includes(q)
    );
  };

  const filteredRecords = useMemo(() => {
    return recordsForSelectedDate.filter((rec) => {
      const divOk =
        selectedDivision === 'ALL' ||
        String(rec.division) === selectedDivision;
      const catOk =
        selectedCategory === 'ALL' || rec.category === selectedCategory;
      const genOk = selectedGender === 'ALL' || rec.gender === selectedGender;
      const methodOk =
        selectedMethod === 'ALL' || rec.attendance_method === selectedMethod;
      return (
        divOk &&
        catOk &&
        genOk &&
        methodOk &&
        matchesSearchQuery(rec, searchQuery)
      );
    });
  }, [
    recordsForSelectedDate,
    selectedDivision,
    selectedCategory,
    selectedGender,
    selectedMethod,
    searchQuery,
  ]);

  const filteredLopAndLeaveRecords = useMemo(() => {
    return dataset.records.filter(
      (l) =>
        (l.status_code === 'LOP' ||
          l.status_code === 'HD' ||
          l.status_code === 'L') &&
        matchesSearchQuery(l, searchQuery)
    );
  }, [dataset.records, searchQuery]);

  const filteredBiometricLogs = useMemo(() => {
    return dataset.records.filter((rec) => matchesSearchQuery(rec, searchQuery));
  }, [dataset.records, searchQuery]);

  const openEditModal = (rec: AttendanceRecord) => {
    setEditingRecord(rec);
    setEditStatusCode(rec.status_code);
    setEditCategory(rec.category);
    setEditInTime(rec.in_time);
    setEditOutTime(rec.out_time);
    setEditMethod(rec.attendance_method === '--' ? 'Finger' : rec.attendance_method);
    setEditRemarks(rec.remarks);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    onUpdateRecord(editingRecord.log_id, {
      status_code: editStatusCode,
      category: editCategory,
      in_time: editInTime.trim() || '--:--',
      out_time: editOutTime.trim() || '--:--',
      attendance_method: editMethod,
      remarks: editRemarks,
    });
    setToastBanner(
      `Updated attendance for ${editingRecord.name} (${editingRecord.employee_code})`
    );
    setEditingRecord(null);
  };

  const handleQuickMarkLeave = (rec: AttendanceRecord) => {
    onUpdateRecord(rec.log_id, {
      status_code: 'L',
      category: rec.category,
      in_time: '--:--',
      out_time: '--:--',
      attendance_method: rec.attendance_method,
      remarks: `Approved leave marked by ${user.full_name}`,
    });
    setToastBanner(
      `Approved leave marked for ${rec.name} (${rec.employee_code}) — no salary cut`
    );
  };

  const navItems: SidebarNavItem[] = [
    {
      id: 'attendance',
      label: 'All Divisions Attendance',
      icon: <ClipboardList className="h-4 w-4" />,
      badge: filteredRecords.length,
    },
    {
      id: 'lop_records',
      label: 'Loss of Pay & Leave',
      icon: <FileWarning className="h-4 w-4" />,
      badge: filteredLopAndLeaveRecords.length,
    },
    {
      id: 'biometric_logs',
      label: 'Biometric Scan Logs',
      icon: <Database className="h-4 w-4" />,
      badge: filteredBiometricLogs.length,
    },
    {
      id: 'registration',
      label: 'Employee Registration',
      icon: <UserPlus className="h-4 w-4" />,
    },
  ];

  const uniqueEmployees = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    for (const rec of dataset.records) {
      if (!map.has(rec.employee_code)) {
        map.set(rec.employee_code, rec);
      }
    }
    return Array.from(map.values());
  }, [dataset.records]);

  const matchingEmployeesForUpdate = useMemo(() => {
    const q = empSearchQuery.trim().toLowerCase();
    if (!q) return uniqueEmployees;
    return uniqueEmployees.filter(
      (e) =>
        e.employee_code.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q)
    );
  }, [uniqueEmployees, empSearchQuery]);

  const prefillEmployeeForUpdate = (rec: AttendanceRecord) => {
    setRegError(null);
    setRegSuccess(null);
    setRegTab('update');
    setSelectedEmpCodeToUpdate(rec.employee_code);
    setFormEmpCode(rec.employee_code);
    setFormName(rec.name);
    setFormDivision(rec.division);
    setFormShift(rec.shift);
    setFormCategory(rec.category);
    setFormGender(rec.gender);
    setActiveNav('registration');
  };

  const resetRegisterNewForm = () => {
    setRegError(null);
    setSelectedEmpCodeToUpdate('');
    setFormEmpCode('');
    setFormName('');
    setFormDivision(1);
    setFormShift('Shift A');
    setFormCategory('Sanitary Worker');
    setFormGender('Male');
  };

  const handleWorkerMasterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegSuccess(null);

    if (!formName.trim()) {
      setRegError('Please enter the worker full name.');
      return;
    }

    if (regTab === 'register') {
      const cleanCode = formEmpCode.replace(/\D/g, '');
      if (cleanCode && cleanCode.length !== 6) {
        setRegError(
          'Worker Code must be 6 digits (or leave blank to generate automatically).'
        );
        return;
      }

      if (
        cleanCode &&
        dataset.records.some((r) => r.employee_code === cleanCode)
      ) {
        setRegError(
          `Worker Code ${cleanCode} already exists. Use "Update Existing Employee" to make changes.`
        );
        return;
      }

      const created = onEnrollWorker({
        employee_code: cleanCode,
        name: formName,
        division: formDivision,
        shift: formShift,
        category: formCategory,
        gender: formGender,
      });

      const msg = `Employee ${created.employee_code} (${created.name}) registered in Division ${created.division} • ${created.shift}`;
      setRegSuccess(msg);
      setToastBanner(msg);
      resetRegisterNewForm();
      return;
    }

    if (!formEmpCode) {
      setRegError('Please select an existing worker to update.');
      return;
    }

    onUpdateEmployee({
      employee_code: formEmpCode,
      name: formName,
      division: formDivision,
      shift: formShift,
      category: formCategory,
      gender: formGender,
    });

    const msg = `Employee ${formEmpCode} details & shift updated successfully`;
    setRegSuccess(msg);
    setToastBanner(msg);
  };

  const handlePortalRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegSuccess(null);

    if (
      !portalFullName.trim() ||
      !portalEmpId.trim() ||
      !portalEmail.trim() ||
      !portalPassword.trim()
    ) {
      setRegError('Please fill in all staff account registration fields.');
      return;
    }

    const exists = dataset.users.some(
      (u) =>
        u.email.toLowerCase() === portalEmail.trim().toLowerCase() ||
        u.employee_id.toLowerCase() === portalEmpId.trim().toLowerCase()
    );
    if (exists) {
      setRegError('An account with that Email or Staff ID already exists.');
      return;
    }

    const created = onRegisterUser({
      fullName: portalFullName,
      employeeId: portalEmpId,
      email: portalEmail,
      password: portalPassword,
      accessLevel: portalAccessLevel,
      division: portalDivision,
      shift: portalShift,
    });

    const msg = `Created ${created.role_title} account for ${created.full_name} (${created.email}).`;
    setRegSuccess(msg);
    setToastBanner(msg);
    setPortalFullName('');
    setPortalEmpId('');
    setPortalEmail('');
    setPortalPassword('');
  };

  const previewLopDays = calculateLopDays(editStatusCode);
  const previewWage =
    editCategory === 'Driver' ? 750 : editCategory === 'Supervisor' ? 850 : 620;
  const previewDeduction = Math.round(previewLopDays * previewWage);
  const previewDuration = calculateTotalDuration(editInTime, editOutTime);

  const renderMethodLabel = (method: AttendanceMethod) => {
    if (method === 'Face') return 'Face Scan';
    if (method === 'Finger') return 'Fingerprint';
    return '--';
  };

  return (
    <AppShell
      pageTitle="Biometric Attendance - MHO View"
      user={user}
      profileSubtitle="MHO • Central Time Office"
      navItems={navItems}
      activeNavId={activeNav}
      onSelectNav={(id) =>
        setActiveNav(
          id as
            | 'attendance'
            | 'lop_records'
            | 'biometric_logs'
            | 'registration'
        )
      }
      searchValue={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search worker code or name..."
      dateLabel={selectedDate === 'ALL' ? 'All Dates' : selectedDate}
      sourceFile={dataset.sourceFile}
      syncedAt={dataset.syncedAt}
      dataSourceMode={dataset.dataSourceMode}
      dataSourceMessage={dataset.dataSourceMessage}
      notificationCount={kpis.absentNoPunch}
      onSignOut={onSignOut}
      headerActions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveNav('registration')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-blue-300 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1D4ED8] text-[15px] font-semibold transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            <span>Employee Registration</span>
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-[15px] font-semibold shadow-sm transition-colors disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            <span>Refresh Device Data</span>
          </button>
          <button
            type="button"
            onClick={() => excelAttendanceService.exportWorkbook(dataset)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-blue-300 bg-white hover:bg-[#EFF6FF] text-[#1D4ED8] text-[15px] font-semibold transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Download Excel</span>
          </button>
        </div>
      }
    >
      {/* Confirmation Toast / Banner */}
      {toastBanner && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl px-4 py-3.5 flex items-center justify-between gap-3 text-[15px] text-emerald-900 font-semibold shadow-xs">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0" />
            <span>{toastBanner}</span>
          </span>
          <button
            type="button"
            onClick={() => setToastBanner(null)}
            className="p-1 rounded hover:bg-emerald-100 text-emerald-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#0F172A]">
              Total Mill Workers
            </span>
            <div className="h-9 w-9 rounded-lg bg-[#EFF6FF] flex items-center justify-center text-[#1D4ED8]">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-[#0F172A] mt-2">
            {kpis.totalWorkers}
          </p>
          <p className="text-sm font-medium text-slate-700 mt-1">
            Working across {dataset.availableDivisions.length} active divisions
          </p>
        </div>

        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#0F172A]">
              Present Today
            </span>
            <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-emerald-700 mt-2">
            {kpis.presentToday}
          </p>
          <p className="text-sm font-medium text-emerald-800 mt-1">
            Marked by Fingerprint &amp; Face Scan
          </p>
        </div>

        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#0F172A]">
              Absent / No Punch
            </span>
            <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center text-red-700">
              <XCircle className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-red-700 mt-2">
            {kpis.absentNoPunch}
          </p>
          <p className="text-sm font-medium text-red-800 mt-1">
            Absent without leave — needs checking
          </p>
        </div>

        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#0F172A]">
              On Approved Leave
            </span>
            <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center text-[#2563EB]">
              <CalendarCheck className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-[#1D4ED8] mt-2">
            {kpis.onApprovedLeave}
          </p>
          <p className="text-sm font-medium text-[#1D4ED8] mt-1">
            Approved Leave (No Salary Cut)
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      {activeNav === 'attendance' && (
        <div className="bg-white rounded-xl border border-blue-200 p-4 shadow-xs flex flex-wrap items-center gap-3">
          <select
            value={selectedDivision}
            onChange={(e) => setSelectedDivision(e.target.value)}
            className="px-3.5 py-2 rounded-lg border border-blue-300 bg-white text-[15px] font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          >
            <option value="ALL">All Divisions (1 to 7)</option>
            {ALL_DIVISIONS.map((div) => (
              <option key={div} value={String(div)}>
                Division {div}
              </option>
            ))}
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3.5 py-2 rounded-lg border border-blue-300 bg-white text-[15px] font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          >
            <option value="ALL">All Work Categories</option>
            <option value="Sanitary Worker">Sanitary Worker</option>
            <option value="Driver">Driver</option>
            <option value="Supervisor">Supervisor</option>
          </select>

          <select
            value={selectedGender}
            onChange={(e) => setSelectedGender(e.target.value)}
            className="px-3.5 py-2 rounded-lg border border-blue-300 bg-white text-[15px] font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          >
            <option value="ALL">All Genders</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>

          <select
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value)}
            className="px-3.5 py-2 rounded-lg border border-blue-300 bg-white text-[15px] font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          >
            <option value="ALL">All Scan Types (Fingerprint / Face)</option>
            <option value="Finger">Fingerprint</option>
            <option value="Face">Face Scan</option>
          </select>

          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3.5 py-2 rounded-lg border border-blue-300 bg-white text-[15px] font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          >
            {dataset.availableDates.map((d) => (
              <option key={d} value={d}>
                Date: {formatDisplayDate(d)}
              </option>
            ))}
            <option value="ALL">All Dates</option>
          </select>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search worker name or 6-digit code..."
            className="flex-1 min-w-[220px] px-3.5 py-2 rounded-lg border border-blue-300 bg-[#EFF6FF]/60 text-[15px] font-medium text-[#0F172A] placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white"
          />
        </div>
      )}

      {/* Main Attendance Table */}
      {activeNav === 'attendance' && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-blue-200 bg-[#EFF6FF]/70 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-[#0F172A]">
                Daily Worker Attendance &amp; Leave Register
              </h3>
              <p className="text-sm font-medium text-slate-700 mt-0.5">
                Select Change Attendance or Update Details on any worker row to update records.
              </p>
            </div>
            <span className="text-sm font-bold text-[#1D4ED8] bg-[#DBEAFE] px-3 py-1 rounded-full">
              {filteredRecords.length} Workers
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#DBEAFE]/70 text-[#0F172A] text-[13px] uppercase tracking-wide border-b border-blue-200">
                  <th className="py-3.5 px-4 font-bold">S. No.</th>
                  <th className="py-3.5 px-4 font-bold">Worker Code</th>
                  <th className="py-3.5 px-4 font-bold">Division</th>
                  <th className="py-3.5 px-4 font-bold">Worker Name</th>
                  <th className="py-3.5 px-4 font-bold">Work Category</th>
                  <th className="py-3.5 px-4 font-bold">Gender</th>
                  <th className="py-3.5 px-4 font-bold">Date</th>
                  <th className="py-3.5 px-4 font-bold">Punch In Time</th>
                  <th className="py-3.5 px-4 font-bold">Punch Out Time</th>
                  <th className="py-3.5 px-4 font-bold">Total Working Hours</th>
                  <th className="py-3.5 px-4 font-bold">Scan Type</th>
                  <th className="py-3.5 px-4 font-bold">Status</th>
                  <th className="py-3.5 px-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100 text-[15px] font-medium text-[#0F172A]">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td
                      colSpan={13}
                      className="py-10 text-center text-[15px] font-medium text-slate-700"
                    >
                      No attendance records match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec) => (
                    <tr
                      key={rec.log_id}
                      className="hover:bg-[#EFF6FF]/70 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-semibold text-[#0F172A]">
                        {rec.s_no}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-[#1D4ED8]">
                        {rec.employee_code}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[#0F172A] whitespace-nowrap">
                        Division {rec.division}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[#0F172A] whitespace-nowrap">
                        {rec.name}
                      </td>
                      <td className="py-3.5 px-4 text-[#0F172A] whitespace-nowrap">
                        {rec.category}
                      </td>
                      <td className="py-3.5 px-4 text-[#0F172A]">
                        {rec.gender}
                      </td>
                      <td className="py-3.5 px-4 text-[#0F172A] whitespace-nowrap">
                        {formatDisplayDate(rec.date)}
                      </td>
                      <td className="py-3.5 px-4 text-[#0F172A] whitespace-nowrap">
                        {rec.in_time}
                      </td>
                      <td className="py-3.5 px-4 text-[#0F172A] whitespace-nowrap">
                        {rec.out_time}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[#0F172A] whitespace-nowrap">
                        {rec.total_duration}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[#0F172A] whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {rec.attendance_method === 'Face' ? (
                            <ScanFace className="h-4 w-4 text-[#2563EB]" />
                          ) : rec.attendance_method === 'Finger' ? (
                            <Fingerprint className="h-4 w-4 text-[#1D4ED8]" />
                          ) : null}
                          {renderMethodLabel(rec.attendance_method)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <StatusBadge statusCode={rec.status_code} />
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => prefillEmployeeForUpdate(rec)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-blue-300 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1D4ED8] text-[13px] font-semibold transition-colors"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Update Details</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(rec)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-[13px] font-semibold transition-colors"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Change Attendance</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickMarkLeave(rec)}
                            disabled={rec.status_code === 'L'}
                            className="px-3 py-1.5 rounded-md border border-blue-300 bg-blue-50 hover:bg-blue-100 text-[#1D4ED8] text-[13px] font-semibold transition-colors disabled:opacity-45"
                          >
                            Mark Approved Leave
                          </button>
                          <button
                            type="button"
                            onClick={() => setViewingRecord(rec)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-[#0F172A] text-[13px] font-semibold transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View Details</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeNav === 'lop_records' && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-blue-200 bg-[#EFF6FF]/70 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#0F172A]">
                Loss of Pay (LOP), Half-Day &amp; Approved Leave Records
              </h3>
              <p className="text-sm font-medium text-slate-700 mt-0.5">
                Workers absent without leave, on half-day, or on approved leave across Divisions 1 to 7
              </p>
            </div>
            <span className="text-sm font-bold text-[#1D4ED8] bg-[#DBEAFE] px-3 py-1 rounded-full">
              {filteredLopAndLeaveRecords.length} Records
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#DBEAFE]/70 text-[#0F172A] text-[13px] uppercase tracking-wide border-b border-blue-200">
                  <th className="py-3.5 px-4 font-bold">S. No.</th>
                  <th className="py-3.5 px-4 font-bold">Worker Code</th>
                  <th className="py-3.5 px-4 font-bold">Division</th>
                  <th className="py-3.5 px-4 font-bold">Worker Name</th>
                  <th className="py-3.5 px-4 font-bold">Work Category</th>
                  <th className="py-3.5 px-4 font-bold">Date</th>
                  <th className="py-3.5 px-4 font-bold">Status</th>
                  <th className="py-3.5 px-4 font-bold text-right">
                    Loss of Pay (Days)
                  </th>
                  <th className="py-3.5 px-4 font-bold text-right">
                    Salary Cut (₹)
                  </th>
                  <th className="py-3.5 px-4 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100 text-[15px] font-medium text-[#0F172A]">
                {filteredLopAndLeaveRecords.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="py-10 text-center text-[15px] font-medium text-slate-700"
                    >
                      No Loss of Pay or leave records match your search.
                    </td>
                  </tr>
                ) : (
                  filteredLopAndLeaveRecords.map((rec) => (
                    <tr key={rec.log_id} className="hover:bg-[#EFF6FF]/70">
                      <td className="py-3.5 px-4 font-semibold text-[#0F172A]">
                        {rec.s_no}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-[#1D4ED8]">
                        {rec.employee_code}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[#0F172A]">
                        Division {rec.division}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[#0F172A]">
                        {rec.name}
                      </td>
                      <td className="py-3.5 px-4 text-[#0F172A]">
                        {rec.category}
                      </td>
                      <td className="py-3.5 px-4 text-[#0F172A]">
                        {formatDisplayDate(rec.date)}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge statusCode={rec.status_code} />
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold">
                        {rec.lop_days.toFixed(1)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-red-700">
                        {formatInr(rec.daily_lop_deduction_inr)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEditModal(rec)}
                          className="px-3 py-1.5 rounded-md bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-[13px] font-semibold"
                        >
                          Change Attendance
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeNav === 'biometric_logs' && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-blue-200 bg-[#EFF6FF]/70 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#0F172A]">
                All Biometric Scan Logs ({filteredBiometricLogs.length} Entries)
              </h3>
              <p className="text-sm font-medium text-slate-700 mt-0.5">
                Daily Fingerprint &amp; Face Scan punches recorded by devices
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#DBEAFE]/70 text-[#0F172A] text-[13px] uppercase tracking-wide border-b border-blue-200">
                  <th className="py-3.5 px-4 font-bold">S. No.</th>
                  <th className="py-3.5 px-4 font-bold">Worker Code</th>
                  <th className="py-3.5 px-4 font-bold">Division</th>
                  <th className="py-3.5 px-4 font-bold">Worker Name</th>
                  <th className="py-3.5 px-4 font-bold">Punch In Time</th>
                  <th className="py-3.5 px-4 font-bold">Punch Out Time</th>
                  <th className="py-3.5 px-4 font-bold">Total Working Hours</th>
                  <th className="py-3.5 px-4 font-bold">Scan Type</th>
                  <th className="py-3.5 px-4 font-bold">Status</th>
                  <th className="py-3.5 px-4 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100 text-[15px] font-medium text-[#0F172A]">
                {filteredBiometricLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="py-10 text-center text-[15px] font-medium text-slate-700"
                    >
                      No biometric scan logs match your search.
                    </td>
                  </tr>
                ) : (
                  filteredBiometricLogs.map((rec) => (
                    <tr key={rec.log_id} className="hover:bg-[#EFF6FF]/70">
                      <td className="py-3.5 px-4 font-semibold text-[#0F172A]">
                        {rec.s_no}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-[#1D4ED8]">
                        {rec.employee_code}
                      </td>
                      <td className="py-3.5 px-4 text-[#0F172A]">
                        Division {rec.division}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[#0F172A]">
                        {rec.name}
                      </td>
                      <td className="py-3.5 px-4 text-[#0F172A]">
                        {rec.in_time}
                      </td>
                      <td className="py-3.5 px-4 text-[#0F172A]">
                        {rec.out_time}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[#0F172A]">
                        {rec.total_duration}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[#0F172A]">
                        {renderMethodLabel(rec.attendance_method)}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge statusCode={rec.status_code} showCode />
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setViewingRecord(rec)}
                          className="px-3 py-1.5 rounded-md border border-blue-300 text-[#1D4ED8] text-[13px] font-semibold hover:bg-[#DBEAFE]"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeNav === 'registration' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-7 bg-white rounded-xl border border-blue-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-blue-200 bg-[#EFF6FF]/70 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-[#1D4ED8]" />
                  Employee Registration &amp; Details Update
                </h3>
                <p className="text-sm font-medium text-slate-700 mt-0.5">
                  Add new workers or update Division and Shift details (punch times come automatically from biometric devices).
                </p>
              </div>

              <div className="flex flex-wrap bg-[#DBEAFE] p-1 rounded-lg text-sm font-semibold gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setRegTab('register');
                    resetRegisterNewForm();
                  }}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    regTab === 'register'
                      ? 'bg-[#1D4ED8] text-white shadow-xs'
                      : 'text-[#0F172A] hover:text-[#1D4ED8]'
                  }`}
                >
                  Register New Employee
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRegTab('update');
                    setRegError(null);
                    setRegSuccess(null);
                    if (!selectedEmpCodeToUpdate && uniqueEmployees.length > 0) {
                      prefillEmployeeForUpdate(uniqueEmployees[0]);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    regTab === 'update'
                      ? 'bg-[#1D4ED8] text-white shadow-xs'
                      : 'text-[#0F172A] hover:text-[#1D4ED8]'
                  }`}
                >
                  Update Existing Employee
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRegTab('portal');
                    setRegError(null);
                    setRegSuccess(null);
                  }}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    regTab === 'portal'
                      ? 'bg-[#1D4ED8] text-white shadow-xs'
                      : 'text-[#0F172A] hover:text-[#1D4ED8]'
                  }`}
                >
                  Staff Login Account
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {regError && (
                <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm font-medium">
                  {regError}
                </div>
              )}
              {regSuccess && (
                <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" />
                  <span>{regSuccess}</span>
                </div>
              )}

              {regTab === 'register' || regTab === 'update' ? (
                <form onSubmit={handleWorkerMasterSubmit} className="space-y-4">
                  {regTab === 'update' && (
                    <div className="p-4 rounded-xl bg-[#EFF6FF] border border-blue-200 space-y-2.5">
                      <label className="block text-sm font-bold text-[#0F172A]">
                        Find Worker to Update (Search by 6-Digit Worker Code or Name)
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={empSearchQuery}
                          onChange={(e) => setEmpSearchQuery(e.target.value)}
                          placeholder="Search code (e.g. 100101) or name..."
                          className="px-3.5 py-2.5 rounded-lg border border-blue-300 bg-white text-[15px] font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                        />
                        <select
                          value={selectedEmpCodeToUpdate}
                          onChange={(e) => {
                            const found = uniqueEmployees.find(
                              (emp) => emp.employee_code === e.target.value
                            );
                            if (found) prefillEmployeeForUpdate(found);
                          }}
                          className="px-3.5 py-2.5 rounded-lg border border-blue-300 bg-white text-[15px] font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                        >
                          <option value="">-- Choose Worker --</option>
                          {matchingEmployeesForUpdate.map((emp) => (
                            <option
                              key={emp.employee_code}
                              value={emp.employee_code}
                            >
                              {emp.employee_code} — {emp.name} (Div {emp.division} • {emp.shift})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                        Worker Code (6 Digits)
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={formEmpCode}
                        readOnly={regTab === 'update'}
                        onChange={(e) =>
                          setFormEmpCode(e.target.value.replace(/\D/g, ''))
                        }
                        placeholder={
                          regTab === 'update'
                            ? 'Select a worker above'
                            : 'Auto-generated if blank (e.g. 100148)'
                        }
                        className={`w-full px-3.5 py-2.5 rounded-lg border border-blue-300 font-mono text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${
                          regTab === 'update'
                            ? 'bg-slate-100 text-slate-700 cursor-not-allowed'
                            : 'bg-white text-[#0F172A]'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                        Worker Name
                      </label>
                      <input
                        type="text"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="e.g. M. Karthikeyan"
                        className="w-full px-3.5 py-2.5 rounded-lg border border-blue-300 text-[15px] font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                        Division (1 to 7)
                      </label>
                      <select
                        value={formDivision}
                        onChange={(e) =>
                          setFormDivision(Number(e.target.value) as DivisionNumber)
                        }
                        className="w-full px-3.5 py-2.5 rounded-lg border border-blue-300 text-[15px] font-medium text-[#0F172A] bg-white"
                      >
                        {ALL_DIVISIONS.map((d) => (
                          <option key={d} value={d}>
                            Division {d}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                        Duty Shift
                      </label>
                      <select
                        value={formShift}
                        onChange={(e) =>
                          setFormShift(e.target.value as WorkerShift)
                        }
                        className="w-full px-3.5 py-2.5 rounded-lg border border-blue-300 text-[15px] font-medium text-[#0F172A] bg-white"
                      >
                        <option value="Shift A">Shift A (06:00 AM - 02:00 PM)</option>
                        <option value="Shift B">Shift B (02:00 PM - 10:00 PM)</option>
                        <option value="Shift C">Shift C (10:00 PM - 06:00 AM)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                        Work Category
                      </label>
                      <select
                        value={formCategory}
                        onChange={(e) =>
                          setFormCategory(e.target.value as WorkerCategory)
                        }
                        className="w-full px-3.5 py-2.5 rounded-lg border border-blue-300 text-[15px] font-medium text-[#0F172A] bg-white"
                      >
                        <option value="Sanitary Worker">Sanitary Worker</option>
                        <option value="Driver">Driver</option>
                        <option value="Supervisor">Supervisor</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                        Gender
                      </label>
                      <select
                        value={formGender}
                        onChange={(e) =>
                          setFormGender(e.target.value as WorkerGender)
                        }
                        className="w-full px-3.5 py-2.5 rounded-lg border border-blue-300 text-[15px] font-medium text-[#0F172A] bg-white"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#EFF6FF] border border-blue-200 text-sm font-medium text-[#0F172A]">
                    {regTab === 'register'
                      ? 'New workers are added with pending biometric punches (--:--) until they scan on a device.'
                      : 'Updating details keeps existing Punch In Time, Punch Out Time, Scan Type, and Total Working Hours unchanged.'}
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 px-4 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-semibold text-[15px] shadow-sm transition-colors"
                  >
                    {regTab === 'register'
                      ? 'Register New Employee'
                      : 'Update Existing Employee'}
                  </button>
                </form>
              ) : (
                <form
                  onSubmit={handlePortalRegisterSubmit}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={portalFullName}
                        onChange={(e) => setPortalFullName(e.target.value)}
                        placeholder="e.g. R. Aravind"
                        className="w-full px-3.5 py-2.5 rounded-lg border border-blue-300 text-[15px] font-medium text-[#0F172A]"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                        Staff ID
                      </label>
                      <input
                        type="text"
                        value={portalEmpId}
                        onChange={(e) => setPortalEmpId(e.target.value)}
                        placeholder="e.g. EMP-109"
                        className="w-full px-3.5 py-2.5 rounded-lg border border-blue-300 text-[15px] font-medium text-[#0F172A]"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                        Official Email
                      </label>
                      <input
                        type="email"
                        value={portalEmail}
                        onChange={(e) => setPortalEmail(e.target.value)}
                        placeholder="name@clc.gov.in"
                        className="w-full px-3.5 py-2.5 rounded-lg border border-blue-300 text-[15px] font-medium text-[#0F172A]"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                        Password
                      </label>
                      <input
                        type="password"
                        value={portalPassword}
                        onChange={(e) => setPortalPassword(e.target.value)}
                        placeholder="Create password"
                        className="w-full px-3.5 py-2.5 rounded-lg border border-blue-300 text-[15px] font-medium text-[#0F172A]"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                      Access Role
                    </label>
                    <select
                      value={portalAccessLevel}
                      onChange={(e) =>
                        setPortalAccessLevel(Number(e.target.value) as AccessLevel)
                      }
                      className="w-full px-3.5 py-2.5 rounded-lg border border-blue-300 text-[15px] font-medium text-[#0F172A] bg-white"
                    >
                      <option value={1}>Div SO</option>
                      <option value={2}>MHO</option>
                      <option value={3}>Commissioner</option>
                    </select>
                  </div>

                  {portalAccessLevel === 1 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#EFF6FF] p-3.5 rounded-lg border border-blue-200">
                      <div>
                        <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                          Assigned Division (1 to 7)
                        </label>
                        <select
                          value={portalDivision}
                          onChange={(e) =>
                            setPortalDivision(
                              Number(e.target.value) as DivisionNumber
                            )
                          }
                          className="w-full px-3.5 py-2.5 rounded-lg border border-blue-300 text-[15px] font-medium text-[#0F172A] bg-white"
                        >
                          {ALL_DIVISIONS.map((d) => (
                            <option key={d} value={d}>
                              Division {d}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                          Assigned Shift
                        </label>
                        <select
                          value={portalShift}
                          onChange={(e) => setPortalShift(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-lg border border-blue-300 text-[15px] font-medium text-[#0F172A] bg-white"
                        >
                          <option value="Shift A">Shift A</option>
                          <option value="Shift B">Shift B</option>
                          <option value="Shift C">Shift C</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-3 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-[15px] shadow-sm transition-colors"
                  >
                    Create Staff Login Account
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 bg-white rounded-xl border border-blue-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-blue-200 bg-[#EFF6FF]/70">
              <h3 className="text-base font-bold text-[#0F172A]">
                Registered Staff Accounts ({dataset.users.length})
              </h3>
              <p className="text-sm font-medium text-slate-700 mt-0.5">
                Active Div SO, MHO, and Commissioner staff accounts
              </p>
            </div>
            <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
              {dataset.users.map((u) => (
                <div
                  key={u.user_id}
                  className="p-3.5 rounded-xl border border-blue-200 bg-[#EFF6FF]/50 flex items-center justify-between gap-2 text-sm"
                >
                  <div>
                    <p className="font-bold text-[#0F172A] text-[15px]">
                      {u.full_name}{' '}
                      <span className="font-medium text-slate-700">
                        ({u.employee_id})
                      </span>
                    </p>
                    <p className="text-slate-700 font-medium">{u.email}</p>
                    <p className="text-[#1D4ED8] font-semibold mt-0.5">
                      {u.role_title} (
                      {u.assigned_division === 'All'
                        ? 'All Divisions'
                        : `Division ${u.assigned_division}`}
                      )
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold">
                    {u.account_status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Change Attendance Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-xl rounded-2xl bg-white shadow-xl border border-blue-200 overflow-hidden"
          >
            <div className="bg-[#1E3A5F] px-6 py-4 text-white flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-100 font-semibold uppercase">
                  Change Attendance • Worker Code {editingRecord.employee_code}
                </p>
                <h3 className="text-lg font-bold">
                  {editingRecord.name} (Division {editingRecord.division})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="p-1.5 rounded-lg hover:bg-white/15 text-blue-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                    Attendance Status
                  </label>
                  <select
                    value={editStatusCode}
                    onChange={(e) =>
                      setEditStatusCode(e.target.value as AttendanceStatusCode)
                    }
                    className="w-full px-3.5 py-2.5 rounded-lg border border-blue-300 text-[15px] font-medium text-[#0F172A] bg-white"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                    Work Category
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) =>
                      setEditCategory(e.target.value as WorkerCategory)
                    }
                    className="w-full px-3.5 py-2.5 rounded-lg border border-blue-300 text-[15px] font-medium text-[#0F172A] bg-white"
                  >
                    <option value="Sanitary Worker">Sanitary Worker</option>
                    <option value="Driver">Driver</option>
                    <option value="Supervisor">Supervisor</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                    Punch In Time
                  </label>
                  <input
                    type="text"
                    value={editInTime}
                    onChange={(e) => setEditInTime(e.target.value)}
                    placeholder="06:00 AM or --:--"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-blue-300 text-[15px] font-medium text-[#0F172A]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                    Punch Out Time
                  </label>
                  <input
                    type="text"
                    value={editOutTime}
                    onChange={(e) => setEditOutTime(e.target.value)}
                    placeholder="02:00 PM or --:--"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-blue-300 text-[15px] font-medium text-[#0F172A]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                    Scan Type
                  </label>
                  <select
                    value={editMethod}
                    onChange={(e) =>
                      setEditMethod(e.target.value as AttendanceMethod)
                    }
                    className="w-full px-3.5 py-2.5 rounded-lg border border-blue-300 text-[15px] font-medium text-[#0F172A] bg-white"
                  >
                    <option value="Finger">Fingerprint</option>
                    <option value="Face">Face Scan</option>
                  </select>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#EFF6FF] border border-blue-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-slate-700 font-medium block text-xs">
                    Status
                  </span>
                  <span className="font-bold text-[#0F172A]">
                    {getStatusLabel(editStatusCode)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-700 font-medium block text-xs">
                    Total Working Hours
                  </span>
                  <span className="font-bold text-[#0F172A]">
                    {previewDuration}
                  </span>
                </div>
                <div>
                  <span className="text-slate-700 font-medium block text-xs">
                    Loss of Pay (Days)
                  </span>
                  <span className="font-bold text-[#1D4ED8]">
                    {previewLopDays.toFixed(1)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-700 font-medium block text-xs">
                    Salary Cut
                  </span>
                  <span className="font-bold text-red-700">
                    {formatInr(previewDeduction)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                  Office Remarks
                </label>
                <textarea
                  rows={2}
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-blue-300 text-[15px] font-medium text-[#0F172A]"
                  placeholder="Enter reason for change..."
                />
              </div>
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-[15px] font-semibold text-[#0F172A] hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-[15px] font-semibold"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      <LogDetailsModal
        record={viewingRecord}
        onClose={() => setViewingRecord(null)}
      />
    </AppShell>
  );
};
