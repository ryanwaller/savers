"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function StagingSignIn() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const { error } = await getSupabaseBrowserClient().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/rebuild` },
      });
      setMessage(error ? error.message : "Check your email for a sign-in link to this separate Savers copy.");
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
      <p>Sign in to the separate Rebuild copy. Your existing Savers library stays where it is.</p>
      <form onSubmit={sendLink}>
        <label htmlFor="rb-staging-email">Email</label>
        <input id="rb-staging-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <button type="submit" disabled={busy}>{busy ? "Sending…" : "Send sign-in link"}</button>
      </form>
      {message && <p role="status">{message}</p>}
    </div>
  </main>;
}
