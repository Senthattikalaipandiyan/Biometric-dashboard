import React from 'react';
import { Clock, Fingerprint, ScanFace, UserCheck, X } from 'lucide-react';
import type { AttendanceRecord } from '../types/attendance';
import { formatDisplayDate, formatInr } from '../services/excelAttendanceService';
import { StatusBadge } from './StatusBadge';

interface LogDetailsModalProps {
  record: AttendanceRecord | null;
  onClose: () => void;
}

export const LogDetailsModal: React.FC<LogDetailsModalProps> = ({
  record,
  onClose,
}) => {
  if (!record) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl border border-blue-200 overflow-hidden">
        <div className="bg-[#1E3A5F] px-6 py-4 text-white flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-blue-100 font-semibold">
              Serial No. #{record.s_no} • Worker Code {record.employee_code}
            </p>
            <h3 className="text-lg font-bold">
              {record.name} (Division {record.division})
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/15 text-blue-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#EFF6FF] px-4 py-3.5 rounded-xl border border-blue-200">
            <div>
              <p className="text-xs font-semibold text-slate-700">
                Attendance Status
              </p>
              <div className="mt-1">
                <StatusBadge statusCode={record.status_code} showCode />
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-700">
                Attendance Date
              </p>
              <p className="text-base font-bold text-[#0F172A]">
                {formatDisplayDate(record.date)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
              <span className="text-xs font-semibold text-slate-600 block">
                S. No.
              </span>
              <span className="font-bold text-[#0F172A] text-[15px] mt-0.5 block">
                {record.s_no}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
              <span className="text-xs font-semibold text-slate-600 block">
                Worker Code (6 Digits)
              </span>
              <span className="font-bold text-[#1D4ED8] font-mono text-[15px] mt-0.5 block">
                {record.employee_code}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
              <span className="text-xs font-semibold text-slate-600 block">
                Division &amp; Shift
              </span>
              <span className="font-bold text-[#0F172A] text-[15px] mt-0.5 block">
                Division {record.division} • {record.shift}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
              <span className="text-xs font-semibold text-slate-600 block">
                Work Category
              </span>
              <span className="font-bold text-[#0F172A] text-[15px] mt-0.5 block">
                {record.category}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
              <span className="text-xs font-semibold text-slate-600 block">
                Gender
              </span>
              <span className="font-bold text-[#0F172A] text-[15px] mt-0.5 block">
                {record.gender}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
              <span className="text-xs font-semibold text-slate-600 block">
                Scan Type
              </span>
              <span className="font-bold text-[#1D4ED8] text-[15px] mt-0.5 inline-flex items-center gap-1.5">
                {record.attendance_method === 'Face' ? (
                  <ScanFace className="h-4 w-4" />
                ) : record.attendance_method === 'Finger' ? (
                  <Fingerprint className="h-4 w-4" />
                ) : null}
                {record.attendance_method === 'Finger'
                  ? 'Fingerprint'
                  : record.attendance_method === 'Face'
                  ? 'Face Scan'
                  : '--'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
              <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-[#1D4ED8]" />
                Punch In Time
              </span>
              <span className="font-bold text-[#0F172A] text-[15px] mt-0.5 block">
                {record.in_time}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
              <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-[#1D4ED8]" />
                Punch Out Time
              </span>
              <span className="font-bold text-[#0F172A] text-[15px] mt-0.5 block">
                {record.out_time}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-blue-200 bg-[#EFF6FF]/70">
              <span className="text-xs font-semibold text-slate-700 block">
                Total Working Hours
              </span>
              <span className="font-bold text-[#0F172A] text-[15px] mt-0.5 block">
                {record.total_duration}
              </span>
            </div>
          </div>

          {(record.father_or_husband_name || record.cell_number) && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-sm">
              {record.father_or_husband_name && (
                <div>
                  <span className="text-slate-600 font-medium">
                    Father / Husband:
                  </span>{' '}
                  <span className="font-bold text-[#0F172A]">
                    {record.father_or_husband_name}
                  </span>
                </div>
              )}
              {record.cell_number && (
                <div>
                  <span className="text-slate-600 font-medium">Mobile No.:</span>{' '}
                  <span className="font-bold text-[#1D4ED8] font-mono">
                    {record.cell_number}
                  </span>
                </div>
              )}
              <div>
                <span className="text-slate-600 font-medium">Designation:</span>{' '}
                <span className="font-bold text-[#0F172A]">
                  {record.raw_designation}
                </span>
              </div>
            </div>
          )}

          <div className="p-3.5 rounded-xl border border-blue-200 bg-[#EFF6FF]/70 text-sm space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-slate-700 flex items-center gap-1.5 font-semibold">
                <UserCheck className="h-4 w-4 text-[#1D4ED8]" />
                Checked By:{' '}
                <span className="text-[#0F172A] font-bold">
                  {record.verified_by}
                </span>
              </p>
              <p className="font-bold text-red-700">
                Loss of Pay: {record.lop_days.toFixed(1)} Day (
                {formatInr(record.daily_lop_deduction_inr)})
              </p>
            </div>
            <p className="text-slate-800">
              <span className="font-bold text-[#0F172A]">Note:</span>{' '}
              {record.remarks || 'No notes recorded'}
            </p>
          </div>
        </div>

        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-[15px] font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
