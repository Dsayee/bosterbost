import Link from "next/link";
import PublicHeader from "../../components/PublicHeader";

export default function ContactPage() {
  return (
    <>
      <PublicHeader />
      <main>
        <section className="section muted">
          <div className="container">
            <span className="eyebrow">Contact</span>
            <h1>Get in touch</h1>
            <p className="hero-text">
              Existing customers can submit support tickets directly from the dashboard. New users can register and start immediately.
            </p>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="contact-grid">
              <article className="feature-card">
                <div className="feature-icon-lg">🎧</div>
                <h3>Customer Support</h3>
                <p>Already have an account? Submit and track support tickets from your dashboard. Admin replies directly in the same thread.</p>
                <Link className="btn btn-secondary" href="/dashboard">Open Dashboard</Link>
              </article>
              <article className="feature-card">
                <div className="feature-icon-lg">🚀</div>
                <h3>New Customers</h3>
                <p>Create your free account, confirm your email, fund your wallet, and place your first order in under 5 minutes.</p>
                <Link className="btn btn-primary" href="/signup">Create Account</Link>
              </article>
              <article className="feature-card">
                <div className="feature-icon-lg">🤝</div>
                <h3>Resellers & Agencies</h3>
                <p>Interested in bulk pricing, white-label workflows, or API access? Register and reach out via the support system.</p>
                <Link className="btn btn-secondary" href="/api-info">API Info</Link>
              </article>
              <article className="feature-card">
                <div className="feature-icon-lg">@</div>
                <h3>Email Contact</h3>
                <p>For business, account, and partnership questions, contact the Boster Bost team by email.</p>
                <a className="btn btn-secondary" href="mailto:info@bosterbost.com">info@bosterbost.com</a>
              </article>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <Link className="brand" href="/">
              <span className="brand-mark">BB</span>
              <span><strong>Boster Bost</strong><small>Where Growth Begins</small></span>
            </Link>
            <p>The world's most reliable SMM panel.</p>
          </div>
          <div className="footer-cols">
            <div>
              <strong>Platform</strong>
              <Link href="/services">Services</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/api-info">API</Link>
            </div>
            <div>
              <strong>Account</strong>
              <Link href="/signup">Register</Link>
              <Link href="/dashboard">Dashboard</Link>
            </div>
            <div>
              <strong>Company</strong>
              <Link href="/faq">FAQ</Link>
              <Link href="/contact">Contact</Link>
              <a href="mailto:info@bosterbost.com">info@bosterbost.com</a>
            </div>
          </div>
        </div>
        <div className="container footer-bottom">
          <p>© {new Date().getFullYear()} Boster Bost. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
}
