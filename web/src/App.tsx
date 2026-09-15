import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { PublicOnlyRoute } from './routes/PublicOnlyRoute';
import { RoleRoute } from './routes/AdminOnlyRoute';
import { AdminLayout } from './components/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { HoSoPage } from './pages/HoSoPage';
import { HomePage } from './pages/HomePage';
import { MyScorecardsPage } from './pages/kpi/MyScorecardsPage';
import { AssignKpiPage } from './pages/kpi/AssignKpiPage';
import { ScorecardDetailPage } from './pages/kpi/ScorecardDetailPage';
import { ScoringPage } from './pages/kpi/ScoringPage';
import { SubmissionProgressPage } from './pages/kpi/SubmissionProgressPage';
import { DashboardPage } from './pages/kpi/DashboardPage';
import { DepartmentsPage } from './pages/admin/DepartmentsPage';
import { JobTitlesPage } from './pages/admin/JobTitlesPage';
import { UsersPage } from './pages/admin/UsersPage';
import { KpiTemplatesPage } from './pages/admin/KpiTemplatesPage';
import { KpiTemplateEditorPage } from './pages/admin/KpiTemplateEditorPage';
import { AuditLogsPage } from './pages/admin/AuditLogsPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import {
  coTheGiaoKpi,
  coTheXemBaoCao,
  coTheXemMau,
  coTheXemNhanVien,
  coTheXemCaiDat,
  coTheXemNhatKy,
  coTheXemToChuc,
} from './auth/permissions';

export function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        {/* Màn đổi mật khẩu đứng riêng, không có menu: người bị bắt buộc đổi
            mật khẩu chưa được vào đâu khác. */}
        <Route path="/change-password" element={<ChangePasswordPage />} />

        <Route element={<AdminLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/ho-so" element={<HoSoPage />} />

          {/* Phiếu KPI của chính mình — MỌI vai trò đều có, kể cả STAFF. */}
          <Route path="/kpi/my" element={<MyScorecardsPage />} />

          {/* Màn chấm điểm nằm NGOÀI RoleRoute: STAFF phải vào được để tự
              chấm phiếu của mình. Ai xem được phiếu nào do backend quyết
              (assertCoTheXem + getAccessibleDepartmentIds), không phải route. */}
          <Route path="/kpi/scorecards/:id/scoring" element={<ScoringPage />} />

          {/* Giao KPI cho người khác — STAFF không vào. */}
          <Route element={<RoleRoute duocPhep={coTheGiaoKpi} />}>
            <Route path="/kpi/assign" element={<AssignKpiPage />} />
            <Route path="/kpi/scorecards/:id" element={<ScorecardDetailPage />} />
          </Route>

          {/* Báo cáo tiến độ — mọi vai trò quản lý, STAFF không vào. */}
          <Route element={<RoleRoute duocPhep={coTheXemBaoCao} />}>
            <Route path="/kpi/progress" element={<SubmissionProgressPage />} />
            <Route path="/kpi/dashboard" element={<DashboardPage />} />
          </Route>

          {/* Kỳ đánh giá và chốt sổ — HCNS, ban giám đốc, quản trị. */}

          {/* Nhật ký thao tác — chỉ quản trị và ban giám đốc. */}
          <Route element={<RoleRoute duocPhep={coTheXemNhatKy} />}>
            <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
          </Route>

          {/* Cài đặt hệ thống — quản trị, HCNS, ban giám đốc xem; ADMIN/HR sửa. */}
          <Route element={<RoleRoute duocPhep={coTheXemCaiDat} />}>
            <Route path="/admin/settings" element={<SettingsPage />} />
          </Route>

          <Route element={<RoleRoute duocPhep={coTheXemToChuc} />}>
            <Route path="/admin/departments" element={<DepartmentsPage />} />
            <Route path="/admin/job-titles" element={<JobTitlesPage />} />
          </Route>

          <Route element={<RoleRoute duocPhep={coTheXemNhanVien} />}>
            <Route path="/admin/users" element={<UsersPage />} />
          </Route>

          <Route element={<RoleRoute duocPhep={coTheXemMau} />}>
            <Route path="/admin/kpi-templates" element={<KpiTemplatesPage />} />
            <Route
              path="/admin/kpi-templates/:id/edit"
              element={<KpiTemplateEditorPage />}
            />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
