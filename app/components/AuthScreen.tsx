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

            <div className="auth-actions">
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
            </div>
          </form>
        )}

        {message && <div className="auth-message small">{message}</div>}
      </div>
    </div>
  );
}
