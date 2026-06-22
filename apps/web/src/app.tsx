import { Navigate, Route, Routes } from "react-router-dom";

import { AdminPage } from "./pages/AdminPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { SearchPage } from "./pages/SearchPage.js";
import { StatusPage } from "./pages/StatusPage.js";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/search" replace />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/status/:token" element={<StatusPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

