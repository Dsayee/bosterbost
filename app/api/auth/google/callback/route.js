import { findOrCreateOAuthUser, createSession } from "../../../../../lib/server/db";
import { setSessionCookie } from "../../../../../lib/server/http";
import { NextResponse } from "next/server";

const appBaseUrl = (request) => (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "");

const redirectWithError = (baseUrl, message) => NextResponse.redirect(`${baseUrl}/signup?auth=${encodeURIComponent(message)}`);

export async function GET(request) {
  const baseUrl = appBaseUrl(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = request.cookies.get("bb_google_oauth_state")?.value;

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return redirectWithError(baseUrl, "google-not-configured");
  }

  if (!code || !state || !storedState || state !== storedState) {
    return redirectWithError(baseUrl, "google-state-invalid");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${baseUrl}/api/auth/google/callback`,
    }),
  });

  if (!tokenResponse.ok) {
    return redirectWithError(baseUrl, "google-token-failed");
  }

  const tokenData = await tokenResponse.json();
  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!profileResponse.ok) {
    return redirectWithError(baseUrl, "google-profile-failed");
  }

  const profile = await profileResponse.json();

  if (!profile.email || profile.email_verified === false) {
    return redirectWithError(baseUrl, "google-email-unverified");
  }

  const user = await findOrCreateOAuthUser({
    provider: "Google",
    name: profile.name,
    email: profile.email,
  });

  if (!user) {
    return redirectWithError(baseUrl, "google-user-failed");
  }

  const session = await createSession(user.id);
  const response = NextResponse.redirect(`${baseUrl}/dashboard`);
  response.cookies.set("bb_google_oauth_state", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  setSessionCookie(response, session.sessionId, session.expiresAt);
  return response;
}
