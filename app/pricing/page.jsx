"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PublicHeader from "../../components/PublicHeader";
import { CURRENCIES, SERVICE_CATALOG, formatMoney, fromRwf } from "../../lib/catalog";

const baseService = SERVICE_CATALOG.find((service) => service.id === "cheap-001") || SERVICE_CATALOG[0];
const premiumService = SERVICE_CATALOG.find((service) => service.id === "speed-001") || SERVICE_CATALOG[0];
const currencyStorageKey = "boster-bost-currency";

export default function PricingPage() {
  const [currency, setCurrency] = useState("RWF");

  useEffect(() => {
    const savedCurrency = window.localStorage.getItem(currencyStorageKey);
    if (savedCurrency && CURRENCIES[savedCurrency]) {
      setCurrency(savedCurrency);
    }
  }, []);

  useEffect(() => {
    if (!CURRENCIES[currency]) return;
    window.localStorage.setItem(currencyStorageKey, currency);
  }, [currency]);

  return (
    <>
      <PublicHeader />
      <main className="section muted">
        <div className="container">
          <div className="section-heading split-heading">
            <div>
              <span className="eyebrow">Pricing</span>
              <h1>Transparent multi-currency pricing</h1>
              <p className="hero-text">Service pricing is calculated per 1,000 actions and shown before each order is submitted.</p>
            </div>
            <Link className="btn btn-primary" href="/dashboard">
              Place Order Request
            </Link>
          </div>

          <div className="filter-row">
            <label>
              Currency
              <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                {Object.keys(CURRENCIES).map((code) => (
                  <option key={code} value={code}>
                    {code} - {CURRENCIES[code].label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="pricing-grid">
            <article className="price-card">
              <p className="price-label">Base services</p>
              <h3>
                From <span>{formatMoney(fromRwf(baseService.priceRwf, currency), currency)}</span>
                <small>/1K</small>
              </h3>
              <p>
                {baseService.name}. Source rate: {formatMoney(baseService.priceRwf, "RWF")} /1K.
              </p>
            </article>
            <article className="price-card featured-price">
              <p className="price-label">Premium package</p>
              <h3>
                From <span>{formatMoney(fromRwf(premiumService.priceRwf, currency), currency)}</span>
                <small>/1K</small>
              </h3>
              <p>
                {premiumService.name}. Source rate: {formatMoney(premiumService.priceRwf, "RWF")} /1K.
              </p>
            </article>
            <article className="price-card">
              <p className="price-label">Wallet</p>
              <h3>
                Multi<small> currency</small>
              </h3>
              <p>Add funds and view balances in RWF, USD, EUR, GBP, KES, UGX, TZS, or NGN.</p>
            </article>
          </div>
        </div>
      </main>
    </>
  );
}
