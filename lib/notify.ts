/**
 * Lightweight DOM-based toast notifications.
 * Drop-in replacement for alert() — no React state needed.
 */

function getContainer(): HTMLElement {
  const id = "savers-toast-container";
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.style.cssText =
      "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;" +
      "display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;";
    document.body.appendChild(el);
  }
  return el;
}

export function notify(message: string, kind: "error" | "success" = "error"): void {
  if (typeof document === "undefined") return;

  const toast = document.createElement("div");
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  const bg = kind === "error"
    ? (isDark ? "#2a1515" : "#fef2f2")
    : (isDark ? "#152a15" : "#f0fdf4");
  const border = kind === "error"
    ? (isDark ? "#5c2020" : "#fecaca")
    : (isDark ? "#205c20" : "#bbf7d0");
  const text = isDark ? "#e8e8e6" : "#111";

  toast.style.cssText =
    `background:${bg};border:1px solid ${border};color:${text};` +
    "padding:8px 16px;border-radius:8px;font-size:12px;line-height:17px;" +
    "font-family:-apple-system,BlinkMacSystemFont,Inter,Segoe UI,sans-serif;" +
    "max-width:min(480px,calc(100vw - 32px));" +
    "pointer-events:auto;transition:opacity 300ms ease,transform 300ms ease;" +
    "animation:savers-toast-in 200ms ease-out;";
  toast.textContent = message;

  const container = getContainer();
  container.appendChild(toast);

  const dismiss = () => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    setTimeout(() => toast.remove(), 300);
  };

  const timer = setTimeout(dismiss, 5000);
  toast.addEventListener("click", () => {
    clearTimeout(timer);
    dismiss();
  });

  // Limit to 3 visible toasts
  const all = container.querySelectorAll("div");
  if (all.length > 3) all[0].remove();
}

// Inject the keyframe once
if (typeof document !== "undefined" && !document.getElementById("savers-toast-style")) {
  const style = document.createElement("style");
  style.id = "savers-toast-style";
  style.textContent =
    "@keyframes savers-toast-in { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }";
  document.head.appendChild(style);
}
