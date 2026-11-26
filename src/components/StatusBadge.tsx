import React from 'react';
import type { AttendanceStatusCode } from '../types/attendance';
import { getStatusLabel } from '../services/excelAttendanceService';

interface StatusBadgeProps {
  statusCode: AttendanceStatusCode;
  showCode?: boolean;
}

const BADGE_STYLES: Record<AttendanceStatusCode, string> = {
  P: 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-inset ring-emerald-600/20',
  LATE: 'bg-amber-50 text-amber-900 border-amber-300 ring-1 ring-inset ring-amber-600/25',
  HD: 'bg-yellow-50 text-yellow-900 border-yellow-400 ring-1 ring-inset ring-yellow-600/25',
  LOP: 'bg-red-50 text-red-800 border-red-300 ring-1 ring-inset ring-red-600/20',
  L: 'bg-blue-50 text-blue-800 border-blue-300 ring-1 ring-inset ring-blue-600/20',
};

const DOT_STYLES: Record<AttendanceStatusCode, string> = {
  P: 'bg-emerald-600',
  LATE: 'bg-amber-600',
  HD: 'bg-yellow-600',
  LOP: 'bg-red-600',
  L: 'bg-blue-700',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  statusCode,
  showCode = false,
}) => {
  const label = getStatusLabel(statusCode);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-bold border ${BADGE_STYLES[statusCode]}`}
    >
      <span className={`h-2 w-2 rounded-full ${DOT_STYLES[statusCode]}`} />
      {label}
      {showCode ? <span className="opacity-80">({statusCode})</span> : null}
    </span>
  );
};
