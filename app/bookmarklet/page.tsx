"use client";

import { useState } from "react";

const API_BASE = "https://savers-production.up.railway.app";
const SCRIPT = `javascript:(function(){var s=document.createElement('script');s.src='${API_BASE}/bookmarklet.js';document.head.appendChild(s);})();`;

export default function BookmarkletPage() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(SCRIPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <main className="bookmarklet-page">
        <h1 className="bookmarklet-heading">Savers Bookmarklet</h1>
        <p className="bookmarklet-intro">
          Save any page to Savers without leaving it. Drag the button below to
          your bookmarks bar, or copy the link and create a bookmark manually.
        </p>

        <div className="bookmarklet-install">
          <a
            href={SCRIPT}
            className="bookmarklet-drag"
            onClick={(e) => {
              e.preventDefault();
              handleCopy();
            }}
            title="Drag to your bookmarks bar"
          >
            + Save to Savers
          </a>
          <span className="bookmarklet-drag-hint">
            Drag this to your bookmarks bar
          </span>
        </div>

        <button
          type="button"
          className="bookmarklet-copy"
          onClick={handleCopy}
        >
          {copied ? "Copied!" : "Copy bookmarklet code"}
        </button>

        <h2 className="bookmarklet-subheading">How to install</h2>
        <ol className="bookmarklet-steps">
          <li>Make sure your bookmarks bar is visible (Ctrl+Shift+B / Cmd+Shift+B).</li>
          <li>Drag the green button above to your bookmarks bar.</li>
          <li>Browse any page and click "Save to Savers" in your bookmarks bar.</li>
          <li>A modal will appear — add tags, pick a collection, and save.</li>
        </ol>

        <h2 className="bookmarklet-subheading">Works on</h2>
        <ul className="bookmarklet-browsers">
          <li>Chrome / Edge / Brave</li>
          <li>Firefox</li>
          <li>Safari</li>
          <li>Any browser with JavaScript enabled</li>
        </ul>
      </main>

      <style jsx>{`
        .bookmarklet-page {
          max-width: 600px;
          margin: 60px auto;
          padding: 24px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: var(--color-text, #ececec);
          background: var(--color-bg, #111);
          border-radius: 12px;
        }
        .bookmarklet-heading {
          font-size: 24px;
          font-weight: 700;
          margin: 0 0 12px;
        }
        .bookmarklet-intro {
          color: var(--color-text-muted, #9b9b9b);
          margin: 0 0 24px;
          line-height: 1.5;
        }
        .bookmarklet-install {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .bookmarklet-drag {
          display: inline-flex;
          align-items: center;
          padding: 10px 20px;
          background: #1f6f43;
          color: #fff;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          cursor: grab;
          user-select: none;
        }
        .bookmarklet-drag:active {
          cursor: grabbing;
        }
        .bookmarklet-drag-hint {
          color: var(--color-text-muted, #9b9b9b);
          font-size: 13px;
        }
        .bookmarklet-copy {
          display: inline-block;
          margin-bottom: 32px;
          padding: 6px 14px;
          background: #202020;
          border: 1px solid #2a2a2a;
          border-radius: 6px;
          color: var(--color-text, #ececec);
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
        }
        .bookmarklet-copy:hover {
          border-color: #3a3a3a;
        }
        .bookmarklet-subheading {
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 8px;
        }
        .bookmarklet-steps,
        .bookmarklet-browsers {
          margin: 0 0 24px;
          padding-left: 20px;
          color: var(--color-text-muted, #9b9b9b);
          line-height: 1.7;
        }
        .bookmarklet-steps li {
          margin-bottom: 4px;
        }
      `}</style>
    </>
  );
}
