"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { resetPassword } from "../../lib/api";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password"));
    const confirmPassword = String(formData.get("confirmPassword"));

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      setIsError(true);
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      setIsError(true);
      return;
    }

    try {
      await resetPassword({ token, password });
      setMessage("Password updated. You can now log in.");
      setIsError(false);
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error.message);
      setIsError(true);
    }
  };

  return (
    <section className="auth-panel verify-panel">
      <span className="eyebrow">Password reset</span>
      <h1>Set new password</h1>
      <form className="auth-form active" onSubmit={handleSubmit}>
        <label>
          New password
          <input type="password" name="password" autoComplete="new-password" minLength="6" required />
        </label>
        <label>
          Confirm password
          <input type="password" name="confirmPassword" autoComplete="new-password" minLength="6" required />
        </label>
        <button className="btn btn-primary" type="submit" disabled={!token}>
          Update Password
        </button>
      </form>
      <p className={`auth-message ${isError ? "error" : ""}`}>{token ? message : "Reset token is missing."}</p>
      <Link className="btn btn-light" href="/signup">
        Back to Login
      </Link>
    </section>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="auth-page">
      <Suspense fallback={<section className="auth-panel verify-panel">Loading reset form...</section>}>
        <ResetPasswordContent />
      </Suspense>
    </main>
  );
}
