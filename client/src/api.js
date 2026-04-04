const base = "/api";

function authHeaders(token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function handle(res) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = data?.error || res.statusText || "Request failed";
    throw new Error(msg);
  }
  return data;
}

export async function login(username, password) {
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ username, password }),
  });
  return handle(res);
}

export async function me(token) {
  const res = await fetch(`${base}/auth/me`, {
    headers: authHeaders(token),
  });
  return handle(res);
}

export async function fetchUsers(token) {
  const res = await fetch(`${base}/users`, { headers: authHeaders(token) });
  return handle(res);
}

export async function fetchRoles(token) {
  const res = await fetch(`${base}/users/roles/list`, {
    headers: authHeaders(token),
  });
  return handle(res);
}

export async function createUser(token, body) {
  const res = await fetch(`${base}/users`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  return handle(res);
}

export async function updateUser(token, id, body) {
  const res = await fetch(`${base}/users/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  return handle(res);
}

export async function deleteUser(token, id) {
  const res = await fetch(`${base}/users/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (res.status === 204) return null;
  return handle(res);
}

export async function fetchJewelTypes(token) {
  const res = await fetch(`${base}/jewel-types`, {
    headers: authHeaders(token),
  });
  return handle(res);
}

export async function createJewelType(token, body) {
  const res = await fetch(`${base}/jewel-types`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  return handle(res);
}

export async function updateJewelType(token, id, body) {
  const res = await fetch(`${base}/jewel-types/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  return handle(res);
}

export async function deleteJewelType(token, id) {
  const res = await fetch(`${base}/jewel-types/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (res.status === 204) return null;
  return handle(res);
}

export async function fetchPlaces(token) {
  const res = await fetch(`${base}/places`, { headers: authHeaders(token) });
  return handle(res);
}

export async function createPlace(token, body) {
  const res = await fetch(`${base}/places`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  return handle(res);
}

export async function updatePlace(token, id, body) {
  const res = await fetch(`${base}/places/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  return handle(res);
}

export async function deletePlace(token, id) {
  const res = await fetch(`${base}/places/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (res.status === 204) return null;
  return handle(res);
}

export async function fetchBoardRate(token) {
  const res = await fetch(`${base}/board-rate`, { headers: authHeaders(token) });
  return handle(res);
}

export async function fetchBoardRateHistory(token) {
  const res = await fetch(`${base}/board-rate/history`, {
    headers: authHeaders(token),
  });
  return handle(res);
}

export async function updateBoardRate(token, body) {
  const res = await fetch(`${base}/board-rate`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  return handle(res);
}

function authMultipart(token) {
  const h = {};
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function fetchCustomers(token, opts = {}) {
  const p = new URLSearchParams();
  if (typeof opts === "string") {
    if (opts) p.set("q", opts);
  } else {
    if (opts.q) p.set("q", opts.q);
    if (opts.name) p.set("name", opts.name);
    if (opts.fatherName) p.set("fatherName", opts.fatherName);
    if (opts.address) p.set("address", opts.address);
    if (opts.mobile) p.set("mobile", opts.mobile);
    if (opts.placeId) p.set("placeId", String(opts.placeId));
    if (opts.pan) p.set("pan", opts.pan);
    if (opts.aadhar) p.set("aadhar", opts.aadhar);
    if (opts.pinCode) p.set("pinCode", opts.pinCode);
  }
  const qs = p.toString();
  const res = await fetch(`${base}/customers${qs ? `?${qs}` : ""}`, {
    headers: authHeaders(token),
  });
  return handle(res);
}

export async function fetchCustomerReferrers(token, { q, excludeId } = {}) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (excludeId != null) p.set("excludeId", String(excludeId));
  const res = await fetch(`${base}/customers/referrers?${p}`, {
    headers: authHeaders(token),
  });
  return handle(res);
}

export async function createCustomer(token, formData) {
  const res = await fetch(`${base}/customers`, {
    method: "POST",
    headers: authMultipart(token),
    body: formData,
  });
  return handle(res);
}

export async function updateCustomer(token, id, formData) {
  const res = await fetch(`${base}/customers/${id}`, {
    method: "PUT",
    headers: authMultipart(token),
    body: formData,
  });
  return handle(res);
}

export async function deleteCustomer(token, id) {
  const res = await fetch(`${base}/customers/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (res.status === 204) return null;
  return handle(res);
}

export async function downloadCustomerProof(token, customerId, kind) {
  const res = await fetch(`${base}/customers/${customerId}/file/${kind}`, {
    headers: authMultipart(token),
  });
  if (!res.ok) {
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    throw new Error(data?.error || res.statusText || "Download failed");
  }
  return res.blob();
}
