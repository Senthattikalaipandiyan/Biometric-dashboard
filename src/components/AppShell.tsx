import React from 'react';
import {
  Bell,
  Calendar,
  Fingerprint,
  LogOut,
  Search,
} from 'lucide-react';
import type { UserRoleRecord } from '../types/attendance';
import { formatDisplayDate } from '../services/excelAttendanceService';

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string | number;
}

interface AppShellProps {
  pageTitle: string;
  user: UserRoleRecord;
  profileSubtitle: string;
  navItems: SidebarNavItem[];
  activeNavId: string;
  onSelectNav: (id: string) => void;
  searchValue: string;
  onSearchChange: (val: string) => void;
  searchPlaceholder?: string;
  dateLabel: string;
  sourceFile?: string;
  syncedAt?: string;
  dataSourceMode?: 'api' | 'excel' | 'error';
  dataSourceMessage?: string;
  notificationCount?: number;
  headerActions?: React.ReactNode;
  onSignOut: () => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  pageTitle,
  user,
  profileSubtitle,
  navItems,
  activeNavId,
  onSelectNav,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search by worker code or name...',
  dateLabel,
  dataSourceMode,
  dataSourceMessage,
  notificationCount = 0,
  headerActions,
  onSignOut,
  children,
}) => {
  const formattedDate =
    dateLabel === 'All Dates' ? 'All Dates' : formatDisplayDate(dateLabel);

  return (
    <div className="h-screen overflow-hidden flex bg-[#EFF6FF] text-[#0F172A]">
      {/* Left Dark/Navy Sidebar */}
      <aside className="w-72 h-screen sticky top-0 shrink-0 bg-[#0F2342] text-white flex flex-col justify-between border-r border-[#1E3A5F]">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-5 py-5 border-b border-white/10 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#2563EB] flex items-center justify-center shadow-sm shrink-0">
              <Fingerprint className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white leading-tight">
                Biometric Attendance
              </h1>
            </div>
          </div>

          <nav className="p-3.5 space-y-1.5">
            {navItems.map((item) => {
              const isActive = item.id === activeNavId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectNav(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-lg text-[15px] font-medium transition-colors ${
                    isActive
                      ? 'bg-[#1D4ED8] text-white shadow-sm font-semibold'
                      : 'text-blue-100 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5 text-left">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== undefined && (
                    <span
                      className={`px-2.5 py-0.5 text-xs rounded-full font-bold shrink-0 ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-blue-900/90 text-blue-100'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom User Profile */}
        <div className="p-4 border-t border-white/10 bg-[#0B1B34]">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-[#1D4ED8] flex items-center justify-center text-sm font-bold text-white shrink-0">
              {user.full_name
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white truncate">
                {user.full_name}
              </p>
              <p className="text-xs text-blue-100/90 leading-snug mt-0.5">
                {profileSubtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="mt-3.5 w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-[15px] font-medium bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 h-screen overflow-y-auto flex flex-col">
        {/* Top Bar */}
        <header className="bg-white border-b border-blue-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-20">
          <div>
            <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight">
              {pageTitle}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="h-4 w-4 text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-10 pr-4 py-2 w-64 sm:w-72 rounded-lg border border-blue-300 bg-[#EFF6FF]/70 text-[15px] font-medium text-[#0F172A] placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white"
              />
            </div>

            {headerActions}

            {/* Notification Bell */}
            <button
              type="button"
              title="Pending Alerts"
              className="relative p-2.5 rounded-lg border border-blue-200 bg-white hover:bg-[#EFF6FF] text-[#0F172A] transition-colors"
            >
              <Bell className="h-5 w-5" />
              {notificationCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center">
                  {notificationCount}
                </span>
              )}
            </button>

            {/* Date Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#DBEAFE] text-[#0F172A] text-sm font-bold border border-blue-300">
              <Calendar className="h-4 w-4 text-[#1D4ED8]" />
              <span>{formattedDate}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 space-y-6">
          {dataSourceMessage && (
            <div
              className={`rounded-xl px-4 py-3 border text-sm font-semibold flex items-center gap-2.5 ${
                dataSourceMode === 'api'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : dataSourceMode === 'excel'
                  ? 'bg-white border-blue-200 text-[#0F172A]'
                  : 'bg-red-50 border-red-300 text-red-900'
              }`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                  dataSourceMode === 'api'
                    ? 'bg-emerald-600'
                    : dataSourceMode === 'excel'
                    ? 'bg-[#2563EB]'
                    : 'bg-red-600'
                }`}
              />
              <span>{dataSourceMessage}</span>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
};
