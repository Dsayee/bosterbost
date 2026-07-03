"use client";

const request = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: "include",
    cache: options.cache || "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const rawBody = await response.text().catch(() => "");
  let data = {};
  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || rawBody || "Something went wrong.");
  }

  return data;
};

export const register = (payload) =>
  request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const login = (payload) =>
  request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const verifyEmail = (payload) =>
  request("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const forgotPassword = (payload) =>
  request("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const resetPassword = (payload) =>
  request("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const logout = () =>
  request("/api/auth/logout", {
    method: "POST",
    body: JSON.stringify({}),
  });

export const getMe = () => request("/api/auth/me");
export const getMyOrders = () => request("/api/orders");
export const getWallet = () => request("/api/wallet");
export const getSupportTickets = () => request("/api/support");

export const addFunds = (payload) =>
  request("/api/wallet", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const initiatePawaPayDeposit = (payload) =>
  request("/api/payments/pawapay/deposits", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const initiatePawaPayPaymentPage = (payload) =>
  request("/api/payments/pawapay/payment-page", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const checkPawaPayDeposit = (depositId) => request(`/api/payments/pawapay/deposits/${depositId}`);

export const submitOrder = (payload) =>
  request("/api/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const createSupportTicket = (payload) =>
  request("/api/support", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const replySupportTicket = (ticketId, payload) =>
  request(`/api/support/${ticketId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getAdminData = () => request("/api/admin");

export const getBackendStatus = () => request("/api/backend/status");

export const updateAdminOrderStatus = (orderId, status) =>
  request(`/api/admin/orders/${orderId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });

export const updateAdminUser = (userId, payload) =>
  request(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const updateAdminSupportStatus = (ticketId, status) =>
  request(`/api/admin/support/${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });

export const replyAdminSupportTicket = (ticketId, payload) =>
  request(`/api/admin/support/${ticketId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
