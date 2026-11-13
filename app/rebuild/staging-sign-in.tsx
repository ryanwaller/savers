"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function StagingSignIn({ staging }: { staging: boolean }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("auth") === "error") {
      window.setTimeout(() => setMessage("Sign-in did not complete. Please try again."), 0);
    }
    const token = new URLSearchParams(window.location.hash.slice(1)).get("savers-capture");
    if (token && /^[A-Fa-f0-9-]{72}$/.test(token)) {
      localStorage.setItem("savers.rebuild.macCaptureToken", token);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  async function signInWithGoogle() {
    setGoogleBusy(true);
    setMessage("");
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=/rebuild`;
      const { data, error } = await getSupabaseBrowserClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Google sign-in could not start.");
      const oauthUrl = new URL(data.url);
      oauthUrl.searchParams.set("redirect_to", redirectTo);
      window.location.assign(oauthUrl.toString());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start Google sign-in.");
      setGoogleBusy(false);
    }
  }

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
      <button className="rb-staging-google" type="button" onClick={() => { void signInWithGoogle(); }} disabled={googleBusy || busy}>{googleBusy ? "Opening Google…" : "Continue with Google"}</button>
      <div className="rb-staging-sign-in-divider"><span>or use email</span></div>
      <form onSubmit={sendLink}>
        <label htmlFor="rb-staging-email">Email</label>
        <input id="rb-staging-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <button type="submit" disabled={busy || googleBusy}>{busy ? "Sending…" : "Send sign-in link"}</button>
      </form>
      {message && <p role="status">{message}</p>}
    </div>
  </main>;
}
