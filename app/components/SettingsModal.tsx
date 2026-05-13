"use client";

import type { Bookmark, Collection } from "@/lib/types";
import SettingsSections from "./SettingsSections";

type Props = {
  open: boolean;
  onClose: () => void;
  bookmarks: Bookmark[];
  flatCollections: Collection[];
  userEmail?: string | null;
  userAvatarUrl?: string | null;
  onSignOut?: () => void | Promise<void>;
  onGeneratedPreviewsQueued?: (ids: string[]) => void;
};

export default function SettingsModal({
  open,
  onClose,
  bookmarks,
  flatCollections,
  userEmail,
  userAvatarUrl,
  onSignOut,
  onGeneratedPreviewsQueued,
}: Props) {
  if (!open) return null;

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <div className="title">Settings</div>
          <button className="icon-btn close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="body">
          <SettingsSections
            bookmarks={bookmarks}
            flatCollections={flatCollections}
            userEmail={userEmail}
            userAvatarUrl={userAvatarUrl}
            onSignOut={onSignOut}
            onGeneratedPreviewsQueued={onGeneratedPreviewsQueued}
          />
        </div>
      </div>

      <style jsx>{`
        .backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.32);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 60;
          padding: 24px;
        }
        .panel {
          width: min(960px, 100%);
          height: min(860px, calc(100dvh - 48px));
          max-height: calc(100dvh - 48px);
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 18px;
          border-bottom: 1px solid var(--color-border);
        }
        .title {
          font-weight: 600;
        }
        .close {
          color: var(--color-text-muted);
          padding-bottom: 2px;
        }
        .close:hover {
          color: var(--color-text);
        }
        .body {
          padding: 22px;
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }

        @media (max-width: 640px) {
          .backdrop {
            padding: 12px;
          }
          .panel {
            height: calc(100dvh - 24px);
            max-height: calc(100dvh - 24px);
          }
          .body {
            padding: 16px;
          }
        }
      `}</style>
    </div>
  );
}
