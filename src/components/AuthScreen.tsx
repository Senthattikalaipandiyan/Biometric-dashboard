import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Fingerprint,
  Lock,
  Mail,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type {
  AccessLevel,
  DivisionNumber,
  UserRoleRecord,
} from '../types/attendance';
import { ALL_DIVISIONS } from '../services/excelAttendanceService';

interface AuthScreenProps {
  users: UserRoleRecord[];
  onSignIn: (user: UserRoleRecord) => void;
  isLoading: boolean;
  loadError: string | null;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  users,
  onSignIn,
  isLoading,
  loadError,
}) => {
  const [identifier, setIdentifier] = useState(
    users[0]?.email ?? 'div1.so@clc.gov.in'
  );
  const [password, setPassword] = useState(
    users[0]?.password_hash ?? 'pw_clc_div1'
  );
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(
    users[0]?.access_level ?? 1
  );
  const [selectedDivision, setSelectedDivision] = useState<DivisionNumber>(1);
  const [authError, setAuthError] = useState<string | null>(null);

  // Interactive Access Role dropdown & Div SO flyout state
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [divFlyoutOpen, setDivFlyoutOpen] = useState(false);
  const [presetDivFlyoutOpen, setPresetDivFlyoutOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (users.length > 0 && !users.some((u) => u.email === identifier)) {
      setIdentifier(users[0].email);
      setPassword(users[0].password_hash);
      setAccessLevel(users[0].access_level);
      if (typeof users[0].assigned_division === 'number') {
        setSelectedDivision(users[0].assigned_division as DivisionNumber);
      }
    }
  }, [users, identifier]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setRoleDropdownOpen(false);
        setDivFlyoutOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const findUserForRole = (
    level: AccessLevel,
    division?: DivisionNumber
  ): UserRoleRecord | undefined => {
    if (level === 1 && division) {
      return users.find(
        (u) => u.access_level === 1 && u.assigned_division === division
      );
    }
    return users.find((u) => u.access_level === level);
  };

  const handleSelectRoleOption = (
    level: AccessLevel,
    division?: DivisionNumber
  ) => {
    setAuthError(null);
    setAccessLevel(level);
    if (level === 1 && division) {
      setSelectedDivision(division);
    }
    const matched = findUserForRole(level, division);
    if (matched) {
      setIdentifier(matched.email);
      setPassword(matched.password_hash);
    }
    setRoleDropdownOpen(false);
    setDivFlyoutOpen(false);
  };

  const handlePresetSelect = (presetUser: UserRoleRecord) => {
    setAuthError(null);
    setIdentifier(presetUser.email);
    setPassword(presetUser.password_hash);
    setAccessLevel(presetUser.access_level);
    if (typeof presetUser.assigned_division === 'number') {
      setSelectedDivision(presetUser.assigned_division as DivisionNumber);
    }
    setPresetDivFlyoutOpen(false);
    onSignIn(presetUser);
  };

  const handleSignInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const trimmed = identifier.trim().toLowerCase();
    const matched = users.find(
      (u) =>
        (u.email.toLowerCase() === trimmed ||
          u.employee_id.toLowerCase() === trimmed) &&
        u.access_level === accessLevel
    );

    if (!matched) {
      setAuthError(
        'No matching staff account found for that Email / Staff ID and Access Role.'
      );
      return;
    }

    if (matched.password_hash !== password.trim()) {
      setAuthError(
        'Incorrect password. Please check your password or select a role on the right.'
      );
      return;
    }

    if (matched.account_status.toLowerCase() === 'pending') {
      setAuthError(
        `Account ${matched.full_name} (${matched.employee_id}) is waiting for approval.`
      );
      return;
    }

    if (accessLevel === 1) {
      onSignIn({
        ...matched,
        assigned_division: selectedDivision,
        assigned_department: `Division ${selectedDivision}`,
        role_title: `Div ${selectedDivision} SO`,
      });
      return;
    }

    onSignIn(matched);
  };

  const activeRoleLabel =
    accessLevel === 1
      ? `Div ${selectedDivision} SO (Division ${selectedDivision})`
      : accessLevel === 2
      ? 'MHO'
      : 'Commissioner';

  const mhoUser = users.find((u) => u.access_level === 2);
  const commissionerUser = users.find((u) => u.access_level === 3);

  return (
    <div className="min-h-screen bg-[#EFF6FF] flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sign In Card */}
        <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-blue-200 overflow-visible">
          <div className="bg-[#1E3A5F] px-6 py-5 text-white flex items-center justify-between rounded-t-2xl">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-[#2563EB] flex items-center justify-center shadow">
                <Fingerprint className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Biometric Attendance
                </h1>
              </div>
            </div>
          </div>

          <div className="p-6">
            {loadError && (
              <div className="mb-4 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm font-medium flex items-center gap-2">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>{loadError}</span>
              </div>
            )}

            {authError && (
              <div className="mb-4 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm font-medium flex items-center gap-2">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleSignInSubmit} className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-[#0F172A]">Sign In</h2>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                  Email or Staff ID
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. div1.so@clc.gov.in or EMP-101"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-blue-300 bg-white text-[15px] font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-blue-300 bg-white text-[15px] font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    required
                  />
                </div>
              </div>

              {/* Access Role Selector with Div SO (Div 1 to Div 7) Hover Flyout */}
              <div ref={dropdownRef} className="relative">
                <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">
                  Access Role
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setRoleDropdownOpen((prev) => !prev);
                    setDivFlyoutOpen(false);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-blue-300 bg-white text-[15px] font-medium text-[#0F172A] flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                >
                  <span>{activeRoleLabel}</span>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-700 transition-transform ${
                      roleDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {roleDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-1.5 z-40 rounded-xl border border-blue-200 bg-white shadow-lg py-1.5">
                    {/* Div SO with hover / click flyout submenu */}
                    <div
                      className="relative"
                      onMouseEnter={() => setDivFlyoutOpen(true)}
                      onMouseLeave={() => setDivFlyoutOpen(false)}
                    >
                      <button
                        type="button"
                        onClick={() => setDivFlyoutOpen((prev) => !prev)}
                        className={`w-full px-4 py-2.5 text-left text-[15px] font-semibold flex items-center justify-between transition-colors ${
                          accessLevel === 1
                            ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                            : 'text-[#0F172A] hover:bg-[#EFF6FF]'
                        }`}
                      >
                        <span>Div SO</span>
                        <ChevronRight className="h-4 w-4 text-[#1D4ED8]" />
                      </button>

                      {divFlyoutOpen && (
                        <div className="sm:absolute sm:left-full sm:top-0 sm:ml-1 w-full sm:w-56 rounded-xl border border-blue-200 bg-white shadow-xl py-1.5 z-50">
                          {ALL_DIVISIONS.map((div) => (
                            <button
                              key={div}
                              type="button"
                              onClick={() => handleSelectRoleOption(1, div)}
                              className={`w-full px-4 py-2 text-left text-[15px] font-medium flex items-center justify-between transition-colors ${
                                accessLevel === 1 && selectedDivision === div
                                  ? 'bg-[#1D4ED8] text-white font-semibold'
                                  : 'text-[#0F172A] hover:bg-[#EFF6FF]'
                              }`}
                            >
                              <span>Div {div} SO</span>
                              <span
                                className={`text-xs ${
                                  accessLevel === 1 && selectedDivision === div
                                    ? 'text-blue-100'
                                    : 'text-slate-600'
                                }`}
                              >
                                Division {div}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* MHO */}
                    <button
                      type="button"
                      onMouseEnter={() => setDivFlyoutOpen(false)}
                      onClick={() => handleSelectRoleOption(2)}
                      className={`w-full px-4 py-2.5 text-left text-[15px] font-semibold transition-colors ${
                        accessLevel === 2
                          ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                          : 'text-[#0F172A] hover:bg-[#EFF6FF]'
                      }`}
                    >
                      MHO
                    </button>

                    {/* Commissioner */}
                    <button
                      type="button"
                      onMouseEnter={() => setDivFlyoutOpen(false)}
                      onClick={() => handleSelectRoleOption(3)}
                      className={`w-full px-4 py-2.5 text-left text-[15px] font-semibold transition-colors ${
                        accessLevel === 3
                          ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                          : 'text-[#0F172A] hover:bg-[#EFF6FF]'
                      }`}
                    >
                      Commissioner
                    </button>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-semibold text-[15px] shadow-sm transition-colors disabled:opacity-50"
              >
                {isLoading
                  ? 'Loading Attendance Register...'
                  : 'Sign In to Biometric Attendance'}
              </button>
            </form>
          </div>
        </div>

        {/* Quick Role Sign-In Panel (Div SO with Div 1-7 Hover Flyout, MHO, Commissioner) */}
        <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-blue-200 overflow-visible">
          <div className="px-5 py-4 bg-[#DBEAFE] border-b border-blue-200 flex items-center justify-between rounded-t-2xl">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#1D4ED8]" />
              <h3 className="text-base font-bold text-[#0F172A]">
                Quick Role Sign-In
              </h3>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white text-[#1D4ED8] border border-blue-200">
              3 Roles
            </span>
          </div>

          <div className="p-4 space-y-3">
            <p className="text-sm font-medium text-slate-700">
              Hover or click <strong>Div SO</strong> to choose Division 1–7, or click <strong>MHO</strong> / <strong>Commissioner</strong>.
            </p>

            {/* Div SO Card with Hover / Click Submenu for Div 1 to Div 7 */}
            <div
              className="relative"
              onMouseEnter={() => setPresetDivFlyoutOpen(true)}
              onMouseLeave={() => setPresetDivFlyoutOpen(false)}
            >
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setPresetDivFlyoutOpen((prev) => !prev)}
                className="w-full text-left p-4 rounded-xl border border-blue-200 bg-white hover:border-[#2563EB] hover:bg-[#EFF6FF]/70 transition-all flex items-center justify-between gap-2 cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-[#0F172A]">
                      Div SO
                    </span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full border bg-blue-50 text-blue-800 border-blue-200">
                      Div 1 to Div 7
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-700 mt-1">
                    Division Sanitary Officer View
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#1D4ED8]">
                  <span>Select Div</span>
                  <ChevronRight className="h-4 w-4" />
                </span>
              </button>

              {presetDivFlyoutOpen && (
                <div className="mt-1.5 rounded-xl border border-blue-200 bg-white shadow-lg p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 z-30">
                  {ALL_DIVISIONS.map((div) => {
                    const divUser = findUserForRole(1, div);
                    return (
                      <button
                        key={div}
                        type="button"
                        disabled={isLoading || !divUser}
                        onClick={() => divUser && handlePresetSelect(divUser)}
                        className="px-3 py-2 rounded-lg border border-blue-100 bg-[#EFF6FF]/60 hover:bg-[#1D4ED8] hover:text-white text-left transition-colors group"
                      >
                        <p className="text-sm font-bold text-[#0F172A] group-hover:text-white">
                          Div {div} SO
                        </p>
                        <p className="text-xs font-medium text-slate-700 group-hover:text-blue-100 truncate">
                          Division {div} • {divUser?.full_name ?? ''}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* MHO Card */}
            {mhoUser && (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => handlePresetSelect(mhoUser)}
                className="w-full text-left p-4 rounded-xl border border-blue-200 bg-white hover:border-[#2563EB] hover:bg-[#EFF6FF]/70 transition-all flex items-center justify-between gap-2 cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-[#0F172A]">
                      {mhoUser.full_name}
                    </span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full border bg-amber-50 text-amber-900 border-amber-300">
                      MHO
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-700 mt-1">
                    {mhoUser.email} • All Divisions (1 to 7)
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#1D4ED8] shrink-0">
                  <ShieldCheck className="h-4 w-4" />
                  Open
                </span>
              </button>
            )}

            {/* Commissioner Card */}
            {commissionerUser && (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => handlePresetSelect(commissionerUser)}
                className="w-full text-left p-4 rounded-xl border border-blue-200 bg-white hover:border-[#2563EB] hover:bg-[#EFF6FF]/70 transition-all flex items-center justify-between gap-2 cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-[#0F172A]">
                      {commissionerUser.full_name}
                    </span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full border bg-emerald-50 text-emerald-800 border-emerald-300">
                      Commissioner
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-700 mt-1">
                    {commissionerUser.email} • All Divisions (1 to 7)
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#1D4ED8] shrink-0">
                  <ShieldCheck className="h-4 w-4" />
                  Open
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
