"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PublicHeader from "../../components/PublicHeader";
import { CURRENCIES, SERVICE_CATALOG, SERVICE_PLATFORMS, formatMoney, fromRwf } from "../../lib/catalog";

const currencyStorageKey = "boster-bost-currency";

export default function ServicesPage() {
  const [currency, setCurrency] = useState("RWF");
  const [selectedPlatform, setSelectedPlatform] = useState(SERVICE_PLATFORMS[0]);

  const services = useMemo(() => {
    return SERVICE_CATALOG.filter((service) => service.platform === selectedPlatform);
  }, [selectedPlatform]);

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
      <main className="section">
        <div className="container">
          <div className="section-heading split-heading">
            <div>
              <span className="eyebrow">Services</span>
              <h1>Growth services by social media account</h1>
              <p className="hero-text">
                Select a platform to see every available service, live converted pricing, and order limits before opening the dashboard.
              </p>
            </div>
            <Link className="btn btn-primary" href="/signup">
              Start Growing Instantly
            </Link>
          </div>

          <section className="panel-card service-browser">
            <div className="filter-row">
              <label>
                Social media account
                <select value={selectedPlatform} onChange={(event) => setSelectedPlatform(event.target.value)}>
                  {SERVICE_PLATFORMS.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>
              </label>
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

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Platform</th>
                    <th>Service</th>
                    <th>Tier</th>
                    <th>Rate / 1K</th>
                    <th>Min</th>
                    <th>Max</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((service) => (
                    <tr key={service.id}>
                      <td>{service.platform}</td>
                      <td>
                        <strong>{service.name}</strong>
                      </td>
                      <td>{service.module}</td>
                      <td>
                        <strong>{formatMoney(fromRwf(service.priceRwf, currency), currency)}</strong>
                        <br />
                        {formatMoney(service.priceRwf, "RWF")}
                      </td>
                      <td>{service.min.toLocaleString()}</td>
                      <td>{service.max.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
