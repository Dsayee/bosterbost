"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import DashboardShell from "../../components/DashboardShell";
import {
  checkPawaPayDeposit,
  createSupportTicket,
  getMe,
  getMyOrders,
  getSupportTickets,
  getWallet,
  initiatePawaPayPaymentPage,
  logout,
  replySupportTicket,
  submitOrder,
} from "../../lib/api";
import { CURRENCIES, MINIMUM_DEPOSIT_RWF, SERVICE_CATALOG, SERVICE_PLATFORMS, findService, formatMoney, fromRwf } from "../../lib/catalog";

const portalSections = [
  { id: "overview", label: "Overview" },
  { id: "wallet", label: "Add Funds" },
  { id: "orders", label: "Place Order" },
  { id: "support", label: "Support" },
];

const sectionPaths = {
  overview: "/dashboard",
  wallet: "/dashboard/wallet",
  orders: "/dashboard/orders",
  support: "/dashboard/support",
};

const currencyStorageKey = "boster-bost-currency";

const pawaPayCountries = [
  { code: "RWA", label: "Rwanda" },
  { code: "KEN", label: "Kenya" },
  { code: "UGA", label: "Uganda" },
  { code: "COD", label: "DR Congo" },
  { code: "ZMB", label: "Zambia" },
  { code: "SEN", label: "Senegal" },
  { code: "BEN", label: "Benin" },
  { code: "CIV", label: "Ivory Coast" },
  { code: "CMR", label: "Cameroon" },
  { code: "COG", label: "Congo" },
  { code: "GAB", label: "Gabon" },
  { code: "SLE", label: "Sierra Leone" },
];

const formatDate = (isoDate) => {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
};

const readAttachment = (file) =>
  new Promise((resolve, reject) => {
    if (!file || !file.size) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        name: file.name,
        type: file.type || "application/octet-stream",
        data: String(reader.result || ""),
      });
    reader.onerror = () => reject(new Error("Attachment could not be read."));
    reader.readAsDataURL(file);
  });

export function CustomerDashboard({ initialSection = "overview" }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [paymentDeposits, setPaymentDeposits] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currency, setCurrency] = useState("RWF");
  const [selectedPlatform, setSelectedPlatform] = useState(SERVICE_PLATFORMS[0]);
  const [selectedModule, setSelectedModule] = useState(SERVICE_CATALOG[0].module);
  const [serviceId, setServiceId] = useState(SERVICE_CATALOG[0].id);
  const [quantity, setQuantity] = useState(100);
  const [message, setMessage] = useState("");
  const [fundMessage, setFundMessage] = useState("");
  const [pendingDepositId, setPendingDepositId] = useState("");
  const [supportTickets, setSupportTickets] = useState([]);
  const [supportMessage, setSupportMessage] = useState("");
  const [supportReply, setSupportReply] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [supportOrderFilter, setSupportOrderFilter] = useState("");
  const [supportStatusFilter, setSupportStatusFilter] = useState("All");
  const [supportDateFilter, setSupportDateFilter] = useState("");
  const [activeSection, setActiveSection] = useState(initialSection);
  const [walletView, setWalletView] = useState("fund");
  const [ordersView, setOrdersView] = useState("new");
  const [supportView, setSupportView] = useState("new");
  const [notification, setNotification] = useState("");
  const [showWhatsappPrompt, setShowWhatsappPrompt] = useState(false);
  const supportSignatureRef = useRef("");

  const openSection = (section, view = "") => {
    setActiveSection(section);
    if (section === "wallet" && view) setWalletView(view);
    if (section === "orders" && view) setOrdersView(view);
    if (section === "support" && view) setSupportView(view);
    if (typeof window !== "undefined") {
      if (sectionPaths[section] && sectionPaths[section] !== window.location.pathname) {
        router.push(sectionPaths[section]);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const platformServices = useMemo(() => {
    return SERVICE_CATALOG.filter((service) => service.platform === selectedPlatform);
  }, [selectedPlatform]);

  const platformModules = useMemo(() => {
    return [...new Set(platformServices.map((service) => service.module))];
  }, [platformServices]);

  const services = useMemo(() => {
    return platformServices.filter((service) => service.module === selectedModule);
  }, [platformServices, selectedModule]);

  const selectedService = findService(serviceId) || services[0] || SERVICE_CATALOG[0];
  const selectedServiceMin = selectedService.min || 100;
  const selectedServiceMax = selectedService.max || 2147483647;
  const estimateRwf = (Number(quantity || 0) / 1000) * selectedService.priceRwf;
  const displayEstimate = formatMoney(fromRwf(estimateRwf, currency), currency);
  const displayWallet = formatMoney(fromRwf(user?.walletRwf || 0, currency), currency);
  const minimumDepositInCurrency = fromRwf(MINIMUM_DEPOSIT_RWF, currency);
  const minimumDepositLabel = formatMoney(minimumDepositInCurrency, currency);
  const filteredSupportTickets = useMemo(() => {
    const orderQuery = supportOrderFilter.trim().toLowerCase();
    return supportTickets.filter((ticket) => {
      const matchesOrder =
        !orderQuery || ticket.orderId?.toLowerCase().includes(orderQuery) || ticket.ticketId?.toLowerCase().includes(orderQuery);
      const matchesDate = !supportDateFilter || String(ticket.createdAt || "").slice(0, 10) === supportDateFilter;
      const matchesStatus =
        supportStatusFilter === "All" ||
        (supportStatusFilter === "Open Tickets" && ticket.status !== "Closed") ||
        (supportStatusFilter === "Closed Tickets" && ticket.status === "Closed") ||
        ticket.status === supportStatusFilter;
      return matchesOrder && matchesDate && matchesStatus;
    });
  }, [supportDateFilter, supportOrderFilter, supportStatusFilter, supportTickets]);
  const selectedTicket = filteredSupportTickets.find((ticket) => ticket.id === selectedTicketId) || filteredSupportTickets[0] || null;
  const orderStatusCounts = {
    total: orders.length,
    pending: orders.filter((order) => order.status === "Pending Review").length,
    completed: orders.filter((order) => order.status === "Completed").length,
    processing: orders.filter((order) => order.status === "Processing").length,
    cancelled: orders.filter((order) => ["Cancelled", "Canceled", "Rejected"].includes(order.status)).length,
  };
  const supportStatusCounts = {
    open: supportTickets.filter((ticket) => ticket.status !== "Closed").length,
    closed: supportTickets.filter((ticket) => ticket.status === "Closed").length,
  };
  const transactionAmount = (transaction) =>
    transaction.originalCurrency ? formatMoney(transaction.originalAmount, transaction.originalCurrency) : formatMoney(transaction.amountRwf, "RWF");

  const refresh = async () => {
    try {
      const [{ user: currentUser }, { orders: currentOrders }, wallet, support] = await Promise.all([
        getMe(),
        getMyOrders(),
        getWallet(),
        getSupportTickets(),
      ]);
      setUser({ ...currentUser, walletRwf: wallet.walletRwf });
      setOrders(currentOrders);
      setTransactions(wallet.transactions);
      setPaymentDeposits(wallet.deposits || []);
      const nextTickets = support.tickets || [];
      const nextSignature = nextTickets
        .map((ticket) => `${ticket.id}:${ticket.status}:${ticket.updatedAt}:${ticket.messages?.length || 0}`)
        .join("|");
      if (supportSignatureRef.current && supportSignatureRef.current !== nextSignature) {
        const latestAdminReply = nextTickets
          .flatMap((ticket) => (ticket.messages || []).map((item) => ({ ...item, ticketId: ticket.ticketId })))
          .filter((item) => item.senderRole === "admin")
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        setNotification(
          latestAdminReply
            ? `Admin replied to ${latestAdminReply.ticketId}. Open Support to view the message.`
            : "Support notification: a ticket was created, updated, closed, reopened, or received a new message."
        );
      }
      supportSignatureRef.current = nextSignature;
      setSupportTickets(nextTickets);
      setSelectedTicketId((currentId) => {
        if (currentId && nextTickets.some((ticket) => ticket.id === currentId)) {
          return currentId;
        }
        return nextTickets[0]?.id || "";
      });
      setIsLoading(false);
    } catch {
      router.push("/signup");
    }
  };

  useEffect(() => {
    refresh();
    const params = new URLSearchParams(window.location.search);
    const returnedDepositId = params.get("depositId");
    if (returnedDepositId) {
      setPendingDepositId(returnedDepositId);
      setFundMessage("Returned from PawaPay. Checking payment status...");
      setActiveSection("wallet");
      setWalletView("history");
      checkPawaPayDeposit(returnedDepositId)
        .then((result) => setFundMessage(`PawaPay status: ${result.status || result.deposit?.status || "processing"}.`))
        .then(refresh)
        .catch((error) => setFundMessage(error.message));
    }
    const sync = setInterval(refresh, 10000);
    return () => clearInterval(sync);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedCurrency = window.localStorage.getItem(currencyStorageKey);
    if (savedCurrency && CURRENCIES[savedCurrency]) {
      setCurrency(savedCurrency);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !CURRENCIES[currency]) return;
    window.localStorage.setItem(currencyStorageKey, currency);
  }, [currency]);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (isLoading || !user || typeof window === "undefined") return;
    const promptKey = `bb_whatsapp_prompt_seen_${user.id}`;
    if (window.localStorage.getItem(promptKey)) return;

    setShowWhatsappPrompt(true);
    window.localStorage.setItem(promptKey, "1");
    const timer = window.setTimeout(() => setShowWhatsappPrompt(false), 10000);
    return () => window.clearTimeout(timer);
  }, [isLoading, user]);

  useEffect(() => {
    const firstModule = platformModules[0];
    if (firstModule && !platformModules.includes(selectedModule)) {
      setSelectedModule(firstModule);
    }
  }, [platformModules, selectedModule]);

  useEffect(() => {
    const nextServices = services.length ? services : platformServices;
    const firstService = nextServices[0];
    if (firstService && !nextServices.some((service) => service.id === serviceId)) {
      setServiceId(firstService.id);
    }
  }, [platformServices, services, serviceId]);

  useEffect(() => {
    const currentQuantity = Number(quantity || 0);
    if (quantity === "") return;
    if (currentQuantity < selectedServiceMin || currentQuantity > selectedServiceMax) {
      setQuantity(selectedServiceMin);
    }
  }, [selectedServiceMin, selectedServiceMax, quantity]);

  useEffect(() => {
    if (selectedTicketId && filteredSupportTickets.some((ticket) => ticket.id === selectedTicketId)) return;
    setSelectedTicketId(filteredSupportTickets[0]?.id || "");
  }, [filteredSupportTickets, selectedTicketId]);

  const handleFunding = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const amount = Number(formData.get("amount"));
    const depositCurrency = String(formData.get("currency"));
    const minimumAmount = fromRwf(MINIMUM_DEPOSIT_RWF, depositCurrency);

    if (!Number.isFinite(amount) || amount < minimumAmount) {
      setFundMessage(`Minimum deposit is ${formatMoney(minimumAmount, depositCurrency)}.`);
      return;
    }

    try {
      setFundMessage("Creating secure PawaPay checkout...");
      const result = await initiatePawaPayPaymentPage({
        amount,
        currency: depositCurrency,
        phoneNumber: String(formData.get("phoneNumber") || "").trim(),
        country: String(formData.get("country") || "RWA"),
      });
      if (!result.redirectUrl) {
        throw new Error("PawaPay did not return a secure checkout link.");
      }
      window.location.href = result.redirectUrl;
    } catch (error) {
      setFundMessage(error.message);
    }
  };

  const handlePaymentStatusCheck = async () => {
    if (!pendingDepositId) return;
    try {
      const result = await checkPawaPayDeposit(pendingDepositId);
      await refresh();
      setFundMessage(`PawaPay status: ${result.status || result.deposit?.status || "processing"}.`);
    } catch (error) {
      setFundMessage(error.message);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!user) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const orderQuantity = Number(formData.get("quantity"));

    const requestedService = findService(String(formData.get("serviceId") || ""));
    const minQuantity = requestedService?.min || 100;
    const maxQuantity = requestedService?.max || 2147483647;

    if (!requestedService || orderQuantity < minQuantity || orderQuantity > maxQuantity) {
      setMessage(`Quantity must be between ${minQuantity.toLocaleString()} and ${maxQuantity.toLocaleString()} for this service.`);
      return;
    }

    try {
      const { order } = await submitOrder({
        serviceId: String(formData.get("serviceId")),
        quantity: orderQuantity,
        targetLink: String(formData.get("targetLink")),
        deliveryMode: String(formData.get("deliveryMode")),
        notes: String(formData.get("notes")).trim(),
      });

      form.reset();
      setQuantity(selectedServiceMin);
      await refresh();
      setMessage(
        `Success. Order request ${order.orderId || order.id.slice(0, 8)} submitted and ${formatMoney(
          fromRwf(order.cost, currency),
          currency
        )} deducted.`
      );
    } catch (error) {
      setMessage(error.message);
    }
  };

  const handleSupportSubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const attachment = await readAttachment(formData.get("attachment"));
      const { ticket } = await createSupportTicket({
        subject: String(formData.get("subject")).trim(),
        category: String(formData.get("category")),
        orderId: String(formData.get("orderId") || "").trim(),
        message: String(formData.get("message")).trim(),
        attachment,
      });
      form.reset();
      setSelectedTicketId(ticket.id);
      await refresh();
      setNotification(`New ticket created: ${ticket.ticketId}.`);
      setSupportMessage(`Success. Support request ${ticket.ticketId} sent to admin.`);
    } catch (error) {
      setSupportMessage(error.message);
    }
  };

  const handleSupportReply = async (event) => {
    event.preventDefault();
    if (!selectedTicket || !supportReply.trim()) return;

    try {
      const wasClosed = selectedTicket.status === "Closed";
      await replySupportTicket(selectedTicket.id, { message: supportReply.trim() });
      setSupportReply("");
      await refresh();
      setNotification(wasClosed ? `Ticket reopened: ${selectedTicket.ticketId}.` : `New message sent on ${selectedTicket.ticketId}.`);
      setSupportMessage(`Reply added to ${selectedTicket.ticketId}.`);
    } catch (error) {
      setSupportMessage(error.message);
    }
  };

  const actions = (
    <>
      <label className="currency-switcher">
        Currency
        <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
          {Object.keys(CURRENCIES).map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn btn-light"
        type="button"
        onClick={() => {
          logout().finally(() => router.push("/signup"));
        }}
      >
        Log Out
      </button>
    </>
  );

  return (
    <DashboardShell
      title="Organic growth dashboard"
      eyebrow="Customer portal"
      active={activeSection === "overview" ? "customer" : activeSection}
      actions={actions}
      showAdmin={user?.isAdmin}
      userName={user?.name}
    >
      {isLoading ? (
        <section className="panel-card">
          <span className="eyebrow">Checking session</span>
          <h2>Loading your dashboard...</h2>
          <p className="hero-text">If you are not logged in, you will be sent to the signup page.</p>
        </section>
      ) : (
        <>
          {activeSection === "overview" ? (
          <section className="panel-card portal-welcome">
            <div>
              <span className="eyebrow">Natural growth workspace</span>
              <h2>Manage organic-style campaigns without the clutter</h2>
              <p className="hero-text">
                Boster Bost is built for gradual, natural-looking delivery, clean tracking, secure wallet funding, and direct support.
              </p>
            </div>
            <div className="portal-menu" role="tablist" aria-label="Customer portal sections">
              {portalSections.map((section) => (
                <button
                  key={section.id}
                  className={activeSection === section.id ? "active" : ""}
                  type="button"
                  onClick={() => openSection(section.id)}
                  role="tab"
                  aria-selected={activeSection === section.id}
                >
                  {section.label}
                </button>
              ))}
            </div>
          </section>
          ) : null}

          {notification ? (
            <section className="notification-banner">
              <span>{notification}</span>
              <button type="button" onClick={() => setNotification("")}>
                Dismiss
              </button>
            </section>
          ) : null}

          {showWhatsappPrompt ? (
            <section className="whatsapp-prompt" role="status" aria-live="polite">
              <div>
                <strong>Join our WhatsApp Channel</strong>
                <p>Receive the latest updates, service announcements, and platform notices.</p>
              </div>
              <div className="whatsapp-prompt-actions">
                <a className="btn btn-secondary" href="https://whatsapp.com/channel/0029VbDDAEfA89MdzGunyD3I" target="_blank" rel="noreferrer">
                  Join Channel
                </a>
                <button className="btn btn-light" type="button" onClick={() => setShowWhatsappPrompt(false)}>
                  Close
                </button>
              </div>
            </section>
          ) : null}

          {activeSection === "overview" ? (
          <section className="dashboard-grid">
            <article className="metric-card">
              <span>Current user</span>
              <strong>{user?.name || "Guest"}</strong>
              <p>{user ? `${user.role} account` : "Please log in to use the panel."}</p>
            </article>
            <article className="metric-card">
              <span>Wallet balance</span>
              <strong>{displayWallet}</strong>
              <p>Available for orders.</p>
            </article>
            <article className="metric-card">
              <span>My order requests</span>
              <strong>{orders.length}</strong>
              <p>All campaigns.</p>
            </article>
            <article className="metric-card">
              <span>Support tickets</span>
              <strong>{supportTickets.length}</strong>
              <p>Open and closed tickets.</p>
            </article>
            <article className="metric-card quick-actions-card">
              <span>Quick actions</span>
              <strong>Start here</strong>
              <p>Choose one action.</p>
              <div className="inline-actions">
                <button className="btn btn-primary" type="button" onClick={() => openSection("wallet", "fund")}>
                  Add Funds
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => openSection("orders", "new")}>
                  Place Order
                </button>
              </div>
            </article>
            <article className="metric-card quick-actions-card whatsapp-card">
              <span>Updates</span>
              <strong>WhatsApp Channel</strong>
              <p>Join our WhatsApp Channel to receive the latest updates and announcements.</p>
              <a className="btn btn-secondary" href="https://whatsapp.com/channel/0029VbDDAEfA89MdzGunyD3I" target="_blank" rel="noreferrer">
                Join WhatsApp Channel
              </a>
            </article>
          </section>
          ) : null}

          {["wallet", "orders"].includes(activeSection) ? (
          <>
          <section className="panel-card section-switcher compact-switcher">
            {activeSection === "wallet" ? (
              <>
                <button type="button" onClick={() => setWalletView(walletView === "fund" ? "history" : "fund")}>
                  {walletView === "fund" ? "View Deposits & Transactions" : "Add Funds"}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setOrdersView(ordersView === "new" ? "history" : "new")}>
                  {ordersView === "new" ? "View Order History" : "Place Order"}
                </button>
              </>
            )}
          </section>

          <section className="single-workspace">
            {activeSection === "wallet" ? (
            walletView === "fund" ? (
            <article className="panel-card">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Secure checkout</span>
                  <h2>Add funds with PawaPay</h2>
                </div>
                <span className="status-pill">Redirects to PawaPay</span>
              </div>
              <form className="order-form" onSubmit={handleFunding}>
                <label>
                  Amount
                  <input name="amount" type="number" min={minimumDepositInCurrency} step="0.01" placeholder={`Minimum ${minimumDepositLabel}`} required />
                </label>
                <label>
                  Currency
                  <select name="currency" defaultValue={currency}>
                    {Object.keys(CURRENCIES).map((code) => (
                      <option key={code} value={code}>
                        {code} - {CURRENCIES[code].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Payment country
                  <select name="country" defaultValue="RWA">
                    {pawaPayCountries.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Phone number
                  <input name="phoneNumber" type="tel" placeholder="Optional" />
                </label>
                <button className="btn btn-primary full-field" type="submit">
                  Continue to PawaPay Secure Payment
                </button>
              </form>
              <p className="form-note">Minimum deposit: {minimumDepositLabel}.</p>
              <p className="form-message">
                {fundMessage}
                {pendingDepositId ? (
                  <button className="inline-action" type="button" onClick={handlePaymentStatusCheck}>
                    Check PawaPay Status
                  </button>
                ) : null}
              </p>
            </article>
            ) : (
            <article className="panel-card">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Wallet</span>
                  <h2>Deposits & transactions</h2>
                </div>
                <button className="btn btn-secondary" type="button" onClick={refresh}>
                  Refresh
                </button>
              </div>
              <div className="compact-stack">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Deposit ID</th>
                        <th>Amount</th>
                        <th>Country</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentDeposits.length ? (
                        paymentDeposits.map((deposit) => (
                          <tr key={deposit.id}>
                            <td>
                              <strong>{deposit.providerDepositId}</strong>
                            </td>
                            <td>
                              <strong>{formatMoney(deposit.originalAmount, deposit.originalCurrency)}</strong>
                              <br />
                              {formatMoney(deposit.amountRwf, "RWF")}
                            </td>
                            <td>{deposit.payerProvider || "-"}</td>
                            <td>
                              <span className={`order-status ${deposit.status === "COMPLETED" ? "" : "pending-status"}`}>{deposit.status}</span>
                              {deposit.status !== "COMPLETED" ? (
                                <button className="inline-action" type="button" onClick={() => setPendingDepositId(deposit.providerDepositId)}>
                                  Select
                                </button>
                              ) : null}
                            </td>
                            <td>{formatDate(deposit.createdAt)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5">No PawaPay deposit requests yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Description</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.length ? (
                        transactions.map((transaction) => (
                          <tr key={transaction.id}>
                            <td>
                              <span className="order-status">{transaction.type}</span>
                            </td>
                            <td>
                              <strong>{transactionAmount(transaction)}</strong>
                              <br />
                              {formatMoney(transaction.amountRwf, "RWF")}
                            </td>
                            <td>{transaction.description}</td>
                            <td>{formatDate(transaction.createdAt)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4">No wallet transactions yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </article>
            )
            ) : null}

            {activeSection === "orders" && ordersView === "new" ? (
            <article className="panel-card">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">New organic-style order</span>
                  <h2>Submit campaign request</h2>
                </div>
              </div>

              <form className="order-form" onSubmit={handleSubmit}>
                <label>
                  Social media account
                  <select value={selectedPlatform} onChange={(event) => setSelectedPlatform(event.target.value)} required>
                    {SERVICE_PLATFORMS.map((platform) => (
                      <option key={platform} value={platform}>
                        {platform}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Service tier
                  <select value={selectedModule} onChange={(event) => setSelectedModule(event.target.value)} required>
                    {platformModules.map((module) => (
                      <option key={module} value={module}>
                        {module}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Service
                  <select name="serviceId" value={serviceId} onChange={(event) => setServiceId(event.target.value)} required>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} - {formatMoney(fromRwf(service.priceRwf, currency), currency)} / 1K
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantity
                  <input
                    name="quantity"
                    type="number"
                    min={selectedServiceMin}
                    max={selectedServiceMax}
                    step="1"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    onFocus={(event) => event.currentTarget.select()}
                    required
                  />
                </label>
                <label>
                  Price per 1K
                  <input value={`${formatMoney(fromRwf(selectedService.priceRwf, currency), currency)} / 1K`} readOnly />
                </label>
                <label>
                  Service limits
                  <input value={`Min ${selectedServiceMin.toLocaleString()} - Max ${selectedServiceMax.toLocaleString()}`} readOnly />
                </label>
                <label className="full-field">
                  Target link
                  <input name="targetLink" type="url" placeholder="https://social-platform.com/your-post" required />
                </label>
                <label>
                  Delivery mode
                  <select name="deliveryMode">
                    <option value="Instant">Instant</option>
                    <option value="Drip-feed">Drip-feed</option>
                  </select>
                </label>
                <label>
                  Estimated cost
                  <input value={displayEstimate} readOnly />
                </label>
                <label className="full-field">
                  Notes for admin
                  <textarea name="notes" rows="4" placeholder="Any timing, refill, or campaign details"></textarea>
                </label>
                <button className="btn btn-primary full-field" type="submit">
                  Submit Order Request
                </button>
              </form>
              <p className="form-message">
                {message}
                {message.includes("Insufficient wallet balance") ? (
                  <button className="inline-action" type="button" onClick={() => openSection("wallet", "fund")}>
                    Add Funds
                  </button>
                ) : null}
              </p>
            </article>
            ) : null}
          </section>
          </>
          ) : null}

          {activeSection === "orders" && ordersView === "history" ? (
          <section className="single-workspace">
            <article className="panel-card">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">My requests</span>
                  <h2>Order history</h2>
                </div>
                <button className="btn btn-secondary" type="button" onClick={refresh}>
                  Refresh
                </button>
              </div>
              <div className="table-wrap">
                <section className="dashboard-grid compact-metrics">
                  <article className="metric-card">
                    <span>Total Orders</span>
                    <strong>{orderStatusCounts.total}</strong>
                  </article>
                  <article className="metric-card">
                    <span>Total Pending Orders</span>
                    <strong>{orderStatusCounts.pending}</strong>
                  </article>
                  <article className="metric-card">
                    <span>Total Completed Orders</span>
                    <strong>{orderStatusCounts.completed}</strong>
                  </article>
                  <article className="metric-card">
                    <span>Total Processing Orders</span>
                    <strong>{orderStatusCounts.processing}</strong>
                  </article>
                  <article className="metric-card">
                    <span>Total Cancelled Orders</span>
                    <strong>{orderStatusCounts.cancelled}</strong>
                  </article>
                </section>
                <table>
                  <thead>
                    <tr>
                      <th>Order ID</th>
                      <th>Service</th>
                      <th>Quantity</th>
                      <th>Cost</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length ? (
                      orders
                        .slice()
                        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                        .map((order) => (
                          <tr key={order.id}>
                            <td>
                              <strong>{order.orderId}</strong>
                            </td>
                            <td>
                              <strong>{order.service}</strong>
                              <br />
                              {order.platform}
                            </td>
                            <td>{Number(order.quantity).toLocaleString()}</td>
                            <td>
                              <strong>{formatMoney(fromRwf(order.cost, currency), currency)}</strong>
                              <br />
                              {formatMoney(order.cost, "RWF")}
                            </td>
                            <td>
                              <span className="order-status">{order.status}</span>
                            </td>
                            <td>{formatDate(order.createdAt)}</td>
                          </tr>
                        ))
                    ) : (
                      <tr>
                        <td colSpan="6">No order requests yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
          ) : null}

          {activeSection === "support" ? (
          <>
          <section className="panel-card section-switcher">
            <button className={supportView === "new" ? "active" : ""} type="button" onClick={() => setSupportView("new")}>
              New Ticket
            </button>
            <button className={supportView === "messages" ? "active" : ""} type="button" onClick={() => setSupportView("messages")}>
              Messages
            </button>
          </section>

          <section className="single-workspace">
            {supportView === "new" ? (
            <article className="panel-card">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Customer support</span>
                  <h2>Send support request</h2>
                </div>
                <span className="status-pill">Admin inbox</span>
              </div>
              <form className="order-form" onSubmit={handleSupportSubmit}>
                <label>
                  Order ID
                  <input name="orderId" type="text" placeholder="Optional order ID" />
                </label>
                <label>
                  Subject
                  <input name="subject" type="text" placeholder="Order issue, funding question, refill request" required />
                </label>
                <label>
                  Category
                  <select name="category" defaultValue="Order">
                    <option value="Order">Order</option>
                    <option value="Wallet">Wallet</option>
                    <option value="Refill">Refill</option>
                    <option value="API">API</option>
                    <option value="General">General</option>
                  </select>
                </label>
                <label className="full-field">
                  Message
                  <textarea name="message" rows="5" placeholder="Tell admin what you need help with" required></textarea>
                </label>
                <label className="full-field">
                  Attachment
                  <input name="attachment" type="file" />
                </label>
                <button className="btn btn-primary full-field" type="submit">
                  Send Support Request
                </button>
              </form>
              <p className="form-message">{supportMessage}</p>
            </article>
            ) : null}

            {supportView === "messages" ? (
            <article className="panel-card">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Conversation</span>
                  <h2>Support messages</h2>
                </div>
                <button className="btn btn-secondary" type="button" onClick={refresh}>
                  Refresh
                </button>
              </div>
              {supportTickets.length ? (
                <>
                  <section className="dashboard-grid compact-metrics">
                    <article className="metric-card">
                      <span>Total Open Tickets</span>
                      <strong>{supportStatusCounts.open}</strong>
                    </article>
                    <article className="metric-card">
                      <span>Total Closed Tickets</span>
                      <strong>{supportStatusCounts.closed}</strong>
                    </article>
                  </section>
                  <div className="filter-row">
                    <label>
                      Search by Order ID
                      <input value={supportOrderFilter} onChange={(event) => setSupportOrderFilter(event.target.value)} placeholder="Order or ticket ID" />
                    </label>
                    <label>
                      Ticket status
                      <select value={supportStatusFilter} onChange={(event) => setSupportStatusFilter(event.target.value)}>
                        <option value="All">All</option>
                        <option value="Open Tickets">Open tickets</option>
                        <option value="Closed Tickets">Closed tickets</option>
                        <option value="Open">Open</option>
                        <option value="Customer Reply">Customer Reply</option>
                        <option value="Answered">Answered</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </label>
                    <label>
                      Date
                      <input value={supportDateFilter} onChange={(event) => setSupportDateFilter(event.target.value)} type="date" />
                    </label>
                  </div>
                  <label className="support-selector">
                    Ticket
                    <select value={selectedTicket?.id || ""} onChange={(event) => setSelectedTicketId(event.target.value)}>
                      {filteredSupportTickets.map((ticket) => (
                        <option key={ticket.id} value={ticket.id}>
                          {ticket.ticketId} - {ticket.subject}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedTicket ? (
                  <div className="support-thread">
                    <div className={`ticket-summary ${selectedTicket?.status === "Closed" ? "ticket-closed" : ""}`}>
                      <strong>{selectedTicket?.ticketId}</strong>
                      <span className="order-status">{selectedTicket?.status === "Closed" ? "Ticket Closed" : selectedTicket?.status}</span>
                    </div>
                    {(selectedTicket?.messages || []).map((item) => (
                      <div className={`support-message ${item.senderRole}`} key={item.id}>
                        <strong>{item.senderRole === "admin" ? "Admin" : "You"}</strong>
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
                  ) : (
                    <p className="hero-text">No tickets match these filters.</p>
                  )}
                  <form className="order-form" onSubmit={handleSupportReply}>
                    <label className="full-field">
                      Reply
                      <textarea
                        rows="4"
                        value={supportReply}
                        onChange={(event) => setSupportReply(event.target.value)}
                        placeholder="Write your reply to admin"
                        required
                      ></textarea>
                    </label>
                    <button className="btn btn-primary full-field" type="submit">
                      Reply to Support
                    </button>
                  </form>
                </>
              ) : (
                <p className="hero-text">No support requests yet.</p>
              )}
            </article>
            ) : null}
          </section>
          </>
          ) : null}
        </>
      )}
    </DashboardShell>
  );
}

export default function CustomerDashboardPage() {
  return <CustomerDashboard initialSection="overview" />;
}
