"use client";
import { useState } from "react";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) window.location.href = "/";
    else setError(data.error || "Couldn't sign in.");
  }

  return (
    <main className="login">
      <div className="panel">
        <h1 style={{ marginBottom: 4 }}>CollegeMerchant</h1>
        <p className="muted small" style={{ marginTop: 0 }}>This page holds your email passwords, so it's locked.</p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="pw">Admin password</label>
            <input id="pw" type="password" autoFocus autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="primary" disabled={busy || !password}>{busy ? "Signing in…" : "Sign in"}</button>
          {error && <div className="note bad">{error}</div>}
        </form>
      </div>
    </main>
  );
}
