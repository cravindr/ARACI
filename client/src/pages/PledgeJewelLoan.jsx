import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import QRCode from "qrcode";
import * as api from "../api.js";
import { useAuth } from "../AuthContext.jsx";

const TOTAL_WEIGHT_FIELD_TOOLTIP =
  "Total weight of pledged gold in grams (up to 3 decimals). " +
  "Auto-filled from the sum of line weights when you apply jewel types. " +
  "If you type a custom value, it is saved and is not overwritten when item weights change.";

function emptyPickerDetail() {
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

function buildPickerDetailPayload(form) {
  const o = {};
  if (form.name.trim()) o.name = form.name.trim();
  if (form.fatherName.trim()) o.fatherName = form.fatherName.trim();
  if (form.address.trim()) o.address = form.address.trim();
  if (form.mobile.trim()) o.mobile = form.mobile.trim();
  if (form.placeId) o.placeId = form.placeId;
  if (form.pan.trim()) o.pan = form.pan.trim();
  if (form.aadhar.trim()) o.aadhar = form.aadhar.trim();
  if (form.pinCode.trim()) o.pinCode = form.pinCode.trim();
  return o;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function round3(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

/** Sum of per-line weights (g) when each line has a positive weight; otherwise 0. */
function sumLineWeightsGrams(lines) {
  let s = 0;
  let any = false;
  for (const row of lines) {
    const w = round3(row.weightGrams);
    if (Number.isFinite(w) && w > 0) {
      s += w;
      any = true;
    }
  }
  return any ? round3(s) : 0;
}

function computeWorthDisplay(totalWeight, touchPct, ratePerGram) {
  const w = Number(totalWeight);
  const t = Number(touchPct);
  const r = Number(ratePerGram);
  if (!Number.isFinite(w) || !Number.isFinite(t) || !Number.isFinite(r) || w <= 0 || t <= 0 || r < 0) {
    return null;
  }
  const fine = w * (t / 100);
  return round2(fine * r);
}

function formatInr(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Prefer jewel type description on receipts; fall back to name. */
function jewelItemPrintLabel(it) {
  const d = it?.jewelTypeDescription;
  if (d != null && String(d).trim() !== "") return String(d).trim();
  return it?.jewelTypeName != null ? String(it.jewelTypeName) : "—";
}

function loanItemLinesForLoanRow(L) {
  const items = L.items || [];
  if (!items.length) return [];
  return items.map((it) => {
    const base = `${jewelItemPrintLabel(it)} ×${it.quantity}`;
    const w = round3(it.weightGrams);
    if (Number.isFinite(w) && w > 0) return `${base} · ${w} g`;
    return base;
  });
}

function IconEdit() {
  return (
    <svg
      className="row-action-icon__svg"
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconPrint() {
  return (
    <svg
      className="row-action-icon__svg"
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect width="12" height="8" x="6" y="14" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg
      className="row-action-icon__svg"
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

function totalJewelQty(items) {
  if (!Array.isArray(items) || !items.length) return 0;
  return items.reduce((sum, it) => sum + Math.floor(Number(it.quantity) || 0), 0);
}

function formatLoanDateTime(createdAt) {
  if (createdAt == null || createdAt === "") return "—";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    dateStyle: "long",
    timeStyle: "medium",
    timeZone: "Asia/Kolkata",
  });
}

/** Value for `<input type="datetime-local" />` in local timezone. */
function toDatetimeLocalString(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return toDatetimeLocalString(new Date());
  const pad = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

function dateFromDatetimeLocal(s) {
  if (s == null || String(s).trim() === "") return new Date();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Calendar months from loan start to `asOf`, then days until `asOf` after that boundary. */
function loanDurationMonthsDays(createdAt, asOf = new Date()) {
  const start = new Date(createdAt);
  const end = new Date(asOf);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { wholeMonths: 0, days: 0, invalid: true };
  }
  if (end < start) {
    return { wholeMonths: 0, days: 0, invalid: true };
  }
  let months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  const anchor = new Date(start);
  anchor.setMonth(anchor.getMonth() + months);
  const days = Math.max(
    0,
    Math.round((end.getTime() - anchor.getTime()) / 86400000)
  );
  return { wholeMonths: Math.max(0, months), days, invalid: false };
}

/**
 * Interest month credit from partial days: 1–15 days → +½ month; 16+ → +1 full month.
 * Example: 1 month + 1 day → 1.5 months; 16 extra days after full months → +1 month.
 */
function effectiveMonthsFractional(wholeMonths, days) {
  if (days <= 0) return wholeMonths;
  if (days <= 15) return wholeMonths + 0.5;
  return wholeMonths + 1;
}

/** Any extra days after full months count as one extra full month for billing. */
function effectiveMonthsRoundedUp(wholeMonths, days) {
  return wholeMonths + (days > 0 ? 1 : 0);
}

/** e.g. 1 month 2 days → 1 + 2/30 month-units for interest (30-day month convention). */
const PRO_RATA_DAYS_PER_MONTH = 30;

function effectiveMonthsExactProRata(wholeMonths, days) {
  return wholeMonths + days / PRO_RATA_DAYS_PER_MONTH;
}

function loanRecordStartIso(loan) {
  return loan?.loanAsOf || loan?.createdAt || null;
}

function computeRedeemPreview(loan, asOf = new Date()) {
  const P = Number(loan?.loanAmount);
  const rate = Number(loan?.interestRate);
  const startIso = loanRecordStartIso(loan);
  if (!startIso || !Number.isFinite(P) || P <= 0 || !Number.isFinite(rate) || rate < 0) {
    return null;
  }
  const { wholeMonths, days, invalid } = loanDurationMonthsDays(startIso, asOf);
  if (invalid) return null;
  const tFrac = effectiveMonthsFractional(wholeMonths, days);
  const tRound = effectiveMonthsRoundedUp(wholeMonths, days);
  const tExactProRata = effectiveMonthsExactProRata(wholeMonths, days);
  const r = rate / 100;
  const intSimpleExact = round2(P * r * tExactProRata);
  const intSimpleFrac = round2(P * r * tFrac);
  const intSimpleRound = round2(P * r * tRound);
  const intCompound = round2(P * (Math.pow(1 + r, tRound) - 1));

  /** After 12 month-units (same M+D÷30 convention), capitalize simple interest; then simple on new principal for the rest. */
  const ANNUAL_REST_MONTH_UNITS = 12;
  let annualRestSimple;
  if (tExactProRata <= ANNUAL_REST_MONTH_UNITS) {
    annualRestSimple = {
      phase1MonthUnits: tExactProRata,
      phase1Interest: intSimpleExact,
      principalAfterYear: P,
      phase2MonthUnits: 0,
      phase2Interest: 0,
      totalInterest: intSimpleExact,
      total: round2(P + intSimpleExact),
    };
  } else {
    const t1 = ANNUAL_REST_MONTH_UNITS;
    const t2 = tExactProRata - t1;
    const i1 = P * r * t1;
    const pAfterYear = P + i1;
    const i2 = pAfterYear * r * t2;
    const totInt = i1 + i2;
    annualRestSimple = {
      phase1MonthUnits: t1,
      phase1Interest: round2(i1),
      principalAfterYear: round2(pAfterYear),
      phase2MonthUnits: t2,
      phase2Interest: round2(i2),
      totalInterest: round2(totInt),
      total: round2(P + totInt),
    };
  }

  return {
    principal: P,
    ratePctPerMonth: rate,
    wholeMonths,
    days,
    tExactProRata,
    tFrac,
    tRound,
    intSimpleExact,
    intSimpleFrac,
    intSimpleRound,
    intCompound,
    totalSimpleExact: round2(P + intSimpleExact),
    totalSimpleFrac: round2(P + intSimpleFrac),
    totalSimpleRound: round2(P + intSimpleRound),
    totalCompound: round2(P + intCompound),
    annualRestSimple,
  };
}

function IconRedeem() {
  return (
    <svg
      className="row-action-icon__svg"
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

export default function PledgeJewelLoan() {
  const { token } = useAuth();
  const [err, setErr] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const [customer, setCustomer] = useState(null);
  const [jewelLineItems, setJewelLineItems] = useState([]);

  const [totalWeight, setTotalWeight] = useState("");
  /** When true, total weight was typed (or loaded from a saved loan); item weights do not overwrite it on Apply. */
  const totalWeightManualRef = useRef(false);
  const [touchPct, setTouchPct] = useState("91.6");
  const [interestRate, setInterestRate] = useState("2");
  const [loanAmount, setLoanAmount] = useState("");

  const [appSettings, setAppSettings] = useState(null);
  const pledgeDefaultsAppliedRef = useRef(false);

  const [boardRate, setBoardRate] = useState(null);
  const [customerLoans, setCustomerLoans] = useState([]);

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [pickerQ, setPickerQ] = useState("");
  const [debouncedPickerQ, setDebouncedPickerQ] = useState("");
  const [pickerDetail, setPickerDetail] = useState(() => emptyPickerDetail());
  const [pickerShowDetail, setPickerShowDetail] = useState(false);
  const [pickerResults, setPickerResults] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerPlaces, setPickerPlaces] = useState([]);

  const [showJewelModal, setShowJewelModal] = useState(false);
  const [jewelTypes, setJewelTypes] = useState([]);
  const [modalQtyByType, setModalQtyByType] = useState({});
  const [modalWeightByType, setModalWeightByType] = useState({});

  const [editingLoanId, setEditingLoanId] = useState(null);
  const [deleteModalLoanId, setDeleteModalLoanId] = useState(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteErr, setDeleteErr] = useState("");
  const [printJob, setPrintJob] = useState(null);
  const [itemsDetailModal, setItemsDetailModal] = useState(null);
  const [redeemModalLoan, setRedeemModalLoan] = useState(null);
  const [loanDateLocal, setLoanDateLocal] = useState(() =>
    toDatetimeLocalString(new Date())
  );
  const [redeemInterestUntilLocal, setRedeemInterestUntilLocal] = useState(() =>
    toDatetimeLocalString(new Date())
  );

  useEffect(() => {
    if (redeemModalLoan) {
      setRedeemInterestUntilLocal(toDatetimeLocalString(new Date()));
    }
  }, [redeemModalLoan?.id]);

  const worthEst = useMemo(
    () => computeWorthDisplay(totalWeight, touchPct, boardRate?.rate),
    [totalWeight, touchPct, boardRate]
  );

  const loanNum = useMemo(() => {
    const n = Number(loanAmount);
    return Number.isFinite(n) ? round2(n) : null;
  }, [loanAmount]);

  const worthStatus = useMemo(() => {
    if (worthEst == null || loanNum == null || loanNum <= 0) return null;
    /** Allowed when loan does not exceed estimated worth (collateral covers the loan). */
    if (loanNum <= worthEst) {
      return { ok: true, text: "Allowed." };
    }
    return {
      ok: false,
      text: "Loan amount is greater than estimated jewel worth — not allowed.",
    };
  }, [worthEst, loanNum]);

  const hasCustomerCopyLetterhead = useMemo(
    () => !!appSettings?.customerCopyHeaderHtml?.trim(),
    [appSettings]
  );

  const loadBoardRate = useCallback(async () => {
    try {
      const r = await api.fetchBoardRate(token);
      setBoardRate(r);
    } catch {
      setBoardRate(null);
    }
  }, [token]);

  const loadCustomerLoans = useCallback(
    async (customerId) => {
      if (!customerId) {
        setCustomerLoans([]);
        return;
      }
      try {
        setCustomerLoans(await api.fetchJewelLoansForCustomer(token, customerId));
      } catch {
        setCustomerLoans([]);
      }
    },
    [token]
  );

  useEffect(() => {
    loadBoardRate();
  }, [loadBoardRate]);

  useEffect(() => {
    pledgeDefaultsAppliedRef.current = false;
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.fetchAppSettings(token);
        if (cancelled || pledgeDefaultsAppliedRef.current) return;
        pledgeDefaultsAppliedRef.current = true;
        setAppSettings(s);
        const t = s.jewelLoanDefaultTouchPct ?? 91.6;
        const ir = s.jewelLoanDefaultInterestRate ?? 2;
        setTouchPct(String(t));
        setInterestRate(String(ir));
      } catch {
        if (!cancelled) {
          pledgeDefaultsAppliedRef.current = true;
          setAppSettings(null);
          setTouchPct("91.6");
          setInterestRate("2");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPickerQ(pickerQ.trim()), 300);
    return () => clearTimeout(t);
  }, [pickerQ]);

  useEffect(() => {
    if (!showCustomerModal) return;
    (async () => {
      try {
        setPickerPlaces(await api.fetchPlaces(token));
      } catch {
        setPickerPlaces([]);
      }
    })();
  }, [showCustomerModal, token]);

  useEffect(() => {
    if (!showCustomerModal) return;
    const detail = buildPickerDetailPayload(pickerDetail);
    const hasDetail = Object.keys(detail).length > 0;
    if (!debouncedPickerQ && !hasDetail) {
      setPickerResults([]);
      return;
    }

    let cancelled = false;
    (async () => {
      setPickerLoading(true);
      try {
        const rows = await api.fetchCustomersPicker(token, {
          q: debouncedPickerQ || undefined,
          ...detail,
        });
        if (!cancelled) setPickerResults(rows);
      } catch {
        if (!cancelled) setPickerResults([]);
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showCustomerModal, token, debouncedPickerQ, pickerDetail]);

  async function openJewelModal() {
    setErr("");
    try {
      const types = await api.fetchJewelTypes(token);
      setJewelTypes(types);
      const next = {};
      for (const row of jewelLineItems) {
        next[row.jewelTypeId] = String(row.quantity);
      }
      for (const t of types) {
        if (next[t.id] == null) next[t.id] = "";
      }
      setModalQtyByType(next);
      const wnext = {};
      for (const row of jewelLineItems) {
        const wg = row.weightGrams;
        wnext[row.jewelTypeId] =
          wg != null && Number.isFinite(round3(wg)) && round3(wg) > 0 ? String(round3(wg)) : "";
      }
      for (const t of types) {
        if (wnext[t.id] == null) wnext[t.id] = "";
      }
      setModalWeightByType(wnext);
      setShowJewelModal(true);
    } catch (e) {
      setErr(e.message);
    }
  }

  function applyJewelModal() {
    const lines = [];
    for (const t of jewelTypes) {
      const raw = modalQtyByType[t.id];
      const q = Math.floor(Number(raw));
      if (Number.isFinite(q) && q >= 1) {
        const wStr = String(modalWeightByType[t.id] ?? "").trim();
        let weightGrams = null;
        if (wStr !== "") {
          const w = round3(Number(wStr));
          if (Number.isFinite(w) && w > 0) weightGrams = w;
        }
        lines.push({
          jewelTypeId: t.id,
          jewelTypeName: t.name,
          quantity: q,
          weightGrams,
        });
      }
    }
    setJewelLineItems(lines);
    if (!totalWeightManualRef.current) {
      const sum = sumLineWeightsGrams(lines);
      if (sum > 0) {
        setTotalWeight(String(sum));
      }
    }
    setShowJewelModal(false);
  }

  function fillTotalWeightFromItems() {
    const sum = sumLineWeightsGrams(jewelLineItems);
    if (sum > 0) {
      totalWeightManualRef.current = false;
      setTotalWeight(String(sum));
    }
  }

  function resetLoanFields() {
    setEditingLoanId(null);
    setJewelLineItems([]);
    setTotalWeight("");
    totalWeightManualRef.current = false;
    const t = appSettings?.jewelLoanDefaultTouchPct ?? 91.6;
    const ir = appSettings?.jewelLoanDefaultInterestRate ?? 2;
    setTouchPct(String(t));
    setInterestRate(String(ir));
    setLoanAmount("");
    setSaveMsg("");
    setLoanDateLocal(toDatetimeLocalString(new Date()));
  }

  function startEditLoan(L) {
    setErr("");
    setSaveMsg("");
    setEditingLoanId(L.id);
    // #region agent log
    fetch("http://127.0.0.1:7898/ingest/e3daabdf-c120-457a-9150-92d7c6436aae", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "94386b" },
      body: JSON.stringify({
        sessionId: "94386b",
        hypothesisId: "H3",
        location: "PledgeJewelLoan.jsx:startEditLoan",
        message: "edit load loan date fields",
        data: { loanId: L.id, loanAsOf: L.loanAsOf ?? null, createdAt: L.createdAt ?? null },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    setLoanDateLocal(toDatetimeLocalString(L.loanAsOf || L.createdAt));
    setLoanAmount(String(L.loanAmount ?? ""));
    setTotalWeight(String(L.totalWeight ?? ""));
    totalWeightManualRef.current = true;
    setTouchPct(String(L.touchPct ?? appSettings?.jewelLoanDefaultTouchPct ?? 91.6));
    setInterestRate(String(L.interestRate ?? appSettings?.jewelLoanDefaultInterestRate ?? 2));
    setJewelLineItems(
      (L.items || []).map((it) => {
        const wg = it.weightGrams != null ? round3(it.weightGrams) : null;
        return {
          jewelTypeId: it.jewelTypeId,
          jewelTypeName: it.jewelTypeName,
          quantity: it.quantity,
          weightGrams:
            wg != null && Number.isFinite(wg) && wg > 0 ? wg : null,
        };
      })
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setSaveMsg("");
    if (!customer) {
      setErr("Select a customer.");
      return;
    }
    if (!jewelLineItems.length) {
      setErr("Add at least one jewel type with quantity.");
      return;
    }
    const tw = round3(totalWeight);
    if (!Number.isFinite(tw) || tw <= 0) {
      setErr("Enter total weight (grams, up to 3 decimals).");
      return;
    }
    const loan = round2(loanAmount);
    if (!Number.isFinite(loan) || loan <= 0) {
      setErr("Enter loan amount in rupees (2 decimals).");
      return;
    }
    const itemsPayload = jewelLineItems.map((r) => {
      const o = { jewelTypeId: r.jewelTypeId, quantity: r.quantity };
      const wg = r.weightGrams != null ? round3(r.weightGrams) : null;
      if (wg != null && Number.isFinite(wg) && wg > 0) o.weightGrams = wg;
      return o;
    });
    const defTouch = appSettings?.jewelLoanDefaultTouchPct ?? 91.6;
    const defInterest = appSettings?.jewelLoanDefaultInterestRate ?? 2;
    const payload = {
      totalWeight: tw,
      touchPct: touchPct === "" ? round3(defTouch) : round3(touchPct),
      interestRate: interestRate === "" ? round3(defInterest) : round3(interestRate),
      loanAmount: loan,
      items: itemsPayload,
      loanAsOf: dateFromDatetimeLocal(loanDateLocal).toISOString(),
    };
    // #region agent log
    fetch("http://127.0.0.1:7898/ingest/e3daabdf-c120-457a-9150-92d7c6436aae", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "94386b" },
      body: JSON.stringify({
        sessionId: "94386b",
        hypothesisId: "H1",
        location: "PledgeJewelLoan.jsx:onSubmit",
        message: "submit payload loanAsOf",
        data: {
          editingLoanId,
          loanAsOf: payload.loanAsOf,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    try {
      if (editingLoanId) {
        await api.updateJewelLoan(token, editingLoanId, payload);
        setSaveMsg("Loan updated.");
      } else {
        await api.createJewelLoan(token, { ...payload, customerId: customer.id });
        setSaveMsg("Loan saved.");
      }
      resetLoanFields();
      await loadCustomerLoans(customer.id);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function confirmDeleteLoan() {
    if (deleteModalLoanId == null) return;
    setDeleteErr("");
    // #region agent log
    fetch("http://127.0.0.1:7898/ingest/e3daabdf-c120-457a-9150-92d7c6436aae", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "94386b" },
      body: JSON.stringify({
        sessionId: "94386b",
        location: "PledgeJewelLoan.jsx:confirmDeleteLoan",
        message: "delete confirm invoked",
        data: { loanId: deleteModalLoanId, hasPassword: Boolean(deletePassword) },
        timestamp: Date.now(),
        hypothesisId: "A",
        runId: "verify-delete",
      }),
    }).catch(() => {});
    // #endregion
    try {
      await api.deleteJewelLoan(token, deleteModalLoanId, deletePassword);
      const deletedId = deleteModalLoanId;
      setDeleteModalLoanId(null);
      setDeletePassword("");
      if (editingLoanId === deletedId) {
        resetLoanFields();
      }
      if (customer?.id) await loadCustomerLoans(customer.id);
      // #region agent log
      fetch("http://127.0.0.1:7898/ingest/e3daabdf-c120-457a-9150-92d7c6436aae", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "94386b" },
        body: JSON.stringify({
          sessionId: "94386b",
          location: "PledgeJewelLoan.jsx:confirmDeleteLoan",
          message: "delete API ok",
          data: { deletedId },
          timestamp: Date.now(),
          hypothesisId: "B",
          runId: "verify-delete",
        }),
      }).catch(() => {});
      // #endregion
    } catch (e) {
      // #region agent log
      fetch("http://127.0.0.1:7898/ingest/e3daabdf-c120-457a-9150-92d7c6436aae", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "94386b" },
        body: JSON.stringify({
          sessionId: "94386b",
          location: "PledgeJewelLoan.jsx:confirmDeleteLoan",
          message: "delete API error",
          data: { errType: e?.name, errLen: String(e?.message || "").length },
          timestamp: Date.now(),
          hypothesisId: "C",
          runId: "verify-delete",
        }),
      }).catch(() => {});
      // #endregion
      setDeleteErr(e.message);
    }
  }

  async function startCustomerCopyPrint(L) {
    if (!customer) return;
    let photoObjectUrl = null;
    if (customer.hasCustomerPhoto) {
      try {
        const res = await fetch(`/api/customers/${customer.id}/file/customerPhoto`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          photoObjectUrl = URL.createObjectURL(await res.blob());
        }
      } catch {
        /* ignore */
      }
    }
    let loanQrDataUrl = null;
    try {
      loanQrDataUrl = await QRCode.toDataURL(`JEWEL-LOAN:${L.id}`, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 132,
        color: { dark: "#111111", light: "#ffffff" },
      });
    } catch {
      /* ignore */
    }
    setPrintJob({ loan: L, photoObjectUrl, loanQrDataUrl });
  }

  useEffect(() => {
    if (!printJob) return;
    const url = printJob.photoObjectUrl;
    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-pledge-print-page", "1");
    styleEl.textContent = "@page { size: A5 portrait; margin: 8mm; }";
    document.head.appendChild(styleEl);
    const onAfterPrint = () => {
      styleEl.remove();
      if (url) URL.revokeObjectURL(url);
      setPrintJob(null);
    };
    window.addEventListener("afterprint", onAfterPrint);
    const rafId = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("afterprint", onAfterPrint);
      styleEl.remove();
    };
  }, [printJob]);

  function clampDecimals(value, maxDecimals, maxLen) {
    if (value === "") return "";
    let s = value.replace(/[^\d.]/g, "");
    const dot = s.indexOf(".");
    if (dot !== -1) {
      s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
      const parts = s.split(".");
      if (parts[1] != null) {
        parts[1] = parts[1].slice(0, maxDecimals);
        s = parts[1].length ? `${parts[0]}.${parts[1]}` : `${parts[0]}.`;
      }
    }
    if (s.length > maxLen) s = s.slice(0, maxLen);
    return s;
  }

  return (
    <div>
      <div className="card">
        <h2>{editingLoanId ? `Edit jewel loan #${editingLoanId}` : "New jewel pledge loan"}</h2>
        <p className="subtitle" style={{ marginTop: 0 }}>
          Board rate is treated as INR per gram of fine (24K) gold. Jewel worth = total weight ×
          (touch ÷ 100) × board rate.
        </p>

        {boardRate?.rate == null ? (
          <p className="pledge-worth-banner pledge-worth-banner--muted">
            Set the <strong>gold board rate</strong> (admin) to estimate jewel worth here.
          </p>
        ) : worthStatus && loanNum != null && loanNum > 0 ? (
          <p
            className={
              "pledge-worth-banner " +
              (worthStatus.ok ? "pledge-worth-banner--ok" : "pledge-worth-banner--bad")
            }
          >
            Estimated worth {formatInr(worthEst)} · Loan {formatInr(loanNum)} — {worthStatus.text}
          </p>
        ) : (
          <p className="pledge-worth-banner pledge-worth-banner--muted">
            Enter weight, touch, and loan amount. Green when the loan is within estimated worth (touch
            defaults to 91.6%).
          </p>
        )}

        {err ? <p className="error">{err}</p> : null}
        {saveMsg ? (
          <p style={{ color: "var(--success)", fontSize: "0.9rem" }}>{saveMsg}</p>
        ) : null}

        <form onSubmit={onSubmit}>
          <div className="field">
            <label title="Choose who is taking the pledge loan">Customer</label>
            <div className="pledge-customer-asof-row">
              <div className="pledge-customer-asof-row__customer pledge-inline-row">
                {customer ? (
                  <span>
                    <strong>{customer.name}</strong> · ID {customer.id}
                    {customer.placeName ? ` · ${customer.placeInitial} ${customer.placeName}` : ""}
                    {customer.mobile1 ? ` · ${customer.mobile1}` : ""}
                  </span>
                ) : (
                  <span className="subtitle">None selected</span>
                )}
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={!!editingLoanId}
                  title={
                    editingLoanId ? "Cancel edit or save changes before changing customer" : undefined
                  }
                  onClick={() => {
                    setPickerQ("");
                    setDebouncedPickerQ("");
                    setPickerDetail(emptyPickerDetail());
                    setPickerShowDetail(false);
                    setPickerResults([]);
                    setShowCustomerModal(true);
                  }}
                >
                  {customer ? "Change customer" : "Select customer"}
                </button>
              </div>
              <div className="pledge-asof-field">
                <label
                  htmlFor="pledgeLoanDatetime"
                  title="Stored on this loan; used as the start date for interest in Redeem"
                >
                  Loan date &amp; time
                </label>
                <div className="pledge-asof-controls">
                  <input
                    id="pledgeLoanDatetime"
                    type="datetime-local"
                    value={loanDateLocal}
                    onChange={(e) => setLoanDateLocal(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost pledge-asof-now"
                    title="Reset to current date and time"
                    onClick={() => setLoanDateLocal(toDatetimeLocalString(new Date()))}
                  >
                    Now
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="field">
            <label title="Principal in Indian rupees; use up to 2 decimal places">
              Loan amount
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={loanAmount}
              onChange={(e) => setLoanAmount(clampDecimals(e.target.value, 2, 18))}
              placeholder="e.g. 50000.00"
            />
          </div>

          <div className="field">
            <label title="Jewel categories pledged and how many of each">Jewel items</label>
            <div className="pledge-inline-row">
              {jewelLineItems.length ? (
                <ul className="pledge-item-list">
                  {jewelLineItems.map((r) => (
                    <li key={r.jewelTypeId}>
                      {r.jewelTypeName} × {r.quantity}
                      {r.weightGrams != null &&
                      Number.isFinite(round3(r.weightGrams)) &&
                      round3(r.weightGrams) > 0
                        ? ` · ${round3(r.weightGrams)} g`
                        : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="subtitle">No items</span>
              )}
              <button type="button" className="btn btn-ghost" onClick={openJewelModal}>
                {jewelLineItems.length ? "Edit jewel types" : "Choose jewel types"}
              </button>
            </div>
          </div>

          <div className="pledge-form-grid">
            <div className="field">
              <label htmlFor="pledge-total-weight" title={TOTAL_WEIGHT_FIELD_TOOLTIP}>
                Total weight
              </label>
              <div className="pledge-total-weight-row">
                <input
                  id="pledge-total-weight"
                  type="text"
                  inputMode="decimal"
                  value={totalWeight}
                  onChange={(e) => {
                    totalWeightManualRef.current = true;
                    setTotalWeight(clampDecimals(e.target.value, 3, 16));
                  }}
                  placeholder="e.g. 25.500"
                  title={TOTAL_WEIGHT_FIELD_TOOLTIP}
                />
                <button
                  type="button"
                  className="btn btn-ghost pledge-total-from-items"
                  title="Replace total with sum of item weights (if any)"
                  onClick={fillTotalWeightFromItems}
                >
                  Use sum from items
                </button>
              </div>
            </div>
            <div className="field">
              <label title="Gold purity as a percent of fine gold (22K is often about 91.6%)">
                Touch
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={touchPct}
                onChange={(e) => setTouchPct(clampDecimals(e.target.value, 3, 8))}
                placeholder="e.g. 91.6"
              />
            </div>
            <div className="field">
              <label title="Annual interest rate in percent; up to 3 decimal places">
                Interest rate
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={interestRate}
                onChange={(e) => setInterestRate(clampDecimals(e.target.value, 3, 8))}
                placeholder="e.g. 2.000"
              />
            </div>
          </div>

          {worthEst != null && boardRate?.rate != null ? (
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 0 }}>
              Estimated jewel worth: <strong>{formatInr(worthEst)}</strong> (board ₹{formatInr(boardRate.rate)}/g fine gold)
            </p>
          ) : null}

          <div className="pledge-form-actions">
            <button type="submit" className="btn btn-primary">
              {editingLoanId ? "Update loan" : "Save loan"}
            </button>
            {editingLoanId ? (
              <button type="button" className="btn btn-ghost" onClick={resetLoanFields}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </div>

      {customer ? (
        <div className="card">
          <h3>Loans for {customer.name}</h3>
          {customerLoans.length === 0 ? (
            <p className="subtitle">No saved loans yet.</p>
          ) : (
            <div className="table-wrap table-wrap--pledge-loans">
              <table className="pledge-loans-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Weight (g)</th>
                    <th>Touch %</th>
                    <th>Interest %</th>
                    <th>Loan ₹</th>
                    <th>Worth ₹</th>
                    <th className="pledge-loans-table__th-items">Items</th>
                    <th>When</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {customerLoans.map((L) => {
                    const itemLines = loanItemLinesForLoanRow(L);
                    const itemJoined = itemLines.join(", ");
                    return (
                    <tr key={L.id}>
                      <td>{L.id}</td>
                      <td>{L.totalWeight}</td>
                      <td>{L.touchPct}</td>
                      <td>{L.interestRate}</td>
                      <td>{formatInr(L.loanAmount)}</td>
                      <td>{L.jewelWorthInr != null ? formatInr(L.jewelWorthInr) : "—"}</td>
                      <td className="pledge-loan-items-cell">
                        {!itemLines.length ? (
                          "—"
                        ) : (
                          <button
                            type="button"
                            className="pledge-loan-items-cell__btn"
                            aria-label={`View jewel items for loan ${L.id}`}
                            onClick={() =>
                              setItemsDetailModal({ loanId: L.id, lines: itemLines })
                            }
                          >
                            <span className="pledge-loan-items-cell__preview">{itemJoined}</span>
                          </button>
                        )}
                      </td>
                      <td style={{ fontSize: "0.8rem" }}>
                        {loanRecordStartIso(L)
                          ? new Date(loanRecordStartIso(L)).toLocaleString("en-IN", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-ghost row-action-icon"
                            title="Edit loan"
                            aria-label="Edit loan"
                            onClick={() => startEditLoan(L)}
                          >
                            <IconEdit />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost row-action-icon"
                            title="Print customer copy"
                            aria-label="Print customer copy"
                            onClick={() => startCustomerCopyPrint(L)}
                          >
                            <IconPrint />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost row-action-icon"
                            title="Redeem — interest estimate"
                            aria-label="Redeem — interest estimate"
                            onClick={() => setRedeemModalLoan(L)}
                          >
                            <IconRedeem />
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger row-action-icon"
                            title="Delete loan"
                            aria-label="Delete loan"
                            onClick={() => {
                              setDeleteErr("");
                              setDeletePassword("");
                              setDeleteModalLoanId(L.id);
                            }}
                          >
                            <IconTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {itemsDetailModal ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pledge-items-modal-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setItemsDetailModal(null);
          }}
        >
          <div className="modal-panel">
            <h3 id="pledge-items-modal-title">
              Jewel items — Loan #{itemsDetailModal.loanId}
            </h3>
            <p className="subtitle" style={{ marginTop: 0 }}>
              Description × quantity for each pledged line.
            </p>
            <ul className="pledge-items-modal-list">
              {itemsDetailModal.lines.map((line, i) => (
                <li key={`${itemsDetailModal.loanId}-m-${i}`}>{line}</li>
              ))}
            </ul>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setItemsDetailModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {redeemModalLoan ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="redeem-modal-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setRedeemModalLoan(null);
          }}
        >
          <div className="modal-panel modal-panel--wide redeem-modal">
            <h3 id="redeem-modal-title">Redeem — Loan #{redeemModalLoan.id}</h3>
            <div className="redeem-modal__until-row">
              <label htmlFor="redeemInterestUntil" className="redeem-modal__until-label">
                Interest calculated until
              </label>
              <div className="pledge-asof-controls">
                <input
                  id="redeemInterestUntil"
                  type="datetime-local"
                  value={redeemInterestUntilLocal}
                  onChange={(e) => setRedeemInterestUntilLocal(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-ghost pledge-asof-now"
                  title="Reset to current date and time"
                  onClick={() =>
                    setRedeemInterestUntilLocal(toDatetimeLocalString(new Date()))
                  }
                >
                  Now
                </button>
              </div>
            </div>
            <p className="subtitle redeem-modal__intro">
              Interest rate is <strong>per month</strong> (%). Duration is from{" "}
              <strong>loan date</strong> to{" "}
              <strong>interest until</strong> (
              {dateFromDatetimeLocal(redeemInterestUntilLocal).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Kolkata",
              })}
              ). The <strong>exact days</strong> method uses{" "}
              <strong>{PRO_RATA_DAYS_PER_MONTH} days = 1 month</strong> for the day fraction.
              Estimates only — not a legal settlement.
            </p>
            {(() => {
              const calc = computeRedeemPreview(
                redeemModalLoan,
                dateFromDatetimeLocal(redeemInterestUntilLocal)
              );
              if (!calc) {
                return (
                  <p className="error">
                    Could not compute duration or interest (check loan amount, rate, and loan date).
                  </p>
                );
              }
              return (
                <>
                  <div className="redeem-modal__summary">
                    <span>
                      <strong>Principal</strong> {formatInr(calc.principal)}
                    </span>
                    <span>
                      <strong>Rate</strong> {calc.ratePctPerMonth}% / month
                    </span>
                    <span>
                      <strong>Loan from</strong>{" "}
                      {formatLoanDateTime(loanRecordStartIso(redeemModalLoan))}
                    </span>
                  </div>
                  <div className="redeem-modal__tables">
                    <div className="redeem-interest-card">
                      <h4 className="redeem-interest-card__title">Month + exact days (pro-rata)</h4>
                      <p className="redeem-interest-card__rule">
                        Uses the calendar split only: <strong>M</strong> full months + <strong>D</strong>{' '}
                        days → interest time = <strong>M + D÷30</strong> month-units (e.g. 1 month 2 days
                        → 1 + 2/30). Simple interest.
                      </p>
                      <table className="redeem-interest-table">
                        <tbody>
                          <tr>
                            <th scope="row">Duration</th>
                            <td>
                              {calc.wholeMonths} mo {calc.days} day{calc.days !== 1 ? "s" : ""}
                            </td>
                          </tr>
                          <tr>
                            <th scope="row">Month-units (M + D÷30)</th>
                            <td>{Number(calc.tExactProRata.toFixed(6)).toString()}</td>
                          </tr>
                          <tr>
                            <th scope="row">Interest</th>
                            <td>{formatInr(calc.intSimpleExact)}</td>
                          </tr>
                          <tr>
                            <th scope="row">Principal + interest</th>
                            <td>
                              <strong>{formatInr(calc.totalSimpleExact)}</strong>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="redeem-interest-card">
                      <h4 className="redeem-interest-card__title">Month + partial days</h4>
                      <p className="redeem-interest-card__rule">
                        Extra 1–15 days → <strong>+½</strong> month; 16+ days → <strong>+1</strong>{" "}
                        month. Simple interest.
                      </p>
                      <table className="redeem-interest-table">
                        <tbody>
                          <tr>
                            <th scope="row">Duration</th>
                            <td>
                              {calc.wholeMonths} mo {calc.days} day{calc.days !== 1 ? "s" : ""}
                            </td>
                          </tr>
                          <tr>
                            <th scope="row">Months for interest</th>
                            <td>{calc.tFrac}</td>
                          </tr>
                          <tr>
                            <th scope="row">Interest</th>
                            <td>{formatInr(calc.intSimpleFrac)}</td>
                          </tr>
                          <tr>
                            <th scope="row">Principal + interest</th>
                            <td>
                              <strong>{formatInr(calc.totalSimpleFrac)}</strong>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="redeem-interest-card">
                      <h4 className="redeem-interest-card__title">Rounded full months</h4>
                      <p className="redeem-interest-card__rule">
                        Any extra days after full months → count as <strong>one extra</strong> full
                        month. Simple interest.
                      </p>
                      <table className="redeem-interest-table">
                        <tbody>
                          <tr>
                            <th scope="row">Duration</th>
                            <td>
                              {calc.wholeMonths} mo {calc.days} day{calc.days !== 1 ? "s" : ""}
                            </td>
                          </tr>
                          <tr>
                            <th scope="row">Months for interest</th>
                            <td>{calc.tRound}</td>
                          </tr>
                          <tr>
                            <th scope="row">Interest</th>
                            <td>{formatInr(calc.intSimpleRound)}</td>
                          </tr>
                          <tr>
                            <th scope="row">Principal + interest</th>
                            <td>
                              <strong>{formatInr(calc.totalSimpleRound)}</strong>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="redeem-interest-card">
                      <h4 className="redeem-interest-card__title">Compound (monthly)</h4>
                      <p className="redeem-interest-card__rule">
                        Interest added each month; rate <strong>per month</strong>. Period ={" "}
                        <strong>rounded-up</strong> month count (same as middle column).
                      </p>
                      <table className="redeem-interest-table">
                        <tbody>
                          <tr>
                            <th scope="row">Compounding periods</th>
                            <td>{calc.tRound} month{calc.tRound !== 1 ? "s" : ""}</td>
                          </tr>
                          <tr>
                            <th scope="row">Interest accrued</th>
                            <td>{formatInr(calc.intCompound)}</td>
                          </tr>
                          <tr>
                            <th scope="row">Principal + interest</th>
                            <td>
                              <strong>{formatInr(calc.totalCompound)}</strong>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="redeem-interest-card">
                      <h4 className="redeem-interest-card__title">
                        Annual rest — simple then capitalize
                      </h4>
                      <p className="redeem-interest-card__rule">
                        First <strong>12</strong> month-units (same <strong>M + D÷30</strong> as the
                        pro-rata column): simple on original principal. That interest is{" "}
                        <strong>added to principal</strong>. Any remaining month-units: simple on the
                        increased amount. If total time ≤ 12 month-units, same as straight simple
                        pro-rata.
                      </p>
                      <table className="redeem-interest-table">
                        <tbody>
                          <tr>
                            <th scope="row">Phase 1 (month-units)</th>
                            <td>
                              {Number(calc.annualRestSimple.phase1MonthUnits.toFixed(6)).toString()}
                            </td>
                          </tr>
                          <tr>
                            <th scope="row">Phase 1 interest</th>
                            <td>{formatInr(calc.annualRestSimple.phase1Interest)}</td>
                          </tr>
                          <tr>
                            <th scope="row">Principal after year 1</th>
                            <td>{formatInr(calc.annualRestSimple.principalAfterYear)}</td>
                          </tr>
                          <tr>
                            <th scope="row">Phase 2 (month-units)</th>
                            <td>
                              {Number(calc.annualRestSimple.phase2MonthUnits.toFixed(6)).toString()}
                            </td>
                          </tr>
                          <tr>
                            <th scope="row">Phase 2 interest</th>
                            <td>{formatInr(calc.annualRestSimple.phase2Interest)}</td>
                          </tr>
                          <tr>
                            <th scope="row">Total interest</th>
                            <td>{formatInr(calc.annualRestSimple.totalInterest)}</td>
                          </tr>
                          <tr>
                            <th scope="row">Principal + interest</th>
                            <td>
                              <strong>{formatInr(calc.annualRestSimple.total)}</strong>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              );
            })()}
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setRedeemModalLoan(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteModalLoanId != null ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-loan-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setDeleteModalLoanId(null);
              setDeletePassword("");
              setDeleteErr("");
            }
          }}
        >
          <div className="modal-panel">
            <h3 id="delete-loan-title">Delete loan #{deleteModalLoanId}</h3>
            <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>
              Enter your <strong>login password</strong> to confirm deletion. This cannot be undone.
            </p>
            {deleteErr ? <p className="error">{deleteErr}</p> : null}
            <div className="field">
              <label title="Same password you use to sign in">Password</label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-danger"
                disabled={!deletePassword}
                onClick={confirmDeleteLoan}
              >
                Delete loan
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setDeleteModalLoanId(null);
                  setDeletePassword("");
                  setDeleteErr("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCustomerModal ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="picker-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setShowCustomerModal(false);
            }
          }}
        >
          <div className="modal-panel modal-panel--wide">
            <h3 id="picker-title">Select customer</h3>
            <p style={{ color: "var(--muted)", fontSize: "0.82rem", marginTop: 0 }}>
              <strong>#</strong> and digits (e.g. <strong>#12</strong>) search by customer ID.{" "}
              <strong>@</strong> and text (e.g. <strong>@ravi</strong>) search customer name only.
              Otherwise the query searches name, mobile, place, IDs, address, and related fields. Use
              advanced search for structured filters.
            </p>
            <div className="field">
              <label>Search</label>
              <input
                value={pickerQ}
                onChange={(e) => setPickerQ(e.target.value)}
                placeholder="#12 · @name · or any keyword…"
                autoFocus
              />
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginBottom: "0.5rem" }}
              onClick={() => setPickerShowDetail((v) => !v)}
            >
              {pickerShowDetail ? "Hide advanced search" : "Advanced search"}
            </button>
            {pickerShowDetail ? (
              <div className="detail-search-grid pledge-picker-detail">
                <div className="field">
                  <label>Name</label>
                  <input
                    value={pickerDetail.name}
                    onChange={(e) => setPickerDetail({ ...pickerDetail, name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Father name</label>
                  <input
                    value={pickerDetail.fatherName}
                    onChange={(e) =>
                      setPickerDetail({ ...pickerDetail, fatherName: e.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label>Address</label>
                  <input
                    value={pickerDetail.address}
                    onChange={(e) => setPickerDetail({ ...pickerDetail, address: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Mobile</label>
                  <input
                    value={pickerDetail.mobile}
                    onChange={(e) => setPickerDetail({ ...pickerDetail, mobile: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Place</label>
                  <select
                    value={pickerDetail.placeId}
                    onChange={(e) =>
                      setPickerDetail({ ...pickerDetail, placeId: e.target.value })
                    }
                  >
                    <option value="">Any place</option>
                    {pickerPlaces.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.initial} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>PAN</label>
                  <input
                    value={pickerDetail.pan}
                    onChange={(e) => setPickerDetail({ ...pickerDetail, pan: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Aadhar</label>
                  <input
                    value={pickerDetail.aadhar}
                    onChange={(e) => setPickerDetail({ ...pickerDetail, aadhar: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>PIN code</label>
                  <input
                    value={pickerDetail.pinCode}
                    onChange={(e) =>
                      setPickerDetail({ ...pickerDetail, pinCode: e.target.value })
                    }
                  />
                </div>
              </div>
            ) : null}
            {pickerLoading ? <p className="subtitle">Searching…</p> : null}
            <ul className="pledge-picker-results">
              {pickerResults.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="pledge-picker-row"
                    onClick={() => {
                      setCustomer(r);
                      setShowCustomerModal(false);
                      loadCustomerLoans(r.id);
                    }}
                  >
                    <strong>#{r.id}</strong> {r.name} · {r.fatherName}
                    {r.placeName ? ` · ${r.placeInitial} ${r.placeName}` : ""}
                    {r.mobile1 ? ` · ${r.mobile1}` : ""}
                  </button>
                </li>
              ))}
            </ul>
            {!pickerLoading &&
            pickerResults.length === 0 &&
            (debouncedPickerQ || Object.keys(buildPickerDetailPayload(pickerDetail)).length > 0) ? (
              <p className="subtitle">No matches.</p>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowCustomerModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showJewelModal ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jewel-modal-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowJewelModal(false);
          }}
        >
          <div className="modal-panel modal-panel--wide">
            <h3 id="jewel-modal-title">Jewel types, counts &amp; weight</h3>
            <p style={{ color: "var(--muted)", fontSize: "0.82rem", marginTop: 0 }}>
              Quantity and weight (grams) per type. Only rows with quantity ≥ 1 are included. Total
              weight on the form updates from the sum of line weights when you apply, unless you typed
              a custom total.
            </p>
            <div className="pledge-jewel-grid-wrap">
              <div className="pledge-jewel-grid">
                {jewelTypes.map((t) => (
                  <div className="pledge-jewel-cell" key={t.id}>
                    <span className="pledge-jewel-type-name" title={t.name}>
                      {t.name}
                    </span>
                    <div className="pledge-jewel-inputs-row">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="pledge-jewel-qty-input"
                        title="Quantity to pledge"
                        value={modalQtyByType[t.id] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                          setModalQtyByType({ ...modalQtyByType, [t.id]: v });
                        }}
                        placeholder="Qty"
                        aria-label={`Quantity for ${t.name}`}
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        className="pledge-jewel-weight-input"
                        title="Weight in grams for this type (optional)"
                        value={modalWeightByType[t.id] ?? ""}
                        onChange={(e) =>
                          setModalWeightByType({
                            ...modalWeightByType,
                            [t.id]: clampDecimals(e.target.value, 3, 12),
                          })
                        }
                        placeholder="g"
                        aria-label={`Weight in grams for ${t.name}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={applyJewelModal}>
                Apply
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowJewelModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {printJob && customer ? (
        <div className="customer-copy-print-root" aria-hidden="true">
          <div className="customer-copy-print">
            <div
              className={
                "customer-copy-print__masthead" +
                (hasCustomerCopyLetterhead
                  ? ""
                  : " customer-copy-print__masthead--customer-only")
              }
            >
              {hasCustomerCopyLetterhead ? (
                <div className="customer-copy-print__masthead-left">
                  <div
                    className="customer-copy-print__richtext customer-copy-print__richtext--header"
                    dangerouslySetInnerHTML={{
                      __html: appSettings.customerCopyHeaderHtml,
                    }}
                  />
                </div>
              ) : null}
              <div
                className={
                  "customer-copy-print__masthead-right" +
                  (hasCustomerCopyLetterhead
                    ? ""
                    : " customer-copy-print__masthead-right--full")
                }
              >
                <div className="customer-copy-print__top">
                  <div className="customer-copy-print__photo-wrap">
                    {printJob.photoObjectUrl ? (
                      <img
                        src={printJob.photoObjectUrl}
                        alt=""
                        className="customer-copy-print__photo"
                      />
                    ) : (
                      <div className="customer-copy-print__photo-placeholder">No photo</div>
                    )}
                  </div>
                  <dl className="customer-copy-print__details">
                    <dt>Name</dt>
                    <dd>{customer.name}</dd>
                    <dt>Father&apos;s name</dt>
                    <dd>{customer.fatherName}</dd>
                    <dt>Address</dt>
                    <dd>{customer.address}</dd>
                    <dt>Place</dt>
                    <dd>
                      {[customer.placeInitial, customer.placeName].filter(Boolean).join(" ") || "—"}
                    </dd>
                    <dt>Mobile</dt>
                    <dd>
                      {[customer.mobile1, customer.mobile2].filter(Boolean).join(" · ") || "—"}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className="customer-copy-print__loan">
              <h1 className="customer-copy-print__title">Jewel pledge — Customer copy</h1>
              <p className="customer-copy-print__meta">
                Loan #<strong>{printJob.loan.id}</strong>
              </p>
              <p className="customer-copy-print__meta customer-copy-print__meta--datetime">
                <strong>Loan date &amp; time:</strong>{" "}
                {formatLoanDateTime(loanRecordStartIso(printJob.loan))}
              </p>
              <div className="customer-copy-print__table-section">
                <div className="customer-copy-print__table-heading">
                  <span className="customer-copy-print__table-heading-title">Jewel details</span>
                  {printJob.loanQrDataUrl ? (
                    <img
                      src={printJob.loanQrDataUrl}
                      alt=""
                      className="customer-copy-print__qr"
                    />
                  ) : null}
                </div>
                <table
                  className="customer-copy-print__table"
                  aria-label="Jewel line items and quantities"
                >
                  <thead>
                    <tr>
                      <th scope="col">Description</th>
                      <th scope="col" className="customer-copy-print__num">
                        Qty
                      </th>
                      <th scope="col" className="customer-copy-print__num">
                        Wt (g)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(printJob.loan.items || []).map((it) => (
                      <tr key={it.jewelTypeId}>
                        <td>{jewelItemPrintLabel(it)}</td>
                        <td className="customer-copy-print__num">{it.quantity}</td>
                        <td className="customer-copy-print__num">
                          {it.weightGrams != null && Number.isFinite(round3(it.weightGrams))
                            ? round3(it.weightGrams)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="customer-copy-print__totals">
                <div>
                  <span className="customer-copy-print__totals-label">Total qty (pieces)</span>
                  <span className="customer-copy-print__totals-value">
                    {totalJewelQty(printJob.loan.items)}
                  </span>
                </div>
                <div>
                  <span className="customer-copy-print__totals-label">Total weight (g)</span>
                  <span className="customer-copy-print__totals-value">{printJob.loan.totalWeight}</span>
                </div>
                <div>
                  <span className="customer-copy-print__totals-label">Loan amount</span>
                  <span className="customer-copy-print__totals-value">
                    {formatInr(printJob.loan.loanAmount)}
                  </span>
                </div>
              </div>
            </div>
            {appSettings?.customerCopyTermsHtml?.trim() ? (
              <div
                className="customer-copy-print__richtext customer-copy-print__richtext--terms"
                dangerouslySetInnerHTML={{
                  __html: appSettings.customerCopyTermsHtml,
                }}
              />
            ) : null}
            {appSettings?.customerCopyFooterHtml?.trim() ? (
              <div
                className="customer-copy-print__richtext customer-copy-print__richtext--footer"
                dangerouslySetInnerHTML={{
                  __html: appSettings.customerCopyFooterHtml,
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
