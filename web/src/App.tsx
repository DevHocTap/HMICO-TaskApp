import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { PublicOnlyRoute } from './routes/PublicOnlyRoute';
import { RoleRoute } from './routes/AdminOnlyRoute';
import { AdminLayout } from './components/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { HomePage } from './pages/HomePage';
import { MyScorecardsPage } from './pages/kpi/MyScorecardsPage';
import { DepartmentsPage } from './pages/admin/DepartmentsPage';
import { JobTitlesPage } from './pages/admin/JobTitlesPage';
import { UsersPage } from './pages/admin/UsersPage';
import { KpiTemplatesPage } from './pages/admin/KpiTemplatesPage';
import { KpiTemplateEditorPage } from './pages/admin/KpiTemplateEditorPage';
import { coTheXemNhanVien, coTheXemToChuc } from './auth/permissions';

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

          {/* Phiếu KPI của chính mình — MỌI vai trò đều có, kể cả STAFF. */}
          <Route path="/kpi/my" element={<MyScorecardsPage />} />

          <Route element={<RoleRoute duocPhep={coTheXemToChuc} />}>
            <Route path="/admin/departments" element={<DepartmentsPage />} />
            <Route path="/admin/job-titles" element={<JobTitlesPage />} />
          </Route>

          <Route element={<RoleRoute duocPhep={coTheXemNhanVien} />}>
            <Route path="/admin/users" element={<UsersPage />} />
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
