import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  Fingerprint,
  History,
  RefreshCw,
  ScanFace,
  Users,
  XCircle,
} from 'lucide-react';
import type {
  AttendanceDataset,
  AttendanceRecord,
  UserRoleRecord,
} from '../types/attendance';
import { formatDisplayDate } from '../services/excelAttendanceService';
import { AppShell, type SidebarNavItem } from './AppShell';
import { StatusBadge } from './StatusBadge';
import { LogDetailsModal } from './LogDetailsModal';

interface Level1SupervisorViewProps {
  user: UserRoleRecord;
  dataset: AttendanceDataset;
  isRefreshing: boolean;
  onRefresh: () => void;
  onSignOut: () => void;
}

const SHIFT_HOURS: Record<string, string> = {
  'Shift A': '06:00 AM - 02:00 PM',
  'Shift B': '02:00 PM - 10:00 PM',
  'Shift C': '10:00 PM - 06:00 AM',
};

export const Level1SupervisorView: React.FC<Level1SupervisorViewProps> = ({
  user,
  dataset,
  isRefreshing,
  onRefresh,
  onSignOut,
}) => {
  const [activeNav, setActiveNav] = useState<'live' | 'history'>('live');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedGender, setSelectedGender] = useState('ALL');
  const [selectedMethod, setSelectedMethod] = useState('ALL');
  const [historyDateFilter, setHistoryDateFilter] = useState('ALL');
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(
    null
  );

  const supervisorDivision = user.assigned_division;
  const supervisorShift = user.assigned_shift;

  const scopedRecords = useMemo(() => {
    return dataset.records.filter((rec) => {
      if (supervisorDivision === 'All') return true;
      return rec.division === supervisorDivision;
    });
  }, [dataset.records, supervisorDivision]);

  const liveRecords = useMemo(() => {
    return scopedRecords.filter((rec) => rec.date === dataset.latestDate);
  }, [scopedRecords, dataset.latestDate]);

  const kpis = useMemo(() => {
    const totalWorkers = liveRecords.length;
    const present = liveRecords.filter((l) => l.status_code === 'P').length;
    const absent = liveRecords.filter(
      (l) => l.status_code === 'LOP' || l.status_code === 'L'
    ).length;
    const late = liveRecords.filter(
      (l) => l.status_code === 'LATE' || l.status_code === 'HD'
    ).length;
    return { totalWorkers, present, absent, late };
  }, [liveRecords]);

  const filterRows = (rows: AttendanceRecord[]) => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((rec) => {
      const catOk =
        selectedCategory === 'ALL' || rec.category === selectedCategory;
      const genOk = selectedGender === 'ALL' || rec.gender === selectedGender;
      const methodOk =
        selectedMethod === 'ALL' || rec.attendance_method === selectedMethod;
      const queryOk =
        !q ||
        rec.name.toLowerCase().includes(q) ||
        rec.employee_code.toLowerCase().includes(q) ||
        String(rec.s_no).includes(q) ||
        rec.category.toLowerCase().includes(q);
      return catOk && genOk && methodOk && queryOk;
    });
  };

  const filteredLiveRecords = useMemo(
    () => filterRows(liveRecords),
    [liveRecords, selectedCategory, selectedGender, selectedMethod, searchQuery]
  );

  const filteredHistoryRecords = useMemo(() => {
    const dateFiltered =
      historyDateFilter === 'ALL'
        ? scopedRecords
        : scopedRecords.filter((r) => r.date === historyDateFilter);
    return filterRows(dateFiltered);
  }, [
    scopedRecords,
    historyDateFilter,
    selectedCategory,
    selectedGender,
    selectedMethod,
    searchQuery,
  ]);

  const navItems: SidebarNavItem[] = [
    {
      id: 'live',
      label: 'Today Shift Attendance',
      icon: <Activity className="h-4 w-4" />,
      badge: liveRecords.length,
    },
    {
      id: 'history',
      label: 'Past Attendance',
      icon: <History className="h-4 w-4" />,
      badge: scopedRecords.length,
    },
  ];

  const shiftWindow = SHIFT_HOURS[supervisorShift] ?? '06:00 AM - 02:00 PM';
  const divisionLabel =
    supervisorDivision === 'All'
      ? 'All Divisions'
      : `Division ${supervisorDivision}`;
  const soRoleLabel =
    supervisorDivision === 'All' ? 'Div SO' : `Div ${supervisorDivision} SO`;

  const renderTable = (rows: AttendanceRecord[]) => (
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
            <th className="py-3.5 px-4 font-bold text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-blue-100 text-[15px] font-medium text-[#0F172A]">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={13}
                className="py-10 text-center text-[15px] font-medium text-slate-700"
              >
                No worker attendance records match your selected filter.
              </td>
            </tr>
          ) : (
            rows.map((rec) => (
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
                <td className="py-3.5 px-4 text-[#0F172A]">{rec.gender}</td>
                <td className="py-3.5 px-4 text-[#0F172A] whitespace-nowrap">
                  {formatDisplayDate(rec.date)}
                </td>
                <td className="py-3.5 px-4 text-[#0F172A] whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-[#1D4ED8]" />
                    {rec.in_time}
                  </span>
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
                    {rec.attendance_method === 'Finger'
                      ? 'Fingerprint'
                      : rec.attendance_method === 'Face'
                      ? 'Face Scan'
                      : '--'}
                  </span>
                </td>
                <td className="py-3.5 px-4 whitespace-nowrap">
                  <StatusBadge statusCode={rec.status_code} />
                </td>
                <td className="py-3.5 px-4 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setSelectedRecord(rec)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-300 bg-white hover:bg-[#DBEAFE] text-[#1D4ED8] text-sm font-semibold transition-colors"
                  >
                    <Eye className="h-4 w-4" />
                    <span>View Details</span>
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <AppShell
      pageTitle={`Biometric Attendance - ${soRoleLabel} View`}
      user={user}
      profileSubtitle={`${soRoleLabel} • ${divisionLabel} - ${supervisorShift}`}
      navItems={navItems}
      activeNavId={activeNav}
      onSelectNav={(id) => setActiveNav(id as 'live' | 'history')}
      searchValue={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search worker code or name..."
      dateLabel={dataset.latestDate}
      sourceFile={dataset.sourceFile}
      syncedAt={dataset.syncedAt}
      dataSourceMode={dataset.dataSourceMode}
      dataSourceMessage={dataset.dataSourceMessage}
      notificationCount={kpis.absent + kpis.late}
      onSignOut={onSignOut}
      headerActions={
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-[15px] font-semibold shadow-sm transition-colors disabled:opacity-60"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
          />
          <span>Refresh Device Data</span>
        </button>
      }
    >
      {/* Live Shift / Division Pill */}
      <div className="bg-white rounded-xl border border-blue-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[#DBEAFE] text-[#0F172A] text-sm font-bold border border-blue-300">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 animate-pulse" />
          <span>
            {supervisorShift} | {divisionLabel} • Duty Hours ({shiftWindow})
          </span>
        </div>

        <div className="text-sm text-slate-700 font-medium">
          Showing workers for{' '}
          <span className="font-bold text-[#0F172A]">{divisionLabel}</span> •{' '}
          <span className="font-bold text-[#1D4ED8]">{supervisorShift}</span>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#0F172A]">
              Total Workers
            </span>
            <div className="h-9 w-9 rounded-lg bg-[#EFF6FF] flex items-center justify-center text-[#1D4ED8]">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-[#0F172A] mt-2">
            {kpis.totalWorkers}
          </p>
          <p className="text-sm font-medium text-slate-700 mt-1">
            Workers in {divisionLabel}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#0F172A]">Present</span>
            <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-emerald-700 mt-2">
            {kpis.present}
          </p>
          <p className="text-sm font-medium text-emerald-800 mt-1">
            Marked by Fingerprint &amp; Face Scan
          </p>
        </div>

        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#0F172A]">Absent</span>
            <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center text-red-700">
              <XCircle className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-red-700 mt-2">{kpis.absent}</p>
          <p className="text-sm font-medium text-red-800 mt-1">
            Absent or on approved leave
          </p>
        </div>

        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#0F172A]">Late</span>
            <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-amber-800 mt-2">{kpis.late}</p>
          <p className="text-sm font-medium text-amber-900 mt-1">
            Late arrival or half-day
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-blue-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-blue-200 bg-[#EFF6FF]/70 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#0F172A]">
              {activeNav === 'live'
                ? 'Daily Worker Attendance List'
                : `Past Attendance Records (${divisionLabel})`}
            </h3>
            <p className="text-sm font-medium text-[#1D4ED8] mt-0.5">
              {divisionLabel} • Driver &amp; Sanitary Worker Attendance
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {activeNav === 'history' && (
              <select
                value={historyDateFilter}
                onChange={(e) => setHistoryDateFilter(e.target.value)}
                className="px-3.5 py-2 rounded-lg border border-blue-300 bg-white text-[15px] font-medium text-[#0F172A]"
              >
                <option value="ALL">All Dates</option>
                {dataset.availableDates.map((d) => (
                  <option key={d} value={d}>
                    {formatDisplayDate(d)}
                  </option>
                ))}
              </select>
            )}

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3.5 py-2 rounded-lg border border-blue-300 bg-white text-[15px] font-medium text-[#0F172A]"
            >
              <option value="ALL">All Work Categories</option>
              <option value="Sanitary Worker">Sanitary Worker</option>
              <option value="Driver">Driver</option>
              <option value="Supervisor">Supervisor</option>
            </select>

            <select
              value={selectedGender}
              onChange={(e) => setSelectedGender(e.target.value)}
              className="px-3.5 py-2 rounded-lg border border-blue-300 bg-white text-[15px] font-medium text-[#0F172A]"
            >
              <option value="ALL">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>

            <select
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value)}
              className="px-3.5 py-2 rounded-lg border border-blue-300 bg-white text-[15px] font-medium text-[#0F172A]"
            >
              <option value="ALL">All Scan Types</option>
              <option value="Finger">Fingerprint</option>
              <option value="Face">Face Scan</option>
            </select>
          </div>
        </div>

        {activeNav === 'live'
          ? renderTable(filteredLiveRecords)
          : renderTable(filteredHistoryRecords)}
      </div>

      <LogDetailsModal
        record={selectedRecord}
        onClose={() => setSelectedRecord(null)}
      />
    </AppShell>
  );
};
