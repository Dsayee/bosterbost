"use client";

import Link from "next/link";
import DashboardTranslator from "./DashboardTranslator";
import LanguageSelector from "./LanguageSelector";

export default function DashboardShell({ title, eyebrow, active, actions, showAdmin = false, children }) {
  return (
    <div className="dashboard-body">
      <DashboardTranslator />
      <aside className="app-sidebar">
        <Link className="app-brand" href="/">
          <span>BB</span>
          <strong>Boster Bost</strong>
        </Link>
        <nav aria-label="Dashboard navigation">
          <Link className={active === "customer" ? "active" : ""} href="/dashboard">
            Customer Dashboard
          </Link>
          {showAdmin ? (
            <Link className={active === "admin" ? "active" : ""} href="/admin">
              Admin Dashboard
            </Link>
          ) : null}
          <Link href="/">Landing Page</Link>
        </nav>
      </aside>

      <main className="app-main">
        <header className="app-topbar">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">
            <LanguageSelector />
            {actions}
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
