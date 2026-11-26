import React, { useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import type {
  AttendanceDataset,
  MonthlyLopApprovalRecord,
  UserRoleRecord,
} from '../types/attendance';
import {
  ALL_DIVISIONS,
  computeDivisionSummaries,
  excelAttendanceService,
  formatDisplayDate,
  formatInr,
} from '../services/excelAttendanceService';
import { AppShell, type SidebarNavItem } from './AppShell';

interface Level3GmViewProps {
  user: UserRoleRecord;
  dataset: AttendanceDataset;
  isRefreshing: boolean;
  onRefresh: () => void;
  onApproveMonthlyLop: (approvalIds: string[]) => void;
  onSignOut: () => void;
}

export const Level3GmView: React.FC<Level3GmViewProps> = ({
  user,
  dataset,
  isRefreshing,
  onRefresh,
  onApproveMonthlyLop,
  onSignOut,
}) => {
  const [activeNav, setActiveNav] = useState<
    'executive' | 'divisions' | 'lop_approval'
  >('executive');
  const [searchQuery, setSearchQuery] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [showPendingModal, setShowPendingModal] = useState(false);

  const latestRecords = useMemo(
    () => dataset.records.filter((r) => r.date === dataset.latestDate),
    [dataset.records, dataset.latestDate]
  );

  const divisionSummaries = useMemo(
    () => computeDivisionSummaries(latestRecords, ALL_DIVISIONS),
    [latestRecords]
  );

  const kpis = useMemo(() => {
    const totalStrength = latestRecords.length;
    const presentCount = latestRecords.filter(
      (l) => l.status_code === 'P'
    ).length;
    const lateOrHdCount = latestRecords.filter(
      (l) => l.status_code === 'LATE' || l.status_code === 'HD'
    ).length;
    const leaveCount = latestRecords.filter((l) => l.status_code === 'L').length;
    const absentToday = latestRecords.filter(
      (l) => l.status_code === 'LOP'
    ).length;

    const effectivePresent = presentCount + lateOrHdCount;
    const attendancePct =
      totalStrength > 0
        ? Math.round((effectivePresent / totalStrength) * 1000) / 10
        : 0;

    const monthlyLopDays = dataset.monthlyApprovals.reduce(
      (sum, row) => sum + row.total_lop_days,
      0
    );
    const totalLopDeductionInr = dataset.monthlyApprovals.reduce(
      (sum, row) => sum + row.total_lop_deduction_inr,
      0
    );

    const fingerCount = latestRecords.filter(
      (l) => l.attendance_method === 'Finger'
    ).length;
    const faceCount = latestRecords.filter(
      (l) => l.attendance_method === 'Face'
    ).length;
    const driverCount = latestRecords.filter(
      (l) => l.category === 'Driver'
    ).length;
    const sanitaryCount = latestRecords.filter(
      (l) => l.category === 'Sanitary Worker'
    ).length;

    return {
      totalStrength,
      effectivePresent,
      presentCount,
      lateOrHdCount,
      leaveCount,
      absentToday,
      attendancePct,
      monthlyLopDays,
      totalLopDeductionInr,
      fingerCount,
      faceCount,
      driverCount,
      sanitaryCount,
    };
  }, [dataset.monthlyApprovals, latestRecords]);

  const pendingApprovals = useMemo(
    () =>
      dataset.monthlyApprovals.filter(
        (r) => r.gm_approval_status !== 'Approved'
      ),
    [dataset.monthlyApprovals]
  );

  const filteredApprovals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return dataset.monthlyApprovals.filter((row) => {
      const divMatch =
        divisionFilter === 'ALL' || String(row.division) === divisionFilter;
      const catMatch =
        categoryFilter === 'ALL' || row.category === categoryFilter;
      const queryMatch =
        !q ||
        row.name.toLowerCase().includes(q) ||
        row.employee_code.toLowerCase().includes(q) ||
        row.approval_id.toLowerCase().includes(q);
      return divMatch && catMatch && queryMatch;
    });
  }, [dataset.monthlyApprovals, divisionFilter, categoryFilter, searchQuery]);

  const trendSeries = useMemo(() => {
    const activeDivs = divisionSummaries.filter((d) => d.totalWorkers > 0);
    if (activeDivs.length === 0) return [];
    return activeDivs.map((d) => ({
      label: `Div ${d.division}`,
      attendancePct: d.attendanceRatePct,
      lopDays: d.totalLopDays,
    }));
  }, [divisionSummaries]);

  const navItems: SidebarNavItem[] = [
    {
      id: 'executive',
      label: 'Executive Summary',
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    {
      id: 'divisions',
      label: 'Division Attendance',
      icon: <Building2 className="h-4 w-4" />,
      badge: dataset.availableDivisions.length,
    },
    {
      id: 'lop_approval',
      label: 'Monthly Salary Cut Approval',
      icon: <ClipboardCheck className="h-4 w-4" />,
      badge: pendingApprovals.length,
    },
  ];

  const handleApproveAllPending = () => {
    if (pendingApprovals.length === 0) return;
    onApproveMonthlyLop(pendingApprovals.map((p) => p.approval_id));
  };

  const donutTotal =
    kpis.presentCount + kpis.lateOrHdCount + kpis.absentToday + kpis.leaveCount ||
    1;
  const donutRadius = 56;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const segments = [
    { label: 'Present', count: kpis.presentCount, color: '#10B981' },
    { label: 'Late / Half-Day', count: kpis.lateOrHdCount, color: '#F59E0B' },
    {
      label: 'Absent (Loss of Pay)',
      count: kpis.absentToday,
      color: '#EF4444',
    },
    { label: 'Approved Leave', count: kpis.leaveCount, color: '#2563EB' },
  ];
  let cumulativeOffset = 0;

  const formattedLatestDate = formatDisplayDate(dataset.latestDate);

  return (
    <AppShell
      pageTitle="Biometric Attendance - Commissioner View"
      user={user}
      profileSubtitle="Commissioner • Plant Operations"
      navItems={navItems}
      activeNavId={activeNav}
      onSelectNav={(id) =>
        setActiveNav(id as 'executive' | 'divisions' | 'lop_approval')
      }
      searchValue={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search worker code, name, division..."
      dateLabel={dataset.latestDate}
      sourceFile={dataset.sourceFile}
      syncedAt={dataset.syncedAt}
      dataSourceMode={dataset.dataSourceMode}
      dataSourceMessage={dataset.dataSourceMessage}
      notificationCount={pendingApprovals.length}
      onSignOut={onSignOut}
      headerActions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              excelAttendanceService.exportWorkbook(
                dataset,
                `CLC_GM_Report_${formattedLatestDate}.xlsx`
              )
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-[15px] font-semibold shadow-sm transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Export Report</span>
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh Device Data"
            className="p-2.5 rounded-lg border border-blue-300 bg-white hover:bg-[#EFF6FF] text-[#1D4ED8] transition-colors"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
            />
          </button>
        </div>
      }
    >
      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#0F172A]">
              Total Mill Strength
            </span>
            <div className="h-9 w-9 rounded-lg bg-[#EFF6FF] flex items-center justify-center text-[#1D4ED8]">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-[#0F172A] mt-2">
            {kpis.totalStrength}
          </p>
          <p className="text-sm font-medium text-slate-700 mt-1">
            Sanitary: {kpis.sanitaryCount} • Drivers: {kpis.driverCount}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#0F172A]">
              Overall Attendance
            </span>
            <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-emerald-700 mt-2">
            {kpis.attendancePct}%
          </p>
          <p className="text-sm font-medium text-emerald-800 mt-1">
            Fingerprint: {kpis.fingerCount} • Face Scan: {kpis.faceCount}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#0F172A]">
              Total Absent Today
            </span>
            <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center text-red-700">
              <XCircle className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-red-700 mt-2">
            {kpis.absentToday}
          </p>
          <p className="text-sm font-medium text-red-800 mt-1">
            +{kpis.leaveCount} on approved leave
          </p>
        </div>

        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#0F172A]">
              Monthly Loss of Pay (LOP) Days
            </span>
            <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center text-amber-700">
              <TrendingDown className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-[#0F172A] mt-2">
            {kpis.monthlyLopDays.toFixed(1)} Days
          </p>
          <p className="text-sm font-bold text-red-700 mt-1">
            {formatInr(kpis.totalLopDeductionInr)} total salary cut
          </p>
        </div>
      </div>

      {activeNav === 'executive' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Division-Wise Attendance vs. Absenteeism */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-blue-200 p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-base font-bold text-[#0F172A]">
                    Division-Wise Attendance vs. Absence
                  </h3>
                  <p className="text-sm font-medium text-slate-700">
                    Divisions 1 to 7 Present vs. Absent on {formattedLatestDate}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm font-bold">
                  <span className="inline-flex items-center gap-1.5 text-[#1D4ED8]">
                    <span className="h-3 w-3 rounded-sm bg-[#2563EB]" />
                    Present
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-red-700">
                    <span className="h-3 w-3 rounded-sm bg-red-600" />
                    Absent
                  </span>
                </div>
              </div>

              <div className="space-y-3.5">
                {divisionSummaries.map((div) => {
                  const maxVal = Math.max(
                    ...divisionSummaries.map((d) => d.totalWorkers),
                    1
                  );
                  const presentTotal = div.presentCount + div.lateOrHalfDayCount;
                  const presentWidth = Math.round((presentTotal / maxVal) * 100);
                  const absentWidth = Math.round(
                    (div.absentLopCount / maxVal) * 100
                  );

                  return (
                    <div key={div.division} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-bold text-[#0F172A]">
                          {div.label}
                        </span>
                        <span className="text-slate-800 font-medium">
                          {div.totalWorkers === 0 ? (
                            <span className="italic text-slate-600">
                              No workers assigned
                            </span>
                          ) : (
                            <>
                              Present:{' '}
                              <strong className="text-[#1D4ED8]">
                                {presentTotal}
                              </strong>{' '}
                              • Absent:{' '}
                              <strong className="text-red-700">
                                {div.absentLopCount}
                              </strong>{' '}
                              / {div.totalWorkers}
                            </>
                          )}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#2563EB] transition-all"
                            style={{ width: `${presentWidth}%` }}
                          />
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-red-600 transition-all"
                            style={{ width: `${absentWidth}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Overall Attendance Breakdown Donut */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-blue-200 p-5 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">
                  Overall Attendance Breakdown
                </h3>
                <p className="text-sm font-medium text-slate-700">
                  Summary across {kpis.totalStrength} workers ({formattedLatestDate})
                </p>
              </div>

              <div className="my-4 flex items-center justify-center gap-6 flex-wrap">
                <div className="relative h-40 w-40 flex items-center justify-center">
                  <svg viewBox="0 0 140 140" className="h-40 w-40 -rotate-90">
                    <circle
                      cx="70"
                      cy="70"
                      r={donutRadius}
                      fill="none"
                      stroke="#E2E8F0"
                      strokeWidth="16"
                    />
                    {segments.map((seg) => {
                      const segLength =
                        (seg.count / donutTotal) * donutCircumference;
                      const dashArray = `${segLength} ${donutCircumference - segLength}`;
                      const dashOffset = -cumulativeOffset;
                      cumulativeOffset += segLength;

                      if (seg.count === 0) return null;
                      return (
                        <circle
                          key={seg.label}
                          cx="70"
                          cy="70"
                          r={donutRadius}
                          fill="none"
                          stroke={seg.color}
                          strokeWidth="16"
                          strokeDasharray={dashArray}
                          strokeDashoffset={dashOffset}
                        />
                      );
                    })}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-2xl font-bold text-[#0F172A]">
                      {kpis.attendancePct}%
                    </span>
                    <span className="text-xs font-bold text-slate-700 uppercase">
                      Present
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 text-sm min-w-[180px]">
                  {segments.map((seg) => (
                    <div
                      key={seg.label}
                      className="flex items-center justify-between gap-4"
                    >
                      <span className="flex items-center gap-2 font-semibold text-[#0F172A]">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: seg.color }}
                        />
                        {seg.label}
                      </span>
                      <span className="font-bold text-[#0F172A]">
                        {seg.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Monthly Attendance & LOP Trend across active Divisions */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-blue-200 p-5 shadow-xs">
              <div className="mb-3">
                <h3 className="text-base font-bold text-[#0F172A]">
                  Division Attendance &amp; Loss of Pay (LOP) Trend
                </h3>
                <p className="text-sm font-medium text-slate-700">
                  Division-wise Attendance % and Loss of Pay Days ({formattedLatestDate})
                </p>
              </div>

              <div className="bg-[#EFF6FF]/70 rounded-xl border border-blue-200 p-4">
                <svg viewBox="0 0 320 140" className="w-full h-40">
                  {[25, 55, 85, 115].map((y) => (
                    <line
                      key={y}
                      x1="28"
                      y1={y}
                      x2="300"
                      y2={y}
                      stroke="#CBD5E1"
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />
                  ))}

                  {trendSeries.length > 0 && (
                    <polyline
                      fill="none"
                      stroke="#1D4ED8"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={trendSeries
                        .map((pt, idx) => {
                          const x =
                            trendSeries.length === 1
                              ? 160
                              : 45 + (idx * 230) / (trendSeries.length - 1);
                          const y = 115 - (pt.attendancePct / 100) * 90;
                          return `${x},${y}`;
                        })
                        .join(' ')}
                    />
                  )}

                  {trendSeries.map((pt, idx) => {
                    const x =
                      trendSeries.length === 1
                        ? 160
                        : 45 + (idx * 230) / (trendSeries.length - 1);
                    const yAtt = 115 - (pt.attendancePct / 100) * 90;
                    const yLop = 115 - Math.min(pt.lopDays, 10) * 8;
                    return (
                      <g key={pt.label}>
                        <circle cx={x} cy={yAtt} r="5" fill="#1D4ED8" />
                        <text
                          x={x}
                          y={yAtt - 9}
                          textAnchor="middle"
                          className="fill-[#0F172A] text-[11px] font-bold"
                        >
                          {pt.attendancePct}%
                        </text>
                        <circle cx={x} cy={yLop} r="4.5" fill="#DC2626" />
                        <text
                          x={x}
                          y={132}
                          textAnchor="middle"
                          className="fill-[#0F172A] text-[11px] font-bold"
                        >
                          {pt.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                <div className="mt-2 flex items-center justify-between text-xs font-bold">
                  <span className="inline-flex items-center gap-1.5 text-[#1D4ED8]">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#1D4ED8]" />
                    Attendance Rate %
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-red-700">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
                    Loss of Pay Days ({kpis.monthlyLopDays.toFixed(1)} total)
                  </span>
                </div>
              </div>
            </div>

            {/* Monthly Loss of Pay Summary & Sign-off */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-blue-200 p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5 text-[#1D4ED8]" />
                      Monthly Loss of Pay (LOP) Summary &amp; Approval
                    </h3>
                    <p className="text-sm font-medium text-slate-700 mt-0.5">
                      Salary cut summary across all {dataset.monthlyApprovals.length} workers
                    </p>
                  </div>

                  <span
                    className={`text-sm font-bold px-3.5 py-1 rounded-full ${
                      pendingApprovals.length === 0
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-50 text-amber-900 border border-amber-300'
                    }`}
                  >
                    {pendingApprovals.length === 0
                      ? 'All Records Approved'
                      : `${pendingApprovals.length} Pending Commissioner Sign-Off`}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="p-3.5 rounded-xl bg-[#EFF6FF] border border-blue-200">
                    <p className="text-xs text-slate-700 font-semibold">
                      Total Loss of Pay Days
                    </p>
                    <p className="text-2xl font-bold text-[#0F172A] mt-0.5">
                      {kpis.monthlyLopDays.toFixed(1)}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-red-50 border border-red-200">
                    <p className="text-xs text-red-800 font-semibold">
                      Total Salary Cut
                    </p>
                    <p className="text-2xl font-bold text-red-800 mt-0.5">
                      {formatInr(kpis.totalLopDeductionInr)}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                    <p className="text-xs text-emerald-800 font-semibold">
                      Approved by Commissioner
                    </p>
                    <p className="text-2xl font-bold text-emerald-800 mt-0.5">
                      {dataset.monthlyApprovals.length - pendingApprovals.length} /{' '}
                      {dataset.monthlyApprovals.length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-blue-100">
                <button
                  type="button"
                  onClick={handleApproveAllPending}
                  disabled={pendingApprovals.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-[15px] font-semibold shadow-sm transition-colors disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>Approve Monthly LOP Summary</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPendingModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-blue-300 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1D4ED8] text-[15px] font-semibold transition-colors"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  <span>
                    Review Pending Leave Requests ({pendingApprovals.length})
                  </span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {activeNav === 'divisions' && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-blue-200 bg-[#EFF6FF]/70">
            <h3 className="text-base font-bold text-[#0F172A]">
              Division-Wise Attendance &amp; Work Category Summary ({formattedLatestDate})
            </h3>
            <p className="text-sm font-medium text-slate-700 mt-0.5">
              Divisions 1 to 7 summary showing Driver / Sanitary Worker and Fingerprint / Face Scan counts
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#DBEAFE]/70 text-[#0F172A] text-[13px] uppercase tracking-wide border-b border-blue-200">
                  <th className="py-3.5 px-4 font-bold">Division</th>
                  <th className="py-3.5 px-4 font-bold text-right">Total</th>
                  <th className="py-3.5 px-4 font-bold text-right">Drivers</th>
                  <th className="py-3.5 px-4 font-bold text-right">
                    Sanitary Workers
                  </th>
                  <th className="py-3.5 px-4 font-bold text-right">
                    Fingerprint / Face
                  </th>
                  <th className="py-3.5 px-4 font-bold text-right">Present</th>
                  <th className="py-3.5 px-4 font-bold text-right">Late / Half-Day</th>
                  <th className="py-3.5 px-4 font-bold text-right">Leave</th>
                  <th className="py-3.5 px-4 font-bold text-right">
                    Absent (LOP)
                  </th>
                  <th className="py-3.5 px-4 font-bold text-right">Attendance %</th>
                  <th className="py-3.5 px-4 font-bold text-right">
                    Salary Cut (₹)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100 text-[15px] font-medium text-[#0F172A]">
                {divisionSummaries.map((div) => (
                  <tr key={div.division} className="hover:bg-[#EFF6FF]/70">
                    <td className="py-3.5 px-4 font-bold text-[#0F172A]">
                      {div.label}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold">
                      {div.totalWorkers}
                    </td>
                    <td className="py-3.5 px-4 text-right">{div.driverCount}</td>
                    <td className="py-3.5 px-4 text-right">
                      {div.sanitaryWorkerCount}
                    </td>
                    <td className="py-3.5 px-4 text-right text-[#1D4ED8] font-bold">
                      {div.fingerCount} / {div.faceCount}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-700">
                      {div.presentCount}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-amber-800">
                      {div.lateOrHalfDayCount}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-[#1D4ED8]">
                      {div.approvedLeaveCount}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-red-700">
                      {div.absentLopCount}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-[#0F172A]">
                      {div.attendanceRatePct}%
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-red-700">
                      {formatInr(div.totalLopDeductionInr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeNav === 'lop_approval' && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-blue-200 bg-[#EFF6FF]/70 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[#0F172A]">
                Monthly Salary Cut &amp; Loss of Pay (LOP) Approval Register
              </h3>
              <p className="text-sm font-medium text-slate-700 mt-0.5">
                Worker-wise attendance and salary cut summary for Commissioner sign-off
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={divisionFilter}
                onChange={(e) => setDivisionFilter(e.target.value)}
                className="px-3.5 py-2 rounded-lg border border-blue-300 bg-white text-[15px] font-medium text-[#0F172A]"
              >
                <option value="ALL">All Divisions (1 to 7)</option>
                {ALL_DIVISIONS.map((d) => (
                  <option key={d} value={String(d)}>
                    Division {d}
                  </option>
                ))}
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3.5 py-2 rounded-lg border border-blue-300 bg-white text-[15px] font-medium text-[#0F172A]"
              >
                <option value="ALL">All Work Categories</option>
                <option value="Sanitary Worker">Sanitary Worker</option>
                <option value="Driver">Driver</option>
                <option value="Supervisor">Supervisor</option>
              </select>

              <button
                type="button"
                onClick={handleApproveAllPending}
                disabled={pendingApprovals.length === 0}
                className="px-4 py-2 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-[15px] font-semibold disabled:opacity-50"
              >
                Approve All Pending ({pendingApprovals.length})
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#DBEAFE]/70 text-[#0F172A] text-[13px] uppercase tracking-wide border-b border-blue-200">
                  <th className="py-3.5 px-4 font-bold">Worker Code</th>
                  <th className="py-3.5 px-4 font-bold">Division</th>
                  <th className="py-3.5 px-4 font-bold">Worker Name</th>
                  <th className="py-3.5 px-4 font-bold">Work Category</th>
                  <th className="py-3.5 px-4 font-bold">Gender</th>
                  <th className="py-3.5 px-4 font-bold text-right">Present</th>
                  <th className="py-3.5 px-4 font-bold text-right">Late</th>
                  <th className="py-3.5 px-4 font-bold text-right">Leave</th>
                  <th className="py-3.5 px-4 font-bold text-right">
                    Loss of Pay (Days)
                  </th>
                  <th className="py-3.5 px-4 font-bold text-right">
                    Salary Cut (₹)
                  </th>
                  <th className="py-3.5 px-4 font-bold">Approval Status</th>
                  <th className="py-3.5 px-4 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100 text-[15px] font-medium text-[#0F172A]">
                {filteredApprovals.map((row: MonthlyLopApprovalRecord) => {
                  const isApproved = row.gm_approval_status === 'Approved';
                  return (
                    <tr key={row.approval_id} className="hover:bg-[#EFF6FF]/70">
                      <td className="py-3.5 px-4 font-mono font-bold text-[#1D4ED8]">
                        {row.employee_code}
                      </td>
                      <td className="py-3.5 px-4 font-semibold">
                        Division {row.division}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[#0F172A]">
                        {row.name}
                      </td>
                      <td className="py-3.5 px-4 text-[#0F172A]">
                        {row.category}
                      </td>
                      <td className="py-3.5 px-4 text-[#0F172A]">
                        {row.gender}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-emerald-700">
                        {row.days_present}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-amber-800">
                        {row.late_count}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-[#1D4ED8]">
                        {row.approved_leaves}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold">
                        {row.total_lop_days.toFixed(1)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-red-700">
                        {formatInr(row.total_lop_deduction_inr)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-[13px] font-bold border ${
                            isApproved
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-amber-50 text-amber-900 border-amber-300'
                          }`}
                        >
                          {row.gm_approval_status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {!isApproved ? (
                          <button
                            type="button"
                            onClick={() =>
                              onApproveMonthlyLop([row.approval_id])
                            }
                            className="px-3 py-1.5 rounded-md bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-[13px] font-semibold"
                          >
                            Approve
                          </button>
                        ) : (
                          <span className="text-sm font-medium text-slate-700">
                            {row.approved_by}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending Leave & Loss of Pay Review Modal */}
      {showPendingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl border border-blue-200 overflow-hidden">
            <div className="bg-[#1E3A5F] px-6 py-4 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">
                  Pending Commissioner Sign-Off &amp; Leave Approvals
                </h3>
                <p className="text-sm text-blue-100">
                  {pendingApprovals.length} records awaiting Commissioner sign-off
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPendingModal(false)}
                className="p-1.5 rounded-lg hover:bg-white/15 text-blue-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 max-h-[60vh] overflow-y-auto space-y-3">
              {pendingApprovals.length === 0 ? (
                <div className="py-8 text-center text-base text-emerald-800 font-bold">
                  All records have been approved by the Commissioner.
                </div>
              ) : (
                pendingApprovals.map((item) => (
                  <div
                    key={item.approval_id}
                    className="p-4 rounded-xl border border-blue-200 bg-[#EFF6FF]/70 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-base font-bold text-[#0F172A]">
                        {item.name} ({item.employee_code})
                      </p>
                      <p className="text-sm font-medium text-slate-800 mt-0.5">
                        Division {item.division} • {item.category} • Loss of Pay:{' '}
                        <strong>{item.total_lop_days.toFixed(1)} Days</strong> •
                        Salary Cut:{' '}
                        <strong className="text-red-700">
                          {formatInr(item.total_lop_deduction_inr)}
                        </strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onApproveMonthlyLop([item.approval_id])}
                      className="px-4 py-2 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-sm font-semibold"
                    >
                      Approve
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowPendingModal(false)}
                className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-[15px] font-semibold text-[#0F172A]"
              >
                Close
              </button>
              {pendingApprovals.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    handleApproveAllPending();
                    setShowPendingModal(false);
                  }}
                  className="px-5 py-2.5 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-[15px] font-semibold"
                >
                  Approve All ({pendingApprovals.length})
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};
