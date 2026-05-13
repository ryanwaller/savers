"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import type { Bookmark, Collection } from "@/lib/types";
import { api } from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import SettingsSections from "../components/SettingsSections";

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [flatCollections, setFlatCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let alive = true;

    void (async () => {
      try {
        const [{ data: authData }, bootstrap] = await Promise.all([
          supabase.auth.getUser(),
          api.bootstrap(),
        ]);

        if (!alive) return;
        setUser(authData.user ?? null);
        setBookmarks(bootstrap.bookmarks);
        setFlatCollections(bootstrap.flat);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Could not load settings");
      } finally {
        if (!alive) return;
        setAuthLoading(false);
        setLoading(false);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (!alive) return;
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const avatarUrl = (meta?.avatar_url || meta?.picture) as string | undefined;

  return (
    <main className="settings-page">
      <div className="settings-shell">
        <div className="settings-top">
          <Link href="/" className="settings-back">
            <ArrowLeft size={16} weight="regular" />
            <span>Back to library</span>
          </Link>
        </div>

        <header className="settings-hero">
          <div>
            <div className="settings-kicker">Preferences</div>
            <h1>Settings</h1>
            <p>
              Manage how you save to Savers, keep your library healthy, and find the advanced setup details only when you need them.
            </p>
          </div>
        </header>

        {authLoading || loading ? (
          <div className="settings-state">Loading settings…</div>
        ) : error ? (
          <div className="settings-state error">{error}</div>
        ) : !user ? (
          <div className="settings-state">
            You need to be signed in to manage settings.
          </div>
        ) : (
          <SettingsSections
            bookmarks={bookmarks}
            flatCollections={flatCollections}
            userEmail={user.email}
            userAvatarUrl={avatarUrl}
            onSignOut={handleSignOut}
          />
        )}
      </div>

      <style jsx>{`
        .settings-page {
          min-height: 100vh;
          background: var(--color-bg);
          padding: 28px 20px 72px;
        }
        .settings-shell {
          width: min(980px, 100%);
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 22px;
        }
        .settings-top {
          display: flex;
          justify-content: flex-start;
        }
        .settings-back {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          color: var(--color-text);
          background: var(--color-bg-secondary);
          text-decoration: none;
        }
        .settings-back:hover {
          border-color: var(--color-border-strong);
          background: var(--color-bg-hover);
        }
        .settings-hero {
          border: 1px solid var(--color-border);
          border-radius: 24px;
          background: linear-gradient(
            180deg,
            color-mix(in srgb, var(--color-bg-secondary) 92%, transparent),
            color-mix(in srgb, var(--color-bg) 94%, transparent)
          );
          padding: 26px 26px 24px;
        }
        .settings-kicker {
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--color-text-muted);
          margin-bottom: 10px;
        }
        h1 {
          margin: 0;
          font-size: clamp(28px, 4vw, 40px);
          line-height: 1;
          letter-spacing: -0.03em;
        }
        p {
          margin: 12px 0 0;
          max-width: 680px;
          color: var(--color-text-muted);
          font-size: 15px;
          line-height: 1.5;
        }
        .settings-state {
          border: 1px solid var(--color-border);
          border-radius: 18px;
          padding: 18px;
          background: var(--color-bg-secondary);
          color: var(--color-text-muted);
        }
        .settings-state.error {
          color: #ff7a7a;
        }

        @media (max-width: 640px) {
          .settings-page {
            padding: 18px 14px 56px;
          }
          .settings-hero {
            padding: 20px 18px;
          }
        }
      `}</style>
    </main>
  );
}
