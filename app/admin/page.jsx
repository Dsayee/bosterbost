"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import DashboardShell from "../../components/DashboardShell";
import {
  getAdminData,
  getBackendStatus,
  replyAdminSupportTicket,
  updateAdminOrderStatus,
  updateAdminSupportStatus,
  updateAdminUser,
} from "../../lib/api";

const statusOptions = ["Pending Review", "Processing", "Completed", "Rejected"];
const supportStatusOptions = ["Open", "Customer Reply", "Answered", "Closed"];
const roleOptions = ["Influencer", "Brand", "Reseller", "Agency"];
const accessLevelOptions = ["support", "orders", "finance", "manager", "owner"];
const accessLevelLabels = {
  support: "Support",
  orders: "Orders",
  finance: "Finance",
  manager: "Manager",
  owner: "Super Admin",
};
const adminSections = [
  { id: "overview", label: "Overview" },
  { id: "orders", label: "Orders" },
  { id: "support", label: "Support Tickets" },
  { id: "finance", label: "Finance Reports" },
  { id: "users", label: "Users & Access" },
];
const emptyStats = {
  totalUsers: 0,
  orderRequests: 0,
  pendingReview: 0,
  openSupport: 0,
  walletRecords: 0,
};
const strongestStats = (apiStats = {}, fallbackStats = {}) => {
  const nextStats = { ...emptyStats };
  Object.keys(nextStats).forEach((key) => {
    const apiValue = Number(apiStats?.[key]);
    const fallbackValue = Number(fallbackStats?.[key]);
    nextStats[key] = Math.max(
      Number.isFinite(apiValue) ? apiValue : 0,
      Number.isFinite(fallbackValue) ? fallbackValue : 0
    );
  });
  return nextStats;
};
const rwfMoney = (value) => `${Number(value).toFixed(4)} RWF`;
const formatDate = (isoDate) => {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
};

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [stats, setStats] = useState(emptyStats);
  const [isStatsLoaded, setIsStatsLoaded] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [selectedSupportTicketId, setSelectedSupportTicketId] = useState("");
  const [isTicketViewerOpen, setIsTicketViewerOpen] = useState(false);
  const [supportReply, setSupportReply] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [backendMode, setBackendMode] = useState("checking");
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState("overview");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("All");
  const [supportOrderSearch, setSupportOrderSearch] = useState("");
  const [supportStatusFilter, setSupportStatusFilter] = useState("All");
  const [supportCustomerSearch, setSupportCustomerSearch] = useState("");
  const [supportDateFilter, setSupportDateFilter] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [financePeriod, setFinancePeriod] = useState("month");
  const [financeYear, setFinanceYear] = useState(String(new Date().getFullYear()));
  const [financeMonth, setFinanceMonth] = useState(String(new Date().getMonth() + 1));
  const [financeQuarter, setFinanceQuarter] = useState("1");
  const [confirmation, setConfirmation] = useState(null);
  const [notification, setNotification] = useState("");
  const supportSignatureRef = useRef("");
  const ticketViewerRef = useRef(null);

  const refresh = async () => {
    try {
      const data = await getAdminData();
      const nextUsers = data.users || [];
      const nextOrders = data.orders || [];
      const nextTickets = data.supportTickets || [];
      const nextWalletTransactions = data.walletTransactions || [];
      const fallbackStats = {
        totalUsers: nextUsers.length,
        orderRequests: nextOrders.length,
        pendingReview: nextOrders.filter((order) => order.status === "Pending Review").length,
        openSupport: nextTickets.filter((ticket) => ticket.status !== "Closed").length,
        walletRecords: nextWalletTransactions.length,
      };
      const nextSignature = nextTickets.map((ticket) => `${ticket.id}:${ticket.status}:${ticket.updatedAt}:${ticket.messages?.length || 0}`).join("|");
      if (supportSignatureRef.current && supportSignatureRef.current !== nextSignature) {
        setNotification("Support notification: a ticket was created, updated, closed, reopened, or received a new message.");
      }
      supportSignatureRef.current = nextSignature;
      setUsers(nextUsers);
      setOrders(nextOrders);
      setSupportTickets(nextTickets);
      setWalletTransactions(nextWalletTransactions);
      setStats(strongestStats(data.stats, fallbackStats));
      setIsStatsLoaded(true);
      setCurrentAdmin(data.currentAdmin || null);
      setPermissions(data.permissions || {});
      setSelectedSupportTicketId((currentId) => {
        if (currentId && nextTickets.some((ticket) => ticket.id === currentId)) {
          return currentId;
        }
        return "";
      });
      setError("");
      getBackendStatus()
        .then((status) => setBackendMode(status.mode))
        .catch(() => setBackendMode("unknown"));
    } catch (requestError) {
      const status = await getBackendStatus().catch(() => ({ mode: "unknown" }));
      setBackendMode(status.mode);
      setError(requestError.message);
    }
  };

  useEffect(() => {
    refresh();
    const sync = setInterval(refresh, 10000);
    return () => clearInterval(sync);
  }, []);

  const requestSave = (message, onSave) => {
    setConfirmation({ message, onSave });
  };

  const runConfirmedSave = async () => {
    if (!confirmation) return;
    await confirmation.onSave();
    setConfirmation(null);
    setError("Success.");
  };

  const setStatus = async (orderId, status) => {
    requestSave("Save this order status change?", async () => {
      await updateAdminOrderStatus(orderId, status);
      await refresh();
    });
  };

  const manageUser = async (userId, payload) => {
    requestSave("Save this user access change?", async () => {
      try {
        await updateAdminUser(userId, payload);
        await refresh();
        setError("Done.");
      } catch (managementError) {
        setError(managementError.message);
      }
    });
  };

  const userAccessLevels = (user) => {
    if (user.accessLevels?.length) return user.accessLevels;
    return user.accessLevel && user.accessLevel !== "customer" ? [user.accessLevel] : [];
  };

  const toggleUserAccess = (user, level, checked) => {
    const nextLevels = new Set(userAccessLevels(user));
    if (checked) {
      nextLevels.add(level);
    } else {
      nextLevels.delete(level);
    }
    manageUser(user.id, {
      role: user.role,
      isAdmin: user.isAdmin,
      accessLevels: [...nextLevels],
    });
  };

  const safeCount = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const pendingCount = safeCount(stats.pendingReview);
  const openSupportCount = safeCount(stats.openSupport);
  const totalUsersCount = safeCount(stats.totalUsers);
  const orderRequestsCount = safeCount(stats.orderRequests);
  const walletRecordsCount = safeCount(stats.walletRecords);
  const statValue = (value) => (isStatsLoaded ? safeCount(value).toLocaleString() : "Loading");
  const canManageUsers = Boolean(permissions.canManageUsers);
  const selectedSupportTicket = useMemo(() => {
    return supportTickets.find((ticket) => ticket.id === selectedSupportTicketId) || null;
  }, [supportTickets, selectedSupportTicketId]);

  const viewSupportTicket = (ticketId) => {
    setSelectedSupportTicketId(ticketId);
    setIsTicketViewerOpen(true);
    setSupportMessage("");
    setTimeout(() => ticketViewerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const setSupportStatus = async (ticketId, status) => {
    requestSave("Save this ticket status change?", async () => {
      await updateAdminSupportStatus(ticketId, status);
      await refresh();
      setNotification(status === "Closed" ? `Ticket Closed: ${ticketId}.` : `Ticket status updated to ${status}: ${ticketId}.`);
    });
  };

  const handleSupportReply = async (event) => {
    event.preventDefault();
    if (!selectedSupportTicket || !supportReply.trim()) return;

    try {
      await replyAdminSupportTicket(selectedSupportTicket.id, { message: supportReply.trim() });
      setSupportReply("");
      await refresh();
      setNotification(`New message sent on ${selectedSupportTicket.ticketId}.`);
      setSupportMessage(`Reply sent on ${selectedSupportTicket.ticketId}.`);
    } catch (supportError) {
      setSupportMessage(supportError.message);
    }
  };

  const actions = (
    <>
      <Link className="btn btn-secondary" href="/dashboard">
        Place Order
      </Link>
      <button className="btn btn-light" type="button" onClick={refresh}>
        Refresh
      </button>
    </>
  );

  const levels = currentAdmin?.accessLevels?.length ? currentAdmin.accessLevels : [currentAdmin?.accessLevel].filter(Boolean);
  const canSeeCustomerEmail = levels.includes("owner") || levels.includes("support");
  const displayEmail = (email) => (canSeeCustomerEmail ? email : "Restricted");
  const filteredOrders = orders.filter((order) => {
    const query = orderSearch.trim().toLowerCase();
    const matchesSearch =
      !query ||
      order.orderId?.toLowerCase().includes(query) ||
      order.service?.toLowerCase().includes(query) ||
      order.platform?.toLowerCase().includes(query);
    const matchesStatus = orderStatusFilter === "All" || order.status === orderStatusFilter;
    return matchesSearch && matchesStatus;
  });
  const filteredSupportTickets = supportTickets.filter((ticket) => {
    const orderQuery = supportOrderSearch.trim().toLowerCase();
    const customerQuery = supportCustomerSearch.trim().toLowerCase();
    const matchesOrder =
      !orderQuery || ticket.orderId?.toLowerCase().includes(orderQuery) || ticket.ticketId?.toLowerCase().includes(orderQuery);
    const matchesCustomer =
      !customerQuery || ticket.customerName?.toLowerCase().includes(customerQuery) || ticket.customerEmail?.toLowerCase().includes(customerQuery);
    const matchesDate = !supportDateFilter || String(ticket.createdAt || "").slice(0, 10) === supportDateFilter;
    const matchesStatus =
      supportStatusFilter === "All" ||
      (supportStatusFilter === "Open Tickets" && ticket.status !== "Closed") ||
      (supportStatusFilter === "Closed Tickets" && ticket.status === "Closed") ||
      ticket.status === supportStatusFilter;
    return matchesOrder && matchesCustomer && matchesDate && matchesStatus;
  });
  const filteredUsers = users.filter((user) => {
    const query = userSearch.trim().toLowerCase();
    return (
      !query ||
      user.name?.toLowerCase().includes(query) ||
      user.email?.toLowerCase().includes(query) ||
      user.role?.toLowerCase().includes(query) ||
      userAccessLevels(user).join(" ").includes(query)
    );
  });
  const filteredWalletTransactions = walletTransactions.filter((transaction) => {
    const date = new Date(transaction.createdAt);
    if (String(date.getFullYear()) !== financeYear) return false;
    if (financePeriod === "year") return true;
    if (financePeriod === "quarter") {
      return Math.floor(date.getMonth() / 3) + 1 === Number(financeQuarter);
    }
    return date.getMonth() + 1 === Number(financeMonth);
  });
  const incomeTotal = filteredWalletTransactions
    .filter((transaction) => Number(transaction.amountRwf) > 0)
    .reduce((total, transaction) => total + Number(transaction.amountRwf), 0);
  const expenseTotal = Math.abs(
    filteredWalletTransactions
      .filter((transaction) => Number(transaction.amountRwf) < 0)
      .reduce((total, transaction) => total + Number(transaction.amountRwf), 0)
  );
  const exportCsv = (filename, rows) => {
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardShell title="Orders & users" eyebrow="Admin panel" active="admin" actions={actions} showAdmin>
      <section className="dashboard-grid">
        <article className="metric-card">
          <span>Total users</span>
          <strong>{statValue(totalUsersCount)}</strong>
          <p>
            {currentAdmin
              ? `${(currentAdmin.accessLevels || [currentAdmin.accessLevel]).join(", ")} access${canManageUsers ? " with user management" : ""}`
              : "Admin access"}
          </p>
        </article>
        <article className="metric-card">
          <span>Order requests</span>
          <strong>{statValue(orderRequestsCount)}</strong>
          <p>Visible across all customers.</p>
        </article>
      </section>

      {notification ? (
        <section className="notification-banner">
          <span>{notification}</span>
          <button type="button" onClick={() => setNotification("")}>
            Dismiss
          </button>
        </section>
      ) : null}

      {error ? (
        <section className="panel-card">
          <span className="eyebrow">Admin access</span>
          <h2>{error}</h2>
          <p className="hero-text">This area is restricted to authorized staff accounts with the required access level.</p>
        </section>
      ) : null}

      <section className="dashboard-grid">
        <article className="metric-card">
          <span>Pending review</span>
          <strong>{statValue(pendingCount)}</strong>
          <p>Needs admin attention.</p>
        </article>
        <article className="metric-card">
          <span>Open support</span>
          <strong>{statValue(openSupportCount)}</strong>
          <p>Customer conversations waiting in admin.</p>
        </article>
        <article className="metric-card">
          <span>Wallet records</span>
          <strong>{statValue(walletRecordsCount)}</strong>
          <p>Recent deposits and order deductions.</p>
        </article>
      </section>

      <section className="panel-card">
        <div className="portal-menu" role="tablist" aria-label="Admin portal sections">
          {adminSections
            .filter((section) => {
              if (section.id === "orders") return permissions.canViewOrders;
              if (section.id === "support") return permissions.canViewSupport;
              if (section.id === "finance") return permissions.canViewFinance;
              if (section.id === "users") return permissions.canViewAll || permissions.canViewFinance;
              return true;
            })
            .map((section) => (
              <button
                key={section.id}
                className={activeSection === section.id ? "active" : ""}
                type="button"
                onClick={() => setActiveSection(section.id)}
              >
                {section.label}
              </button>
            ))}
        </div>
      </section>

      {permissions.canViewSupport && activeSection === "support" ? (
      <section className="workspace-grid">
        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Support inbox</span>
              <h2>Customer support requests</h2>
            </div>
          </div>
          <div className="filter-row">
            <label>
              Search by Order ID
              <input value={supportOrderSearch} onChange={(event) => setSupportOrderSearch(event.target.value)} placeholder="BB-..." />
            </label>
            <label>
              Ticket status
              <select value={supportStatusFilter} onChange={(event) => setSupportStatusFilter(event.target.value)}>
                <option value="All">All</option>
                <option value="Open Tickets">Open tickets</option>
                <option value="Closed Tickets">Closed tickets</option>
                {supportStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Customer
              <input value={supportCustomerSearch} onChange={(event) => setSupportCustomerSearch(event.target.value)} placeholder="Name or email" />
            </label>
            <label>
              Date
              <input value={supportDateFilter} onChange={(event) => setSupportDateFilter(event.target.value)} type="date" />
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticket ID</th>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Opened</th>
                  <th>View</th>
                </tr>
              </thead>
              <tbody>
                {filteredSupportTickets.length ? (
                  filteredSupportTickets.map((ticket) => (
                    <tr key={ticket.id}>
                      <td>
                        <strong>{ticket.ticketId}</strong>
                      </td>
                      <td>{ticket.orderId || "-"}</td>
                      <td>{`${ticket.customerName} (${displayEmail(ticket.customerEmail)})`}</td>
                      <td>{ticket.subject}</td>
                      <td>
                        <select className="status-select" value={ticket.status} onChange={(event) => setSupportStatus(ticket.id, event.target.value)}>
                          {supportStatusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                        {ticket.status === "Closed" ? <span className="status-pill danger">Ticket Closed</span> : null}
                      </td>
                      <td>{formatDate(ticket.createdAt)}</td>
                      <td>
                        <button className="btn btn-light" type="button" onClick={() => viewSupportTicket(ticket.id)}>
                          View Ticket
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7">No support requests yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className={`panel-card ticket-viewer-panel ${isTicketViewerOpen ? "open" : ""}`} ref={ticketViewerRef}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Admin reply</span>
              <h2>Ticket conversation</h2>
            </div>
            {selectedSupportTicket ? (
              <span className={`status-pill ${selectedSupportTicket.status === "Closed" ? "danger" : ""}`}>
                {selectedSupportTicket.status === "Closed" ? "Ticket Closed" : selectedSupportTicket.status}
              </span>
            ) : null}
          </div>
          {selectedSupportTicket ? (
            <>
              <div className="ticket-summary">
                <div>
                  <strong>{selectedSupportTicket.ticketId}</strong>
                  <span>{selectedSupportTicket.orderId ? `Order ${selectedSupportTicket.orderId}` : selectedSupportTicket.subject}</span>
                </div>
                <button className="inline-action" type="button" onClick={() => setIsTicketViewerOpen(false)}>
                  Close
                </button>
              </div>
              <div className="support-thread">
                {selectedSupportTicket.messages.map((item) => (
                  <div className={`support-message ${item.senderRole}`} key={item.id}>
                    <strong>{item.senderRole === "admin" ? "Admin" : selectedSupportTicket.customerName}</strong>
                    <p>{item.message}</p>
                    {item.attachmentData ? (
                      <a className="attachment-link" href={item.attachmentData} download={item.attachmentName || "support-attachment"}>
                        {item.attachmentName || "Download attachment"}
                      </a>
                    ) : null}
                    <small>{formatDate(item.createdAt)}</small>
                  </div>
                ))}
              </div>
              <form className="order-form" onSubmit={handleSupportReply}>
                <label className="full-field">
                  Reply to customer
                  <textarea
                    rows="4"
                    value={supportReply}
                    onChange={(event) => setSupportReply(event.target.value)}
                    placeholder="Write your response"
                    required
                  ></textarea>
                </label>
                <button className="btn btn-primary full-field" type="submit">
                  Send Admin Reply
                </button>
              </form>
              <p className="form-message">{supportMessage}</p>
            </>
          ) : (
            <p className="hero-text">Select a support request to respond.</p>
          )}
        </article>
      </section>
      ) : null}

      {permissions.canViewOrders && activeSection === "orders" ? (
      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Customer requests</span>
            <h2>All order requests</h2>
          </div>
        </div>
        <div className="filter-row">
          <label>
            Search reports
            <input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Order ID, platform, service" />
          </label>
          <label>
            Status
            <select value={orderStatusFilter} onChange={(event) => setOrderStatusFilter(event.target.value)}>
              <option value="All">All</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Platform</th>
                <th>Service</th>
                <th>Link</th>
                <th>Quantity</th>
                <th>Cost</th>
                <th>Status</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length ? (
                filteredOrders
                  .slice()
                  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                  .map((order) => {
                    return (
                      <tr key={order.id}>
                        <td>
                          <strong>{order.orderId}</strong>
                        </td>
                        <td>
                          <strong>{`${order.customerName} (${displayEmail(order.customerEmail)})`}</strong>
                        </td>
                        <td>{order.platform}</td>
                        <td>
                          {order.service} - {order.packageType}
                        </td>
                        <td className="link-cell">
                          <a href={order.targetLink} target="_blank" rel="noreferrer">
                            {order.targetLink}
                          </a>
                        </td>
                        <td>{Number(order.quantity).toLocaleString()}</td>
                        <td>{rwfMoney(order.cost)}</td>
                        <td>
                          <select className="status-select" value={order.status} onChange={(event) => setStatus(order.id, event.target.value)}>
                            {statusOptions.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>{formatDate(order.createdAt)}</td>
                      </tr>
                    );
                  })
              ) : (
                <tr>
                  <td colSpan="9">No order requests yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {permissions.canViewFinance && activeSection === "finance" ? (
      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Wallet ledger</span>
            <h2>Funding and spending records</h2>
          </div>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() =>
              exportCsv("boster-bost-finance-report.csv", [
                ["Customer", "Email", "Type", "Amount RWF", "Original Amount", "Original Currency", "Description", "Date"],
                ...filteredWalletTransactions.map((transaction) => [
                  transaction.customerName,
                  displayEmail(transaction.customerEmail),
                  transaction.type,
                  transaction.amountRwf,
                  transaction.originalAmount,
                  transaction.originalCurrency,
                  transaction.description,
                  transaction.createdAt,
                ]),
              ])
            }
          >
            Download Report
          </button>
        </div>
        <div className="filter-row">
          <label>
            Period
            <select value={financePeriod} onChange={(event) => setFinancePeriod(event.target.value)}>
              <option value="month">Month</option>
              <option value="quarter">Quarter</option>
              <option value="year">Year</option>
            </select>
          </label>
          <label>
            Year
            <input value={financeYear} onChange={(event) => setFinanceYear(event.target.value)} />
          </label>
          {financePeriod === "month" ? (
            <label>
              Month
              <select value={financeMonth} onChange={(event) => setFinanceMonth(event.target.value)}>
                {Array.from({ length: 12 }, (_, index) => (
                  <option key={index + 1} value={String(index + 1)}>
                    {index + 1}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {financePeriod === "quarter" ? (
            <label>
              Quarter
              <select value={financeQuarter} onChange={(event) => setFinanceQuarter(event.target.value)}>
                <option value="1">Q1</option>
                <option value="2">Q2</option>
                <option value="3">Q3</option>
                <option value="4">Q4</option>
              </select>
            </label>
          ) : null}
        </div>
        <section className="dashboard-grid compact-metrics">
          <article className="metric-card">
            <span>Income Report</span>
            <strong>{rwfMoney(incomeTotal)}</strong>
          </article>
          <article className="metric-card">
            <span>Expense Report</span>
            <strong>{rwfMoney(expenseTotal)}</strong>
          </article>
        </section>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Original</th>
                <th>Description</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredWalletTransactions.length ? (
                filteredWalletTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{`${transaction.customerName} (${displayEmail(transaction.customerEmail)})`}</td>
                    <td>
                      <span className="order-status">{transaction.type}</span>
                    </td>
                    <td>{rwfMoney(transaction.amountRwf)}</td>
                    <td>
                      {transaction.originalAmount} {transaction.originalCurrency}
                    </td>
                    <td>{transaction.description}</td>
                    <td>{formatDate(transaction.createdAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6">No wallet records yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {(permissions.canViewAll || permissions.canViewFinance) && activeSection === "users" ? (
      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Registered users</span>
            <h2>Customer accounts</h2>
          </div>
        </div>
        <div className="filter-row">
          <label>
            Search users
            <input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Name, email, role, access" />
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Type</th>
                <th>Wallet</th>
                <th>Joined</th>
                <th>Orders</th>
                <th>Verified</th>
                <th>Admin</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length ? (
                filteredUsers
                  .slice()
                  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                  .map((user) => (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.name}</strong>
                      </td>
                      <td>{displayEmail(user.email)}</td>
                      <td>
                        <select
                          className="status-select"
                          value={user.role}
                          disabled={!canManageUsers}
                          onChange={(event) =>
                            manageUser(user.id, { role: event.target.value, isAdmin: user.isAdmin, accessLevels: userAccessLevels(user) })
                          }
                        >
                          {roleOptions.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{rwfMoney(user.walletRwf || 0)}</td>
                      <td>{formatDate(user.createdAt)}</td>
                      <td>{user.orderCount}</td>
                      <td>{user.emailVerified ? "Yes" : "No"}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={user.isAdmin}
                          disabled={!canManageUsers}
                          onChange={(event) =>
                            manageUser(user.id, {
                              role: user.role,
                              isAdmin: event.target.checked,
                              accessLevels: event.target.checked ? userAccessLevels(user).length ? userAccessLevels(user) : ["manager"] : [],
                            })
                          }
                          aria-label={`Set ${user.name} admin access`}
                        />
                      </td>
                      <td>
                        <div className="access-checklist">
                          {accessLevelOptions.map((level) => (
                            <label key={level}>
                              <input
                                type="checkbox"
                                checked={userAccessLevels(user).includes(level)}
                                disabled={!user.isAdmin || !canManageUsers}
                                onChange={(event) => toggleUserAccess(user, level, event.target.checked)}
                              />
                              {accessLevelLabels[level]}
                            </label>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
              ) : (
                <tr>
                  <td colSpan="9">No users registered yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}
      {confirmation ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="confirm-modal">
            <h2>Confirm change</h2>
            <p>{confirmation.message}</p>
            <div className="hero-actions">
              <button className="btn btn-primary" type="button" onClick={runConfirmedSave}>
                Save
              </button>
              <button className="btn btn-light" type="button" onClick={() => setConfirmation(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
