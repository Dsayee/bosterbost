import Link from "next/link";
import PublicHeader from "../../components/PublicHeader";

export default function ApiInfoPage() {
  return (
    <>
      <PublicHeader />
      <main className="section">
        <div className="container">
          <span className="eyebrow">API</span>
          <h1>Developer API and reseller workflows</h1>
          <p className="hero-text">Boster Bost is structured for reseller automation, white-label workflows, wallet funding, and order tracking.</p>
          <Link className="btn btn-primary" href="/contact">
            Contact Us
          </Link>
        </div>
      </main>
    </>
  );
}
