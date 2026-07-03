"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { forgotPassword, login, register } from "../lib/api";

export default function AuthPanel() {
  const router = useRouter();
  const [mode, setMode] = useState("register");
  const [message, setMessage] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth");
    if (!authError) return;
    const messages = {
      "google-not-configured": "Google sign-in is ready in the app, but the Google Client ID and Client Secret still need to be added.",
      "google-state-invalid": "Google sign-in expired. Please try again.",
      "google-token-failed": "Google could not complete sign-in. Please try again.",
      "google-profile-failed": "Google profile could not be loaded. Please try again.",
      "google-email-unverified": "Google did not return a verified email address.",
      "google-user-failed": "Google sign-in could not create your account.",
    };
    setMessage(messages[authError] || "Google sign-in could not be completed.");
    setIsError(true);
    setMode("login");
  }, []);

  const handleRegister = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get("name")),
      email: String(formData.get("email")),
      role: "Influencer",
      password: String(formData.get("password")),
    };

    if (!payload.name.trim() || !payload.email.trim() || payload.password.length < 6) {
      setMessage("Please enter your name, email, and a password with at least 6 characters.");
      setIsError(true);
      return;
    }

    try {
      const result = await register(payload);
      setVerificationUrl(result.verificationUrl || "");
      setResetUrl("");
      setMessage(result.emailMessage || "Account created. Confirm your email address before logging in.");
      setIsError(false);
      setMode("login");
    } catch (error) {
      setMessage(error.message);
      setIsError(true);
      setMode("login");
    }
  };

  const handleForgotPassword = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    try {
      const result = await forgotPassword({
        email: String(formData.get("email")),
      });
      setVerificationUrl("");
      setResetUrl(result.resetUrl || "");
      setMessage(result.message || "If that email exists, a reset link will be sent.");
      setIsError(false);
      setMode("login");
    } catch (error) {
      setMessage(error.message);
      setIsError(true);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    try {
      await login({
        email: String(formData.get("email")),
        password: String(formData.get("password")),
      });
      router.push("/dashboard");
    } catch (error) {
      setMessage(error.message);
      setIsError(true);
    }
  };

  return (
    <div className="auth-panel">
      <div className="auth-tabs">
        <button className={`auth-tab ${mode === "register" ? "active" : ""}`} type="button" onClick={() => setMode("register")}>
          Register
        </button>
        <button className={`auth-tab ${mode === "login" ? "active" : ""}`} type="button" onClick={() => setMode("login")}>
          Log In
        </button>
      </div>

      <a className="btn btn-light google-auth-button" href="/api/auth/google/start">
        Continue with Google
      </a>

      {mode === "register" ? (
        <form className="auth-form active" onSubmit={handleRegister}>
          <label>
            Full name
            <input type="text" name="name" autoComplete="name" placeholder="Your name" required />
          </label>
          <label>
            Email address
            <input type="email" name="email" autoComplete="email" placeholder="you@example.com" required />
          </label>
          <label>
            Password
            <input type="password" name="password" autoComplete="new-password" minLength="6" placeholder="Minimum 6 characters" required />
          </label>
          <button className="btn btn-primary" type="submit">
            Create Account
          </button>
        </form>
      ) : mode === "forgot" ? (
        <form className="auth-form active" onSubmit={handleForgotPassword}>
          <label>
            Email address
            <input type="email" name="email" autoComplete="email" placeholder="you@example.com" required />
          </label>
          <button className="btn btn-primary" type="submit">
            Send Reset Link
          </button>
          <button className="btn btn-light" type="button" onClick={() => setMode("login")}>
            Back to Login
          </button>
        </form>
      ) : (
        <form className="auth-form active" onSubmit={handleLogin}>
          <label>
            Email address
            <input type="email" name="email" autoComplete="email" placeholder="you@example.com" required />
          </label>
          <label>
            Password
            <input type="password" name="password" autoComplete="current-password" placeholder="Your password" required />
          </label>
          <button className="btn btn-secondary" type="submit">
            Log In
          </button>
          <button className="auth-link-button" type="button" onClick={() => setMode("forgot")}>
            Forgot password?
          </button>
        </form>
      )}

      <p className={`auth-message ${isError ? "error" : ""}`} role="status" aria-live="polite">
        {message}
      </p>
      {verificationUrl ? (
        <p className="auth-note">
          Local confirmation link: <Link href={verificationUrl.replace("http://127.0.0.1:3000", "")}>Confirm Email</Link>
        </p>
      ) : null}
      {resetUrl ? (
        <p className="auth-note">
          Local reset link: <Link href={resetUrl.replace("http://127.0.0.1:3000", "")}>Reset Password</Link>
        </p>
      ) : null}
    </div>
  );
}
