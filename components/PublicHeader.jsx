"use client";

import Link from "next/link";
import { useState } from "react";

export default function PublicHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="utility-bar">
        <div className="container utility-inner">
          <p>Orders processed every <strong>0.14 seconds</strong> · 92,000+ active users</p>
          <div className="utility-right">
            <Link href="/signup" className="utility-link">Log In</Link>
            <Link href="/signup" className="btn btn-primary btn-small">Get Started</Link>
          </div>
        </div>
      </div>
      <nav className="container nav-shell" aria-label="Primary navigation">
        <Link className="brand" href="/">
          <span className="brand-mark">BB</span>
          <span>
            <strong>Boster Bost</strong>
            <small>Where Growth Begins</small>
          </span>
        </Link>
        <button
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="siteNav"
          aria-label="Toggle navigation"
          onClick={() => setOpen(!open)}
          type="button"
        >
          <span></span><span></span><span></span>
        </button>
        <div className={`nav-links${open ? " open" : ""}`} id="siteNav">
          <Link href="/" onClick={() => setOpen(false)}>Home</Link>
          <Link href="/services" onClick={() => setOpen(false)}>Services</Link>
          <Link href="/pricing" onClick={() => setOpen(false)}>Pricing</Link>
          <Link href="/faq" onClick={() => setOpen(false)}>FAQ</Link>
          <Link href="/contact" onClick={() => setOpen(false)}>Contact</Link>
          <Link href="/signup" className="btn btn-secondary btn-small" onClick={() => setOpen(false)}>Dashboard</Link>
        </div>
      </nav>
    </header>
  );
}
