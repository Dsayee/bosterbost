import PublicHeader from "../../components/PublicHeader";

const faqs = [
  ["Do users need email confirmation?", "Yes. New users must confirm their email before logging in and using the dashboard."],
  ["Can customers see their order IDs?", "Yes. Each order has a visible order ID in the customer and admin dashboards."],
  ["Can admin reply to support?", "Yes. Customer support tickets appear in the admin portal with two-way replies."],
];

export default function FaqPage() {
  return (
    <>
      <PublicHeader />
      <main className="section muted">
        <div className="container">
          <span className="eyebrow">FAQ</span>
          <h1>Common questions</h1>
          <div className="feature-grid">
            {faqs.map(([question, answer]) => (
              <article className="feature-card" key={question}>
                <h3>{question}</h3>
                <p>{answer}</p>
              </article>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
