import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserBySession } from "./db";

export const SESSION_COOKIE = "bb_session";

export const json = (body, status = 200) => NextResponse.json(body, { status });

export const getSessionId = async () => {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value || "";
};

export const getCurrentUserFromRequest = async () => {
  return getUserBySession(await getSessionId());
};

export const unauthorized = () => json({ error: "Please log in first." }, 401);

export const setSessionCookie = (response, sessionId, expiresAt) => {
  response.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
};

export const clearSessionCookie = (response) => {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
};
