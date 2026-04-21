import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Savers",
  description: "Privacy policy for Savers and the Savers browser extension.",
};

const sections = [
  {
    title: "What Savers stores",
    body: [
      "Savers stores the bookmarks you save, along with the title, URL, notes, tags, collection placement, and preview image metadata needed to organize your library.",
      "If you use the browser extension, Savers may also store the current page URL, page title, and related collection choices when you choose to save a page.",
    ],
  },
  {
    title: "How sign-in works",
    body: [
      "Savers supports sign-in by email link and Google. Authentication is handled through Supabase.",
      "Your account information is used only to identify your library and keep your saved items tied to you across devices.",
    ],
  },
  {
    title: "Website previews",
    body: [
      "When a bookmark preview is generated, Savers may request a screenshot from third-party preview providers, including Microlink, APIFlash, ScreenshotOne, or CaptureKit.",
      "Preview images may be stored in Supabase Storage so they load faster later and remain available across sessions and devices.",
    ],
  },
  {
    title: "How data is used",
    body: [
      "Your data is used only to run the Savers product: saving bookmarks, organizing collections and tags, loading previews, syncing your library, and improving categorization suggestions.",
      "Savers does not sell your personal data.",
    ],
  },
  {
    title: "Third-party services",
    body: [
      "Savers uses Supabase for database, authentication, and file storage, Railway for hosting, Anthropic for collection suggestions when enabled, and screenshot providers for preview generation.",
      "Those services process only the data needed to perform their part of the product.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "You can edit or delete bookmarks, collections, tags, and previews inside Savers.",
      "If you would like your account data removed entirely, contact the developer and include the email address used for your account.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen overflow-y-auto bg-[var(--color-bg)] px-4 py-6 text-[13px] text-[var(--color-text)] sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-24">
        <div className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <div className="mb-1 text-[12px] text-[var(--color-text-muted)]">Savers</div>
              <h1 className="text-[13px] font-semibold leading-tight">
                Privacy Policy
              </h1>
            </div>
            <a
              href="/"
              className="btn"
            >
              Back to Savers
            </a>
          </div>

          <div className="space-y-2 text-[var(--color-text-muted)]">
            <p>Effective date: April 20, 2026</p>
            <p>
              This policy applies to the Savers web app and the Savers browser
              extension.
            </p>
          </div>
        </div>

        {sections.map((section) => (
          <section
            key={section.title}
            className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] p-5 sm:p-6"
          >
            <h2 className="mb-3 text-[13px] font-semibold">{section.title}</h2>
            <div className="space-y-3 text-[var(--color-text-muted)]">
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] p-5 sm:p-6">
          <h2 className="mb-3 text-[13px] font-semibold">Contact</h2>
          <p className="text-[var(--color-text-muted)]">
            Questions about privacy or deletion requests can be sent to{" "}
            <a className="underline underline-offset-2" href="mailto:ryan@othermeans.us">
              ryan@othermeans.us
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
