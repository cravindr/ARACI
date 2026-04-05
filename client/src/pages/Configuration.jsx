import { useCallback, useEffect, useState } from "react";
import * as api from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import RichTextConfigField from "../components/RichTextConfigField.jsx";

export default function Configuration() {
  const { token } = useAuth();
  const [customerListPageSize, setCustomerListPageSize] = useState(10);
  const [jewelLoanDefaultTouchPct, setJewelLoanDefaultTouchPct] = useState("91.6");
  const [jewelLoanDefaultInterestRate, setJewelLoanDefaultInterestRate] = useState("2");
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyLicenceNumber, setCompanyLicenceNumber] = useState("");
  const [customerCopyHeaderHtml, setCustomerCopyHeaderHtml] = useState("");
  const [customerCopyTermsHtml, setCustomerCopyTermsHtml] = useState("");
  const [customerCopyFooterHtml, setCustomerCopyFooterHtml] = useState("");
  const [richMountKey, setRichMountKey] = useState(0);
  const [saved, setSaved] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    setSaved(null);
    try {
      const s = await api.fetchAppSettings(token);
      setCustomerListPageSize(s.customerListPageSize ?? 10);
      setJewelLoanDefaultTouchPct(
        s.jewelLoanDefaultTouchPct != null ? String(s.jewelLoanDefaultTouchPct) : "91.6"
      );
      setJewelLoanDefaultInterestRate(
        s.jewelLoanDefaultInterestRate != null ? String(s.jewelLoanDefaultInterestRate) : "2"
      );
      setCompanyName(s.companyName ?? "");
      setCompanyAddress(s.companyAddress ?? "");
      setCompanyLicenceNumber(s.companyLicenceNumber ?? "");
      setCustomerCopyHeaderHtml(s.customerCopyHeaderHtml ?? "");
      setCustomerCopyTermsHtml(s.customerCopyTermsHtml ?? "");
      setCustomerCopyFooterHtml(s.customerCopyFooterHtml ?? "");
      setRichMountKey((k) => k + 1);
    } catch (e) {
      setErr(e.message);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSave(e) {
    e.preventDefault();
    setErr("");
    setSaved(null);
    try {
      const n = Number(customerListPageSize);
      await api.updateAppSettings(token, {
        customerListPageSize: n,
        jewelLoanDefaultTouchPct: Number(jewelLoanDefaultTouchPct),
        jewelLoanDefaultInterestRate: Number(jewelLoanDefaultInterestRate),
        companyName,
        companyAddress,
        companyLicenceNumber,
        customerCopyHeaderHtml,
        customerCopyTermsHtml,
        customerCopyFooterHtml,
      });
      await load();
      setSaved("Saved.");
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="card">
      <h2>Configuration</h2>
      <p className="subtitle" style={{ marginTop: 0 }}>
        Application-wide options (administrators only).
      </p>
      {err ? <p className="error">{err}</p> : null}
      {saved ? <p style={{ color: "var(--success)", fontSize: "0.9rem" }}>{saved}</p> : null}
      <form onSubmit={onSave} className="config-form">
        <div className="field">
          <label htmlFor="customerListPageSize">Customer list page size</label>
          <input
            id="customerListPageSize"
            type="number"
            min={1}
            max={200}
            value={customerListPageSize}
            onChange={(e) => setCustomerListPageSize(e.target.value)}
            required
          />
          <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "0.35rem 0 0" }}>
            Number of rows per page on the Customers screen for all users. Default 10; max 200.
          </p>
        </div>
        <div className="field">
          <label htmlFor="jewelLoanDefaultTouchPct">Default jewel loan touch (% purity)</label>
          <input
            id="jewelLoanDefaultTouchPct"
            type="number"
            step="any"
            min={0.001}
            max={100}
            value={jewelLoanDefaultTouchPct}
            onChange={(e) => setJewelLoanDefaultTouchPct(e.target.value)}
            required
          />
          <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "0.35rem 0 0" }}>
            Pre-filled on the Jewel pledge loan form for new loans (e.g. 91.6). Must be between 0 and 100.
          </p>
        </div>
        <div className="field">
          <label htmlFor="jewelLoanDefaultInterestRate">Default jewel loan interest rate (%)</label>
          <input
            id="jewelLoanDefaultInterestRate"
            type="number"
            step="any"
            min={0}
            value={jewelLoanDefaultInterestRate}
            onChange={(e) => setJewelLoanDefaultInterestRate(e.target.value)}
            required
          />
          <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "0.35rem 0 0" }}>
            Pre-filled interest % for new pledge loans. Must be non-negative.
          </p>
        </div>

        <h3 className="config-form__section-title">Company (records)</h3>
        <p className="subtitle config-form__section-desc">
          For office records only — <strong>not</strong> printed on the jewel pledge customer copy. The printed slip uses the header (rich text) and customer/loan blocks only.
        </p>
        <div className="field">
          <label htmlFor="companyName">Company name</label>
          <input
            id="companyName"
            type="text"
            maxLength={500}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="companyAddress">Company address</label>
          <textarea
            id="companyAddress"
            rows={4}
            maxLength={2000}
            value={companyAddress}
            onChange={(e) => setCompanyAddress(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="companyLicenceNumber">Licence number</label>
          <input
            id="companyLicenceNumber"
            type="text"
            maxLength={500}
            value={companyLicenceNumber}
            onChange={(e) => setCompanyLicenceNumber(e.target.value)}
          />
        </div>

        <h3 className="config-form__section-title">Customer copy — rich text</h3>
        <RichTextConfigField
          key={`copy-h-${richMountKey}`}
          id="customerCopyHeaderHtml"
          label="Header"
          value={customerCopyHeaderHtml}
          onChange={setCustomerCopyHeaderHtml}
          hint="Appears at the top of the customer copy (e.g. tagline or letterhead text). Use Bold / lists / links as needed."
        />
        <RichTextConfigField
          key={`copy-t-${richMountKey}`}
          id="customerCopyTermsHtml"
          label="Terms and conditions"
          value={customerCopyTermsHtml}
          onChange={setCustomerCopyTermsHtml}
          hint="Printed after loan details. A Tamil Nadu / microfinance–style default is filled when this was empty; edit to match your counsel’s advice and RBI / state rules."
        />
        <RichTextConfigField
          key={`copy-f-${richMountKey}`}
          id="customerCopyFooterHtml"
          label="Footer"
          value={customerCopyFooterHtml}
          onChange={setCustomerCopyFooterHtml}
          hint="Appears at the bottom of the customer copy (e.g. signature line note, branch hours)."
        />

        <button type="submit" className="btn btn-primary">
          Save
        </button>
      </form>
    </div>
  );
}
