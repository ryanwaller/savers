'use client';

import { useState, useEffect } from 'react';
import JSZip from 'jszip';
import type { Bookmark, Collection } from '@/lib/types';
import { storedPreviewUrl, screenshotPreviewUrl, previewImageUrl } from '@/lib/api';

interface Props {
  bookmarks: Bookmark[];
  flatCollections: Collection[];
}

const escapeCSV = (field: string | undefined | null) => {
  if (!field) return '';
  const str = String(field);
  return str.includes(',') || str.includes('"') || str.includes('\n')
    ? `"${str.replace(/"/g, '""')}"`
    : str;
};

export default function ExportBookmarksButton({ bookmarks, flatCollections }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener?.("change", h);
    return () => mq.removeEventListener?.("change", h);
  }, []);

  const handleExport = async () => {
    if (!bookmarks.length) return;
    setLoading(true);
    setError(null);

    const collectionMap = new Map(flatCollections.map(c => [c.id, c.name]));

    try {
      const zip = new JSZip();
      const csvRows: string[] = ['Title,URL,Collection,Tags,Notes,ImageURL,ImageFilename'];

      for (let i = 0; i < bookmarks.length; i++) {
        const b = bookmarks[i];
        
        // Determine the effective image URL using the same logic as BookmarkGrid
        const customSrc = storedPreviewUrl(b.custom_preview_path, { previewVersion: b.preview_version });
        const storedSrc = storedPreviewUrl(b.preview_path, { previewVersion: b.preview_version });
        const microlinkSrc = screenshotPreviewUrl(b.url, { cacheBust: b.preview_version });
        const fallbackSrc = previewImageUrl(b.url, {
          ogImage: b.og_image,
          favicon: b.favicon,
          previewVersion: b.preview_version,
        });

        const imageUrl = customSrc || storedSrc || microlinkSrc || fallbackSrc;
        
        const imgExt = imageUrl?.split('.').pop()?.split('?')[0] || 'png';
        const safeExt = imgExt.length > 4 ? 'png' : imgExt;
        const imgName = `bookmark_${i}.${safeExt}`;
        
        // Add CSV row
        csvRows.push([
          escapeCSV(b.title),
          escapeCSV(b.url),
          escapeCSV(b.collection_id ? collectionMap.get(b.collection_id) : 'Unsorted'),
          escapeCSV(b.tags?.join(', ')),
          escapeCSV(b.notes),
          escapeCSV(imageUrl),
          imageUrl ? imgName : ''
        ].join(','));

        // Fetch & add image if URL exists
        if (imageUrl) {
          try {
            const res = await fetch(imageUrl, { mode: 'cors' });
            if (res.ok) {
              const blob = await res.blob();
              zip.file(`images/${imgName}`, blob);
            }
          } catch (imgErr) {
            console.warn(`Failed to download image ${i}: ${imgErr}`);
          }
        }
      }

      // Add CSV to ZIP
      zip.file('bookmarks.csv', csvRows.join('\n'));

      // Generate & download ZIP
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `savers-bookmarks-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Export failed.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="export-wrap">
      {error && <span className="error-msg">{error}</span>}
      <button
        onClick={handleExport}
        disabled={loading}
        className="export-btn"
        title="Export bookmarks as CSV + images"
      >
        {loading ? (
          <svg className="spinner" fill="none" viewBox="0 0 24 24">
            <circle className="op-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="op-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
      </button>
      <style jsx>{`
        .export-wrap { display: flex; align-items: center; gap: 8px; }
        .error-msg { font-size: 11px; color: #ef4444; }
        .export-btn {
          width: 30px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg-secondary);
          color: var(--color-text);
          transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
        }
        .export-btn:hover:not(:disabled) {
          color: var(--color-text);
          border-color: var(--color-border-strong);
          background: var(--color-bg-hover);
        }
        .export-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .icon { width: 14px; height: 14px; }
        .spinner { width: 14px; height: 14px; animation: spin 1s linear infinite; }
        .op-25 { opacity: 0.25; }
        .op-75 { opacity: 0.75; }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
