"use client";

import Link from "next/link";
import { useState } from "react";
import DashboardTranslator from "./DashboardTranslator";
import LanguageSelector from "./LanguageSelector";

export default function DashboardShell({ title, eyebrow, active, actions, showAdmin = false, userName = "", children }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="dashboard-body">
      <DashboardTranslator />
      <aside className="app-sidebar">
        <div className="app-sidebar-head">
          <Link className="app-brand" href="/dashboard">
            <span>BB</span>
            <strong>Boster Bost</strong>
          </Link>
          <button
            className="dashboard-menu-toggle"
            type="button"
            aria-expanded={isMenuOpen}
            aria-label="Open dashboard menu"
            onClick={() => setIsMenuOpen((current) => !current)}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
        <div className="sidebar-actions">
          <LanguageSelector />
          {actions}
        </div>
        <nav className={isMenuOpen ? "open" : ""} aria-label="Dashboard navigation" onClick={() => setIsMenuOpen(false)}>
          <Link className={active === "customer" ? "active" : ""} href="/dashboard">
            Overview
          </Link>
          <Link className={active === "wallet" ? "active" : ""} href="/dashboard/wallet">
            Add Funds
          </Link>
          <Link className={active === "orders" ? "active" : ""} href="/dashboard/orders">
            Place Order
          </Link>
          <Link className={active === "support" ? "active" : ""} href="/dashboard/support">
            Support
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
            {userName ? <p className="signed-in-user">Signed in as {userName}</p> : null}
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
