import AuthPanel from "../../components/AuthPanel";
import PublicHeader from "../../components/PublicHeader";

export default function SignupPage() {
  return (
    <>
      <PublicHeader />
      <main>
        <section className="section account-section">
          <div className="container account-layout">
            <div>
              <span className="eyebrow">Account access</span>
              <h1>Create your account</h1>
              <p className="hero-text">Confirm your email address, then log in to manage wallet funds, orders, and support.</p>
            </div>
            <AuthPanel />
          </div>
        </section>
      </main>
    </>
  );
}
