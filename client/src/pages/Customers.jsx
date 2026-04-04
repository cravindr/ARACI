import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../api.js";
import { useAuth } from "../AuthContext.jsx";

const FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.bmp,application/pdf,image/jpeg,image/png,image/bmp";

function emptyForm() {
  return {
    name: "",
    fatherName: "",
    address: "",
    placeId: "",
    panNumber: "",
    aadharNumber: "",
    pinCode: "",
    mobile1: "",
    mobile2: "",
    comments: "",
    referencesComment: "",
    referredByCustomerId: "",
  };
}

function emptyDetailSearch() {
  return {
    name: "",
    fatherName: "",
    address: "",
    mobile: "",
    placeId: "",
    pan: "",
    aadhar: "",
    pinCode: "",
  };
}

/** Non-empty API fields only; null = no extra filters. */
function buildDetailSearchPayload(form) {
  const o = {};
  if (form.name.trim()) o.name = form.name.trim();
  if (form.fatherName.trim()) o.fatherName = form.fatherName.trim();
  if (form.address.trim()) o.address = form.address.trim();
  if (form.mobile.trim()) o.mobile = form.mobile.trim();
  if (form.placeId) o.placeId = form.placeId;
  if (form.pan.trim()) o.pan = form.pan.trim();
  if (form.aadhar.trim()) o.aadhar = form.aadhar.trim();
  if (form.pinCode.trim()) o.pinCode = form.pinCode.trim();
  return Object.keys(o).length ? o : null;
}

function appendForm(fd, form) {
  fd.append("name", form.name);
  fd.append("fatherName", form.fatherName);
  fd.append("address", form.address);
  fd.append("placeId", String(form.placeId));
  if (form.panNumber) fd.append("panNumber", form.panNumber);
  if (form.aadharNumber) fd.append("aadharNumber", form.aadharNumber);
  if (form.pinCode) fd.append("pinCode", form.pinCode);
  if (form.mobile1) fd.append("mobile1", form.mobile1);
  if (form.mobile2) fd.append("mobile2", form.mobile2);
  if (form.comments) fd.append("comments", form.comments);
  if (form.referencesComment) fd.append("referencesComment", form.referencesComment);
  if (form.referredByCustomerId)
    fd.append("referredByCustomerId", String(form.referredByCustomerId));
}

export default function Customers() {
  const { token } = useAuth();
  const [places, setPlaces] = useState([]);
  const [list, setList] = useState([]);
  const [searchQ, setSearchQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [err, setErr] = useState("");
  const [form, setForm] = useState(() => emptyForm());
  const [addressProof, setAddressProof] = useState(null);
  const [panProof, setPanProof] = useState(null);
  const [aadharProof, setAadharProof] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [refQuery, setRefQuery] = useState("");
  const [refOptions, setRefOptions] = useState([]);
  const [showRefList, setShowRefList] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const [showDetailSearch, setShowDetailSearch] = useState(false);
  const [detailSearchForm, setDetailSearchForm] = useState(() =>
    emptyDetailSearch()
  );
  const [appliedDetailSearch, setAppliedDetailSearch] = useState(null);
  const refBlurTimer = useRef(null);

  const clearRefBlurTimer = useCallback(() => {
    if (refBlurTimer.current) {
      clearTimeout(refBlurTimer.current);
      refBlurTimer.current = null;
    }
  }, []);

  const scheduleHideReferrerList = useCallback(() => {
    clearRefBlurTimer();
    refBlurTimer.current = setTimeout(() => {
      setShowRefList(false);
      refBlurTimer.current = null;
    }, 200);
  }, [clearRefBlurTimer]);

  useEffect(() => () => clearRefBlurTimer(), [clearRefBlurTimer]);

  const loadPlaces = useCallback(async () => {
    try {
      setPlaces(await api.fetchPlaces(token));
    } catch (e) {
      setErr(e.message);
    }
  }, [token]);

  const loadList = useCallback(async () => {
    setErr("");
    try {
      const opts = {
        q: debouncedQ || undefined,
        ...(appliedDetailSearch || {}),
      };
      setList(await api.fetchCustomers(token, opts));
    } catch (e) {
      setErr(e.message);
    }
  }, [token, debouncedQ, appliedDetailSearch]);

  useEffect(() => {
    loadPlaces();
  }, [loadPlaces]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQ]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const opts = await api.fetchCustomerReferrers(token, {
          q: refQuery,
          excludeId: editingId,
        });
        setRefOptions(opts);
      } catch {
        setRefOptions([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [refQuery, editingId, token]);

  function resetCreateForm() {
    clearRefBlurTimer();
    setForm(emptyForm());
    setAddressProof(null);
    setPanProof(null);
    setAadharProof(null);
    setEditingId(null);
    setRefQuery("");
    setShowRefList(false);
    setFileKey((k) => k + 1);
  }

  function startEdit(row) {
    clearRefBlurTimer();
    setEditingId(row.id);
    setForm({
      name: row.name,
      fatherName: row.fatherName,
      address: row.address,
      placeId: String(row.placeId),
      panNumber: row.panNumber || "",
      aadharNumber: row.aadharNumber || "",
      pinCode: row.pinCode ?? "",
      mobile1: row.mobile1 ?? "",
      mobile2: row.mobile2 || "",
      comments: row.comments || "",
      referencesComment: row.referencesComment || "",
      referredByCustomerId: row.referredByCustomerId
        ? String(row.referredByCustomerId)
        : "",
    });
    setAddressProof(null);
    setPanProof(null);
    setAadharProof(null);
    setFileKey((k) => k + 1);
    setRefQuery(
      row.referrerName && row.referredByCustomerId
        ? `${row.referrerName} (#${row.referredByCustomerId})`
        : ""
    );
    setShowRefList(false);
  }

  async function onCreate(e) {
    e.preventDefault();
    setErr("");
    if (!form.placeId) {
      setErr("Select a place.");
      return;
    }
    try {
      const fd = new FormData();
      appendForm(fd, { ...form, placeId: form.placeId });
      if (addressProof) fd.append("addressProof", addressProof);
      if (panProof) fd.append("panProof", panProof);
      if (aadharProof) fd.append("aadharProof", aadharProof);
      await api.createCustomer(token, fd);
      resetCreateForm();
      await loadList();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function onSaveEdit(e) {
    e.preventDefault();
    if (!editingId) return;
    setErr("");
    if (!form.placeId) {
      setErr("Select a place.");
      return;
    }
    try {
      const fd = new FormData();
      appendForm(fd, { ...form, placeId: form.placeId });
      if (addressProof) fd.append("addressProof", addressProof);
      if (panProof) fd.append("panProof", panProof);
      if (aadharProof) fd.append("aadharProof", aadharProof);
      await api.updateCustomer(token, editingId, fd);
      resetCreateForm();
      await loadList();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function onDelete(id) {
    if (!window.confirm("Delete this customer and attachments?")) return;
    setErr("");
    try {
      await api.deleteCustomer(token, id);
      if (editingId === id) resetCreateForm();
      await loadList();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function onDownloadProof(customerId, kind) {
    setErr("");
    try {
      const blob = await api.downloadCustomerProof(token, customerId, kind);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kind}-${customerId}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div>
      <div className="card card--customer-form" style={{ marginBottom: "1rem" }}>
        <h2>Customers</h2>
        <p style={{ color: "var(--muted)", marginTop: 0, fontSize: "0.85rem", marginBottom: "0.5rem" }}>
          Quick search matches any field. Use “Detail search” for filters by column. Proofs: PDF, JPG, JPEG, PNG, BMP (max ~8MB).
        </p>
        <div className="field" style={{ marginBottom: "0.35rem" }}>
          <label>Search all fields</label>
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Type to filter the list…"
            style={{ maxWidth: "28rem" }}
          />
        </div>
        <div className="detail-search-toolbar">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowDetailSearch((v) => !v)}
          >
            {showDetailSearch ? "Hide detail search" : "Detail search"}
          </button>
          {appliedDetailSearch ? (
            <span className="detail-search-badge">Detail filters active</span>
          ) : null}
        </div>
        {showDetailSearch ? (
          <form
            className="detail-search-panel"
            onSubmit={(e) => {
              e.preventDefault();
              setAppliedDetailSearch(buildDetailSearchPayload(detailSearchForm));
            }}
          >
            <div className="detail-search-grid">
              <div className="field">
                <label>Name</label>
                <input
                  value={detailSearchForm.name}
                  onChange={(e) =>
                    setDetailSearchForm({
                      ...detailSearchForm,
                      name: e.target.value,
                    })
                  }
                  placeholder="Contains…"
                />
              </div>
              <div className="field">
                <label>Father name</label>
                <input
                  value={detailSearchForm.fatherName}
                  onChange={(e) =>
                    setDetailSearchForm({
                      ...detailSearchForm,
                      fatherName: e.target.value,
                    })
                  }
                  placeholder="Contains…"
                />
              </div>
              <div className="field">
                <label>Address</label>
                <input
                  value={detailSearchForm.address}
                  onChange={(e) =>
                    setDetailSearchForm({
                      ...detailSearchForm,
                      address: e.target.value,
                    })
                  }
                  placeholder="Contains…"
                />
              </div>
              <div className="field">
                <label>Mobile</label>
                <input
                  value={detailSearchForm.mobile}
                  onChange={(e) =>
                    setDetailSearchForm({
                      ...detailSearchForm,
                      mobile: e.target.value,
                    })
                  }
                  placeholder="mobile1 or mobile2"
                />
              </div>
              <div className="field">
                <label>Place</label>
                <select
                  value={detailSearchForm.placeId}
                  onChange={(e) =>
                    setDetailSearchForm({
                      ...detailSearchForm,
                      placeId: e.target.value,
                    })
                  }
                >
                  <option value="">Any place</option>
                  {places.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.initial} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>PAN</label>
                <input
                  value={detailSearchForm.pan}
                  onChange={(e) =>
                    setDetailSearchForm({
                      ...detailSearchForm,
                      pan: e.target.value,
                    })
                  }
                  placeholder="Contains…"
                />
              </div>
              <div className="field">
                <label>Aadhar</label>
                <input
                  value={detailSearchForm.aadhar}
                  onChange={(e) =>
                    setDetailSearchForm({
                      ...detailSearchForm,
                      aadhar: e.target.value,
                    })
                  }
                  placeholder="Contains…"
                />
              </div>
              <div className="field">
                <label>PIN code</label>
                <input
                  value={detailSearchForm.pinCode}
                  onChange={(e) =>
                    setDetailSearchForm({
                      ...detailSearchForm,
                      pinCode: e.target.value,
                    })
                  }
                  placeholder="Contains…"
                />
              </div>
            </div>
            <div className="detail-search-actions">
              <button type="submit" className="btn btn-primary">
                Search
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setDetailSearchForm(emptyDetailSearch());
                  setAppliedDetailSearch(null);
                }}
              >
                Clear detail filters
              </button>
            </div>
          </form>
        ) : null}
      </div>

      <div className="card card--customer-form" style={{ marginBottom: "1.5rem" }}>
        <h2>{editingId ? `Edit customer #${editingId}` : "New customer"}</h2>
        {err ? <p className="error" style={{ marginTop: 0 }}>{err}</p> : null}
        <form onSubmit={editingId ? onSaveEdit : onCreate}>
          <div className="customer-form-columns">
            <div className="customer-form-col">
              <div className="field">
                <label>Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Address</label>
                <textarea
                  rows={3}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Address proof (optional)</label>
                <input
                  key={`addr-${fileKey}`}
                  type="file"
                  accept={FILE_ACCEPT}
                  onChange={(e) => setAddressProof(e.target.files?.[0] || null)}
                />
              </div>
              <div className="field">
                <label>Comments</label>
                <textarea
                  rows={2}
                  value={form.comments}
                  onChange={(e) => setForm({ ...form, comments: e.target.value })}
                />
              </div>
            </div>

            <div className="customer-form-col">
              <div className="field">
                <label>Father name</label>
                <input
                  value={form.fatherName}
                  onChange={(e) => setForm({ ...form, fatherName: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Place</label>
                <select
                  value={form.placeId}
                  onChange={(e) => setForm({ ...form, placeId: e.target.value })}
                  required
                >
                  <option value="">Select place…</option>
                  {places.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.initial} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>PAN number (optional)</label>
                <input
                  value={form.panNumber}
                  onChange={(e) => setForm({ ...form, panNumber: e.target.value })}
                />
              </div>
              <div className="field">
                <label>PAN proof (optional)</label>
                <input
                  key={`pan-${fileKey}`}
                  type="file"
                  accept={FILE_ACCEPT}
                  onChange={(e) => setPanProof(e.target.files?.[0] || null)}
                />
              </div>
              <div className="field">
                <label>References comment</label>
                <textarea
                  rows={2}
                  value={form.referencesComment}
                  onChange={(e) =>
                    setForm({ ...form, referencesComment: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="customer-form-col">
              <div className="field">
                <label>Aadhar number (optional)</label>
                <input
                  value={form.aadharNumber}
                  onChange={(e) => setForm({ ...form, aadharNumber: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Aadhar proof (optional)</label>
                <input
                  key={`aadhar-${fileKey}`}
                  type="file"
                  accept={FILE_ACCEPT}
                  onChange={(e) => setAadharProof(e.target.files?.[0] || null)}
                />
              </div>
              <div className="field">
                <label>PIN code (optional)</label>
                <input
                  value={form.pinCode}
                  onChange={(e) => setForm({ ...form, pinCode: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Mobile 1 (optional)</label>
                <input
                  value={form.mobile1}
                  onChange={(e) => setForm({ ...form, mobile1: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Mobile 2 (optional)</label>
                <input
                  value={form.mobile2}
                  onChange={(e) => setForm({ ...form, mobile2: e.target.value })}
                />
              </div>
              <div className="field" style={{ position: "relative" }}>
                <label>Referred by (search)</label>
                <input
                  value={refQuery}
                  onChange={(e) => {
                    setRefQuery(e.target.value);
                    setForm({
                      ...form,
                      referredByCustomerId: "",
                    });
                    clearRefBlurTimer();
                    setShowRefList(true);
                  }}
                  onFocus={() => {
                    clearRefBlurTimer();
                    setShowRefList(true);
                  }}
                  onBlur={() => scheduleHideReferrerList()}
                  placeholder="Name / mobile / place…"
                  autoComplete="off"
                />
                {showRefList && refOptions.length > 0 && (
                  <ul
                    style={{
                      position: "absolute",
                      zIndex: 20,
                      left: 0,
                      right: 0,
                      maxHeight: "160px",
                      overflow: "auto",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      margin: "4px 0 0",
                      padding: 0,
                      listStyle: "none",
                      fontSize: "0.82rem",
                    }}
                  >
                    {refOptions.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{
                            width: "100%",
                            textAlign: "left",
                            borderRadius: 0,
                            border: "none",
                            borderBottom: "1px solid var(--border)",
                            padding: "0.35rem 0.5rem",
                            fontSize: "0.82rem",
                          }}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            clearRefBlurTimer();
                            setForm({
                              ...form,
                              referredByCustomerId: String(r.id),
                            });
                            setRefQuery(
                              `${r.name} (#${r.id})${r.placeName ? ` · ${r.placeName}` : ""}`
                            );
                            setShowRefList(false);
                          }}
                        >
                          <strong>{r.name}</strong> · {r.mobile1 || "—"}{" "}
                          {r.placeName ? `· ${r.placeName}` : ""}{" "}
                          <span style={{ color: "var(--muted)" }}>#{r.id}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {form.referredByCustomerId ? (
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--muted)",
                      margin: "0.25rem 0 0",
                    }}
                  >
                    ID {form.referredByCustomerId}{" "}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: "0.15rem 0.4rem", fontSize: "0.7rem" }}
                      onClick={() => {
                        setForm({ ...form, referredByCustomerId: "" });
                        setRefQuery("");
                      }}
                    >
                      Clear
                    </button>
                  </p>
                ) : null}
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                {editingId ? "Save changes" : "Register customer"}
              </button>
              {editingId ? (
                <button type="button" className="btn btn-ghost" onClick={resetCreateForm}>
                  Cancel edit
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Customer list ({list.length})</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Father</th>
                <th>Place</th>
                <th>Mobile</th>
                <th>PAN</th>
                <th>Aadhar</th>
                <th>Proofs</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.name}</td>
                  <td>{row.fatherName}</td>
                  <td>
                    {row.placeInitial} {row.placeName}
                  </td>
                  <td>
                    {row.mobile1 || "—"}
                    {row.mobile2 ? ` / ${row.mobile2}` : ""}
                  </td>
                  <td>{row.panNumber || "—"}</td>
                  <td>{row.aadharNumber || "—"}</td>
                  <td>
                    <div className="row-actions">
                      {row.hasAddressProof ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: "0.75rem" }}
                          onClick={() => onDownloadProof(row.id, "addressProof")}
                        >
                          Addr
                        </button>
                      ) : null}
                      {row.hasPanProof ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: "0.75rem" }}
                          onClick={() => onDownloadProof(row.id, "panProof")}
                        >
                          PAN
                        </button>
                      ) : null}
                      {row.hasAadharProof ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: "0.75rem" }}
                          onClick={() => onDownloadProof(row.id, "aadharProof")}
                        >
                          Aadhar
                        </button>
                      ) : null}
                      {!row.hasAddressProof &&
                      !row.hasPanProof &&
                      !row.hasAadharProof
                        ? "—"
                        : null}
                    </div>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => startEdit(row)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => onDelete(row.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
