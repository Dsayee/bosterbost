"use client";

const USERS_KEY = "bosterBostUsers";
const SESSION_KEY = "bosterBostCurrentUser";
const ORDERS_KEY = "bosterBostOrders";

const readJson = (key, fallback) => {
  if (typeof window === "undefined") return fallback;

  try {
    return JSON.parse(window.localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  window.localStorage.setItem(key, JSON.stringify(value));
};

const createId = (prefix) => {
  return window.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.round(Math.random() * 100000)}`;
};

const fallbackHash = (value) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return `fallback-${Math.abs(hash)}`;
};

export const hashPassword = async (email, password) => {
  const value = `${email.toLowerCase().trim()}:${password}`;

  if (!window.crypto?.subtle) return fallbackHash(value);

  const bytes = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const getUsers = () => readJson(USERS_KEY, []);
export const saveUsers = (users) => writeJson(USERS_KEY, users);
export const getOrders = () => readJson(ORDERS_KEY, []);
export const saveOrders = (orders) => writeJson(ORDERS_KEY, orders);
export const getCurrentUserId = () => window.localStorage.getItem(SESSION_KEY);

export const setCurrentUserId = (userId) => {
  if (userId) {
    window.localStorage.setItem(SESSION_KEY, userId);
  } else {
    window.localStorage.removeItem(SESSION_KEY);
  }
};

export const getCurrentUser = () => {
  return getUsers().find((user) => user.id === getCurrentUserId()) || null;
};

export const registerUser = async ({ name, email, role, password }) => {
  const cleanEmail = email.trim().toLowerCase();
  const users = getUsers();

  if (users.some((user) => user.email === cleanEmail)) {
    throw new Error("That email is already registered. Log in instead.");
  }

  const user = {
    id: createId("user"),
    name: name.trim(),
    email: cleanEmail,
    role,
    passwordHash: await hashPassword(cleanEmail, password),
    createdAt: new Date().toISOString(),
    wallet: 0,
  };

  users.push(user);
  saveUsers(users);
  setCurrentUserId(user.id);
  return user;
};

export const loginUser = async ({ email, password }) => {
  const cleanEmail = email.trim().toLowerCase();
  const user = getUsers().find((entry) => entry.email === cleanEmail);
  const passwordHash = await hashPassword(cleanEmail, password);

  if (!user || user.passwordHash !== passwordHash) {
    throw new Error("We could not find that email and password combination.");
  }

  setCurrentUserId(user.id);
  return user;
};

export const logoutUser = () => {
  setCurrentUserId("");
};

export const createOrder = (order) => {
  const orders = getOrders();
  const newOrder = {
    id: createId("order"),
    status: "Pending Review",
    createdAt: new Date().toISOString(),
    ...order,
  };

  orders.push(newOrder);
  saveOrders(orders);
  return newOrder;
};

export const updateOrderStatus = (orderId, status) => {
  const orders = getOrders().map((order) => {
    if (order.id !== orderId) return order;
    return { ...order, status, updatedAt: new Date().toISOString() };
  });

  saveOrders(orders);
  return orders.find((order) => order.id === orderId);
};

export const formatDate = (isoDate) => {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
};
