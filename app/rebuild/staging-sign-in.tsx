"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function StagingSignIn({ staging }: { staging: boolean }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("savers-capture");
    if (token && /^[A-Fa-f0-9-]{72}$/.test(token)) {
      localStorage.setItem("savers.rebuild.macCaptureToken", token);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  async function sendLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const { error } = await getSupabaseBrowserClient().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/rebuild` },
      });
      setMessage(error ? error.message : "Check your email for a Savers sign-in link.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send a sign-in link.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="rb-staging-sign-in">
    <div className="rb-staging-sign-in-card">
      <span className="rb-mark-glyph" aria-hidden="true">✳</span>
      <h1>Welcome to Savers</h1>
      <p>{staging ? "Sign in to the separate Rebuild copy. Your existing Savers library stays where it is." : "Sign in to your Savers library."}</p>
      <form onSubmit={sendLink}>
        <label htmlFor="rb-staging-email">Email</label>
        <input id="rb-staging-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <button type="submit" disabled={busy}>{busy ? "Sending…" : "Send sign-in link"}</button>
      </form>
      {message && <p role="status">{message}</p>}
    </div>
  </main>;
}
