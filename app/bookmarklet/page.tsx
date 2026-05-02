"use client";

const BOOKMARKLET_SRC = "https://savers-production.up.railway.app/bookmarklet.js";

function buildBookmarkletHref(): string {
  return `javascript:(function(){var s=document.createElement('script');s.src='${BOOKMARKLET_SRC}';document.head.appendChild(s);})();`;
}

export default function BookmarkletPage() {
  const href = buildBookmarkletHref();

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <svg width="48" height="48" viewBox="0 0 128 128" fill="none">
            <rect width="128" height="128" rx="24" fill="none" />
            <rect x="14" y="34" width="24" height="24" rx="2" fill="#D9261C" />
            <rect x="52" y="16" width="24" height="64" rx="2" fill="#D9261C" />
            <rect x="90" y="34" width="24" height="24" rx="2" fill="#D9261C" />
            <rect x="20" y="92" width="88" height="20" rx="2" fill="#D9261C" />
          </svg>
        </div>

        <h1 style={styles.heading}>Savers Bookmarklet</h1>
        <p style={styles.sub}>
          Drag the button below to your bookmarks bar. Click it on any page to save it to Savers.
        </p>

        <a
          href={href}
          style={styles.button}
        >
          Save to Savers
        </a>

        <p style={styles.hint}>
          Can&apos;t see your bookmarks bar? Press{" "}
          <kbd style={styles.kbd}>Ctrl+Shift+B</kbd> (Windows) or{" "}
          <kbd style={styles.kbd}>⌘+Shift+B</kbd> (Mac).
        </p>

        <details style={styles.details}>
          <summary style={styles.summary}>Need a token for the bookmarklet?</summary>
          <p style={styles.detailText}>
            Open Savers → Settings → API tokens → Create token for bookmarklet. Then copy the
            bookmarklet code from there. The token is embedded directly into the code so it works
            across browsers even with third-party cookie restrictions.
          </p>
        </details>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "24px",
    background: "#111",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: "16px",
    padding: "40px 32px",
    maxWidth: "420px",
    width: "100%",
    textAlign: "center" as const,
    color: "#ececec",
  },
  logo: {
    marginBottom: "16px",
  },
  heading: {
    fontSize: "22px",
    fontWeight: 700,
    margin: "0 0 8px",
    color: "#ececec",
  },
  sub: {
    fontSize: "14px",
    color: "#9b9b9b",
    margin: "0 0 28px",
    lineHeight: 1.5,
  },
  button: {
    display: "inline-block",
    padding: "12px 32px",
    background: "#D9261C",
    color: "#fff",
    fontSize: "16px",
    fontWeight: 600,
    borderRadius: "10px",
    textDecoration: "none",
    cursor: "grab",
    boxShadow: "0 4px 16px rgba(217, 38, 28, 0.3)",
    marginBottom: "20px",
  },
  hint: {
    fontSize: "13px",
    color: "#6b6b6b",
    margin: "0 0 20px",
  },
  kbd: {
    background: "#2a2a2a",
    border: "1px solid #3a3a3a",
    borderRadius: "4px",
    padding: "1px 6px",
    fontSize: "12px",
    fontFamily: "inherit",
  },
  details: {
    textAlign: "left" as const,
    fontSize: "13px",
    color: "#9b9b9b",
  },
  summary: {
    cursor: "pointer",
    color: "#6b6b6b",
    marginBottom: "8px",
  },
  detailText: {
    margin: "0",
    lineHeight: 1.5,
    fontSize: "13px",
  },
};
