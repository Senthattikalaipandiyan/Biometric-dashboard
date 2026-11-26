import React, { useCallback, useEffect, useState } from 'react';
import type {
  AttendanceDataset,
  AttendanceMethod,
  AttendanceRecord,
  AttendanceStatusCode,
  RegistrationPayload,
  UserRoleRecord,
  WorkerCategory,
  WorkerEnrollmentPayload,
  WorkerUpdatePayload,
} from './types/attendance';
import {
  buildApprovalsFromRecords,
  excelAttendanceService,
} from './services/excelAttendanceService';
import { biometricApiService } from './services/biometricApiService';
import { AuthScreen } from './components/AuthScreen';
import { Level1SupervisorView } from './components/Level1SupervisorView';
import { Level2TimekeeperView } from './components/Level2TimekeeperView';
import { Level3GmView } from './components/Level3GmView';

export const App: React.FC = () => {
  const [dataset, setDataset] = useState<AttendanceDataset | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserRoleRecord | null>(null);

  const loadFromDatabaseApi = useCallback(async (isManualSync = false) => {
    try {
      if (isManualSync) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setLoadError(null);
      const loaded = await biometricApiService.fetchAttendanceWithFallback();
      if (loaded.dataSourceMode === 'error' && loaded.dataSourceMessage) {
        setLoadError(loaded.dataSourceMessage);
      }
      setDataset((prev) =>
        prev
          ? {
              ...loaded,
              users: prev.users.length > 0 ? prev.users : loaded.users,
            }
          : loaded
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to connect to biometric database API';
      setLoadError(message);
      setDataset((prev) =>
        prev
          ? {
              ...prev,
              dataSourceMode: 'error',
              dataSourceMessage: message,
            }
          : biometricApiService.createEmptyErrorDataset(message)
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadFromDatabaseApi(false);
  }, [loadFromDatabaseApi]);

  const handleRegister = (payload: RegistrationPayload): UserRoleRecord => {
    const existing = dataset?.users ?? [];
    const created = excelAttendanceService.createRegisteredUser(existing, payload);
    setDataset((prev) =>
      prev
        ? {
            ...prev,
            users: [...prev.users, created],
          }
        : prev
    );
    return created;
  };

  const handleEnrollWorker = (
    payload: WorkerEnrollmentPayload
  ): AttendanceRecord => {
    const existing = dataset?.records ?? [];
    const created = excelAttendanceService.createAttendanceRecord(
      existing,
      payload,
      currentUser?.full_name ?? 'K. Meenakshi'
    );
    setDataset((prev) => {
      if (!prev) return prev;
      const updatedRecords = [...prev.records, created];
      const approvalStatusMap = new Map(
        prev.monthlyApprovals.map((a) => [
          a.employee_code,
          {
            gm_approval_status: a.gm_approval_status,
            approved_by: a.approved_by,
          },
        ])
      );
      const updatedApprovals = buildApprovalsFromRecords(
        updatedRecords,
        approvalStatusMap
      );
      const availableDates = Array.from(
        new Set(updatedRecords.map((r) => r.date))
      ).sort((a, b) => b.localeCompare(a));

      return {
        ...prev,
        records: updatedRecords,
        monthlyApprovals: updatedApprovals,
        availableDates,
      };
    });
    return created;
  };

  const handleUpdateEmployee = (payload: WorkerUpdatePayload) => {
    setDataset((prev) => {
      if (!prev) return prev;
      const updatedRecords = excelAttendanceService.updateEmployeeProfile(
        prev.records,
        payload,
        currentUser?.full_name ?? 'K. Meenakshi'
      );
      const approvalStatusMap = new Map(
        prev.monthlyApprovals.map((a) => [
          a.employee_code,
          {
            gm_approval_status: a.gm_approval_status,
            approved_by: a.approved_by,
          },
        ])
      );
      const updatedApprovals = buildApprovalsFromRecords(
        updatedRecords,
        approvalStatusMap
      );
      return {
        ...prev,
        records: updatedRecords,
        monthlyApprovals: updatedApprovals,
        syncedAt: new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      };
    });
  };

  const handleUpdateRecord = (
    logId: string,
    updates: {
      status_code: AttendanceStatusCode;
      category: WorkerCategory;
      in_time: string;
      out_time: string;
      attendance_method: AttendanceMethod;
      remarks: string;
    }
  ) => {
    if (!currentUser) return;
    setDataset((prev) => {
      if (!prev) return prev;
      const updatedRecords = excelAttendanceService.updateAttendanceRecord(
        prev.records,
        logId,
        {
          ...updates,
          verified_by: currentUser.full_name,
        }
      );

      const approvalStatusMap = new Map(
        prev.monthlyApprovals.map((a) => [
          a.employee_code,
          {
            gm_approval_status: a.gm_approval_status,
            approved_by: a.approved_by,
          },
        ])
      );

      const updatedApprovals = buildApprovalsFromRecords(
        updatedRecords,
        approvalStatusMap
      );

      return {
        ...prev,
        records: updatedRecords,
        monthlyApprovals: updatedApprovals,
        syncedAt: new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      };
    });
  };

  const handleApproveMonthlyLop = (approvalIds: string[]) => {
    if (!currentUser) return;
    const idSet = new Set(approvalIds);
    setDataset((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        monthlyApprovals: prev.monthlyApprovals.map((row) =>
          idSet.has(row.approval_id)
            ? {
                ...row,
                gm_approval_status: 'Approved',
                approved_by: `${currentUser.full_name} (Commissioner)`,
              }
            : row
        ),
      };
    });
  };

  if (!currentUser || !dataset) {
    return (
      <AuthScreen
        users={dataset?.users ?? []}
        onSignIn={(user) => setCurrentUser(user)}
        isLoading={isLoading}
        loadError={loadError}
      />
    );
  }

  if (currentUser.access_level === 1) {
    return (
      <Level1SupervisorView
        user={currentUser}
        dataset={dataset}
        isRefreshing={isRefreshing}
        onRefresh={() => void loadFromDatabaseApi(true)}
        onSignOut={() => setCurrentUser(null)}
      />
    );
  }

  if (currentUser.access_level === 2) {
    return (
      <Level2TimekeeperView
        user={currentUser}
        dataset={dataset}
        isRefreshing={isRefreshing}
        onRefresh={() => void loadFromDatabaseApi(true)}
        onUpdateRecord={handleUpdateRecord}
        onEnrollWorker={handleEnrollWorker}
        onUpdateEmployee={handleUpdateEmployee}
        onRegisterUser={handleRegister}
        onSignOut={() => setCurrentUser(null)}
      />
    );
  }

  return (
    <Level3GmView
      user={currentUser}
      dataset={dataset}
      isRefreshing={isRefreshing}
      onRefresh={() => void loadFromDatabaseApi(true)}
      onApproveMonthlyLop={handleApproveMonthlyLop}
      onSignOut={() => setCurrentUser(null)}
    />
  );
};

export default App;
