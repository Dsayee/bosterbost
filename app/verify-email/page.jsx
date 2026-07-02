"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { verifyEmail } from "../../lib/api";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState("Checking your verification link...");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("Verification token is missing.");
      setIsError(true);
      return;
    }

    verifyEmail({ token })
      .then(() => {
        setStatus("Email confirmed. You can now log in to your dashboard.");
        setIsError(false);
      })
      .catch((error) => {
        setStatus(error.message);
        setIsError(true);
      });
  }, [token]);

  return (
    <section className="auth-panel verify-panel">
      <span className="eyebrow">Email confirmation</span>
      <h1>Confirm email</h1>
      <p className={`auth-message ${isError ? "error" : ""}`}>{status}</p>
      <Link className="btn btn-primary" href="/signup">
        Continue to Login
      </Link>
    </section>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="auth-page">
      <Suspense fallback={<section className="auth-panel verify-panel">Checking your verification link...</section>}>
        <VerifyEmailContent />
      </Suspense>
    </main>
  );
}
