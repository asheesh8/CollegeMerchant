"use client";
// Small helpers shared by the portal pages.

export async function api(path, method = "GET", body, { timeoutMs = 60000 } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e.name === "TimeoutError") throw new Error("This took too long, so it was stopped. Try again in a minute.");
    throw new Error("Couldn't reach the site. Check your internet connection.");
  }
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Signed out.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 504) throw new Error("That took longer than the server allows. Try again.");
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export function when(iso, opts = { dateStyle: "medium", timeStyle: "short" }) {
  return iso ? new Date(iso).toLocaleString([], opts) : "";
}

export const STATUS = {
  new: ["New", "gray"],
  finding: ["Looking…", "gray"],
  no_email: ["No email found", "warn"],
  found: ["Email found", "blue"],
  drafted: ["Ready to review", "blue"],
  approved: ["Approved", "green"],
  sent: ["Sent", "green"],
  replied: ["Replied", "green"],
  declined: ["Said no", "gray"],
  skipped: ["Skipped", "gray"],
  error: ["Problem", "bad"],
};

export function StatusPill({ status }) {
  const [label, tone] = STATUS[status] || [status, "gray"];
  return <span className={`pill ${tone}`}>{label}</span>;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
