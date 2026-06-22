import { Navigate, Route, Routes } from "react-router-dom";

import { AdminChildPage } from "./pages/AdminChildPage.js";
import { AdminLayout } from "./pages/AdminLayout.js";
import { AdminListPage } from "./pages/AdminListPage.js";
import { AdminLoginPage } from "./pages/AdminLoginPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { SearchPage } from "./pages/SearchPage.js";
import { StatusPage } from "./pages/StatusPage.js";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/search" replace />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminListPage />} />
        <Route path="children/new" element={<AdminChildPage />} />
        <Route path="children/:childId" element={<AdminChildPage />} />
      </Route>
      <Route path="/search" element={<SearchPage />} />
      <Route path="/status/:token" element={<StatusPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
