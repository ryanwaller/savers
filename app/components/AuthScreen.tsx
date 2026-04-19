"use client";

type AuthScreenProps = {
  email: string;
  googleSending?: boolean;
  message: string | null;
  mode: "loading" | "signed_out";
  sending: boolean;
  onEmailChange: (value: string) => void;
  onGoogleSubmit?: () => void | Promise<void>;
  onSubmit: () => void | Promise<void>;
};

export default function AuthScreen({
  email,
  googleSending = false,
  message,
  mode,
  sending,
  onEmailChange,
  onGoogleSubmit,
  onSubmit,
}: AuthScreenProps) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">Savers</div>
        <div className="auth-copy">
          <h1>Sign in to your library</h1>
          <p>
            Your bookmarks, collections, tags, and previews can travel with you across
            machines once you sign in.
          </p>
        </div>

        {mode === "loading" ? (
          <div className="auth-status">Checking your session…</div>
        ) : (
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmit();
            }}
          >
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>

            <button className="btn btn-primary auth-submit" type="submit" disabled={sending}>
              {sending ? "Sending link…" : "Email me a sign-in link"}
            </button>

            {onGoogleSubmit && (
              <button
                className="btn auth-google"
                type="button"
                disabled={googleSending}
                onClick={() => {
                  void onGoogleSubmit();
                }}
              >
                {googleSending ? "Opening Google…" : "Continue with Google"}
              </button>
            )}
          </form>
        )}

        {message && <div className="auth-message small">{message}</div>}
      </div>

      <style jsx>{`
        .auth-shell {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background:
            radial-gradient(circle at top, rgba(255, 255, 255, 0.08), transparent 35%),
            var(--color-bg);
        }
        .auth-card {
          width: min(420px, 100%);
          border: 1px solid var(--color-border);
          border-radius: 18px;
          background: var(--color-bg);
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .auth-brand {
          font-size: 12px;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .auth-copy {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .auth-copy h1 {
          font-size: 12px;
          font-weight: 600;
        }
        .auth-copy p {
          font-size: 12px;
          color: var(--color-text-muted);
        }
        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .auth-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .auth-field span {
          font-size: 12px;
          color: var(--color-text-muted);
        }
        .auth-status,
        .auth-message {
          font-size: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
        }
        .auth-submit {
          align-self: flex-start;
        }
        .auth-google {
          align-self: flex-start;
        }
      `}</style>
    </div>
  );
}
