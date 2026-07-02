import Link from "next/link";
import PublicHeader from "../components/PublicHeader";

const features = [
  { icon: "⚡", title: "Instant Delivery", desc: "Orders start processing immediately after submission. No delays, no waiting." },
  { icon: "🔒", title: "Secure Wallet", desc: "Fund your wallet in 60+ currencies. Balances are stored securely and deducted per order." },
  { icon: "📊", title: "Live Order Tracking", desc: "Every order has a unique ID. Track status from Pending to Completed in real time." },
  { icon: "🔄", title: "Refill Support", desc: "Select non-drop services with lifetime refill guarantees on eligible campaigns." },
  { icon: "🌍", title: "All Major Platforms", desc: "Instagram, TikTok, YouTube, Facebook, Twitter/X, Telegram, Spotify, and more." },
  { icon: "🎧", title: "Customer Support", desc: "Submit support tickets directly from your dashboard. Admin replies in the same thread." },
];

const steps = [
  { n: "01", title: "Create Account", desc: "Register with your email and confirm your address to activate your account." },
  { n: "02", title: "Add Funds", desc: "Top up your wallet in your preferred currency. 60+ currencies supported." },
  { n: "03", title: "Place Order", desc: "Choose a platform, pick a service, set quantity, and paste your target link." },
  { n: "04", title: "Track Progress", desc: "Monitor order status live from your dashboard and contact support if needed." },
];

const platforms = ["Instagram", "TikTok", "YouTube", "Facebook", "Twitter/X", "Telegram", "Spotify", "Discord", "Twitch", "LinkedIn"];

export default function HomePage() {
  return (
    <>
      <PublicHeader />
      <main>

        {/* Hero */}
        <section className="hero section-band">
          <div className="container">
            <div className="hero-inner">
              <div className="hero-copy">
                <span className="eyebrow">Trusted by 92,000+ creators, brands & resellers worldwide</span>
                <h1>The World's Most Reliable SMM Panel</h1>
                <p className="hero-tagline">Grow any social media account with instant delivery, wallet funding, live tracking, and direct support — all from one dashboard.</p>
                <div className="hero-actions">
                  <Link className="btn btn-primary" href="/signup">Get Started Free</Link>
                  <Link className="btn btn-secondary" href="/services">Browse Services</Link>
                  <Link className="btn btn-light" href="/signup">Log In</Link>
                </div>
                <dl className="trust-strip">
                  <div><dt>3,818,817+</dt><dd>Orders Processed</dd></div>
                  <div><dt>92,008+</dt><dd>Active Users</dd></div>
                  <div><dt>0.14s</dt><dd>Avg Processing</dd></div>
                  <div><dt>60+</dt><dd>Currencies</dd></div>
                </dl>
              </div>
              <div className="hero-badge-stack">
                <div className="hero-badge">
                  <span className="eyebrow">Live order</span>
                  <strong>Instagram Followers</strong>
                  <p>1,000 delivered · 0.3s ago</p>
                  <span className="badge-status">✓ Completed</span>
                </div>
                <div className="hero-badge hero-badge-alt">
                  <span className="eyebrow">Wallet funded</span>
                  <strong>50 USD deposited</strong>
                  <p>Balance updated instantly</p>
                  <span className="badge-status">✓ Confirmed</span>
                </div>
                <div className="hero-badge hero-badge-sm">
                  <span className="eyebrow">Platform support</span>
                  <strong>10+ platforms</strong>
                  <p>Instagram · TikTok · YouTube</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Platforms bar */}
        <section className="platforms-bar">
          <div className="container">
            <span className="eyebrow">Supported platforms</span>
            <div className="platforms-list">
              {platforms.map((p) => <span key={p}>{p}</span>)}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="section" id="features">
          <div className="container">
            <div className="section-heading">
              <span className="eyebrow">Why Boster Bost</span>
              <h2>Everything you need in one panel</h2>
              <p className="hero-text">Built for influencers, agencies, brands, and resellers who need reliable growth at scale.</p>
            </div>
            <div className="feature-grid">
              {features.map((f) => (
                <article className="feature-card" key={f.title}>
                  <div className="feature-icon-lg">{f.icon}</div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Steps */}
        <section className="section muted" id="how-it-works">
          <div className="container">
            <div className="section-heading">
              <span className="eyebrow">How it works</span>
              <h2>Start growing in 4 steps</h2>
            </div>
            <div className="steps-grid">
              {steps.map((s) => (
                <article className="step-card" key={s.n}>
                  <span className="step-number">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="section" id="pricing">
          <div className="container">
            <div className="section-heading split-heading">
              <div>
                <span className="eyebrow">Pricing</span>
                <h2>Transparent pricing, no hidden fees</h2>
                <p className="hero-text">Prices are calculated per 1,000 actions and shown before every order is placed.</p>
              </div>
              <Link className="btn btn-primary" href="/pricing">Full Pricing Table</Link>
            </div>
            <div className="pricing-grid">
              <article className="price-card">
                <p className="price-label">Base services</p>
                <h3>From <span>$0.005</span><small>/1K</small></h3>
                <p>High-volume views, likes, and discovery campaigns at the lowest rates.</p>
                <Link className="btn btn-secondary" href="/signup">Get Started</Link>
              </article>
              <article className="price-card featured-price">
                <p className="price-label">Premium services</p>
                <h3>From <span>$0.55</span><small>/1K</small></h3>
                <p>Non-drop, high retention, refill-supported services for serious campaigns.</p>
                <Link className="btn btn-primary" href="/signup">Get Started</Link>
              </article>
              <article className="price-card">
                <p className="price-label">Multi-currency wallet</p>
                <h3>60+<small> currencies</small></h3>
                <p>Fund your wallet in RWF, USD, EUR, GBP, KES, NGN, and 55+ more.</p>
                <Link className="btn btn-secondary" href="/signup">Get Started</Link>
              </article>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="cta-band">
          <div className="container cta-inner">
            <div>
              <span className="eyebrow">Ready to grow?</span>
              <h2>Join 92,000+ users on Boster Bost</h2>
              <p>Create your free account, fund your wallet, and place your first order in minutes.</p>
            </div>
            <div className="hero-actions">
              <Link className="btn btn-primary" href="/signup">Create Free Account</Link>
              <Link className="btn btn-light" href="/services">View All Services</Link>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="site-footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <Link className="brand" href="/">
              <span className="brand-mark">BB</span>
              <span>
                <strong>Boster Bost</strong>
                <small>Where Growth Begins</small>
              </span>
            </Link>
            <p>The world's most reliable SMM panel for creators, brands, agencies, and resellers.</p>
          </div>
          <div className="footer-cols">
            <div>
              <strong>Platform</strong>
              <Link href="/services">Services</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/api-info">API</Link>
              <Link href="/blog">Blog</Link>
            </div>
            <div>
              <strong>Account</strong>
              <Link href="/signup">Register</Link>
              <Link href="/signup">Log In</Link>
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/contact">Support</Link>
            </div>
            <div>
              <strong>Company</strong>
              <Link href="/faq">FAQ</Link>
              <Link href="/contact">Contact</Link>
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
