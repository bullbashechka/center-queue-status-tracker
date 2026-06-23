import { Link } from "react-router-dom";

const label = "Вход для сотрудников";

export function AdminEntryLink() {
  return (
    <Link className="admin-entry-link" to="/admin/login" title={label} aria-label={label}>
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="10" r="3.4" />
        <path d="M18 19.5a6 6 0 0 0-12 0" />
      </svg>
    </Link>
  );
}
