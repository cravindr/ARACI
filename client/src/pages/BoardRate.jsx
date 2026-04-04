import { useEffect, useState } from "react";
import * as api from "../api.js";
import { useAuth } from "../AuthContext.jsx";

function formatRate(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDt(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return String(iso);
  }
}

export default function BoardRate() {
  const { token, isAdmin } = useAuth();
  const [current, setCurrent] = useState({ rate: null, updatedAt: null });
  const [history, setHistory] = useState([]);
  const [rateInput, setRateInput] = useState("");
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr("");
      try {
        const [cur, hist] = await Promise.all([
          api.fetchBoardRate(token),
          api.fetchBoardRateHistory(token),
        ]);
        if (cancelled) return;
        setCurrent(cur);
        setHistory(hist);
        if (cur.rate != null) {
          setRateInput(String(cur.rate));
        }
      } catch (e) {
        if (!cancelled) setErr(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSave(e) {
    e.preventDefault();
    setErr("");
    setInfo("");
    const rate = Number(rateInput);
    if (!Number.isFinite(rate) || rate < 0) {
      setErr("Enter a valid non-negative gold rate.");
      return;
    }
    try {
      const payload = { rate };
      const c = comment.trim();
      if (c) payload.comment = c;
      const res = await api.updateBoardRate(token, payload);
      if (res.unchanged) {
        setInfo("Rate unchanged; no new history row.");
      } else {
        setInfo("Gold board rate updated.");
        setComment("");
      }
      setCurrent({ rate: res.rate, updatedAt: res.updatedAt });
      const hist = await api.fetchBoardRateHistory(token);
      setHistory(hist);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2>Gold board rate</h2>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          Current rate shown to all users. History keeps each change with date, time, and comment
          (defaults to <em>gold rate changed</em> when left blank).
        </p>
        <p style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
          <strong>{formatRate(current.rate)}</strong>
          {current.updatedAt ? (
            <span style={{ color: "var(--muted)", fontSize: "0.9rem", marginLeft: "0.75rem" }}>
              Last updated: {formatDt(current.updatedAt)}
            </span>
          ) : null}
        </p>

        {isAdmin ? (
          <form onSubmit={onSave} style={{ marginTop: "1.25rem" }}>
            <div className="field">
              <label>New rate</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                required
                style={{ maxWidth: "12rem" }}
              />
            </div>
            <div className="field">
              <label>Comment (optional)</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Leave empty to use: gold rate changed"
                maxLength={500}
              />
            </div>
            {err ? <p className="error">{err}</p> : null}
            {info ? (
              <p style={{ color: "var(--success)", margin: "0.5rem 0 0", fontSize: "0.9rem" }}>
                {info}
              </p>
            ) : null}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                Save rate
              </button>
            </div>
          </form>
        ) : (
          <p style={{ color: "var(--muted)", marginBottom: 0 }}>
            Only administrators can change the board rate.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Rate history</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date &amp; time</th>
                <th>Rate</th>
                <th>Comment</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ color: "var(--muted)" }}>
                    No changes yet.
                  </td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDt(row.changedAt)}</td>
                    <td>{formatRate(row.rate)}</td>
                    <td>{row.comment}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
