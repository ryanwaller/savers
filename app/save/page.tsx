"use client";

import { useEffect, useState } from "react";

export default function SavePage() {
  const [state, setState] = useState<"loading" | "saved" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    // Primary: explicit URL param (from javascript: wrapper). Fallback: referrer (same-tab click).
    const sourceUrl = params.get("u") || document.referrer;

    if (!sourceUrl) {
      setState("error");
      setError(
        "Could not detect which page to save. Left-click the bookmark (not Ctrl+click) so the browser can tell us which page you came from.",
      );
      return;
    }

    // Only navigate back if we arrived via same-tab navigation (referrer present, not u param)
    const canGoBack = !params.get("u") && document.referrer === sourceUrl;

    const controller = new AbortController();

    async function save() {
      try {
        const res = await fetch("/api/bookmarks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: "include",
          body: JSON.stringify({
            url: sourceUrl,
            tags: [],
            collection_id: null,
            source: "bookmark",
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `HTTP ${res.status}`);
        }

        setState("saved");
        setTimeout(() => {
          if (canGoBack && window.history.length > 1) {
            window.history.back();
          } else {
            window.close();
          }
        }, 1000);
      } catch (err) {
        if (controller.signal.aborted) return;
        setState("error");
        setError(err instanceof Error ? err.message : "Save failed");
      }
    }

    save();

    return () => controller.abort();
  }, []);

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #111; }
      `}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: 24,
          background: "#111",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            background: "#1a1a1a",
            border: "1px solid #2a2a2a",
            borderRadius: 14,
            padding: "36px 28px",
            maxWidth: 360,
            width: "100%",
            textAlign: "center",
            color: "#ececec",
          }}
        >
          <div style={{ marginBottom: 16 }}>
            {state === "loading" ? (
              <svg
                width="40"
                height="40"
                viewBox="0 0 128 128"
                fill="none"
                style={{ opacity: 0.8 }}
              >
                <rect width="128" height="128" rx="24" fill="none" />
                <rect x="14" y="34" width="24" height="24" rx="2" fill="#D9261C" />
                <rect x="52" y="16" width="24" height="64" rx="2" fill="#D9261C" />
                <rect x="90" y="34" width="24" height="24" rx="2" fill="#D9261C" />
                <rect x="20" y="92" width="88" height="20" rx="2" fill="#D9261C" />
              </svg>
            ) : state === "saved" ? (
              <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
              >
                <circle cx="20" cy="20" r="18" fill="#1f6f43" />
                <path
                  d="M11 20l6 6 12-12"
                  stroke="#fff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
              >
                <circle cx="20" cy="20" r="18" fill="#8b1e1e" />
                <path
                  d="M14 14l12 12M26 14l-12 12"
                  stroke="#fff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </div>

          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              marginBottom: 6,
              color: state === "error" ? "#ff8f8f" : "#ececec",
            }}
          >
            {state === "loading"
              ? "Saving…"
              : state === "saved"
                ? "Saved!"
                : "Save failed"}
          </div>

          {state === "saved" && (
            <p style={{ fontSize: 13, color: "#6b6b6b", lineHeight: 1.5 }}>
              Going back to your page…
            </p>
          )}

          {state === "error" && (
            <p style={{ fontSize: 13, color: "#9b9b9b", lineHeight: 1.5 }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
