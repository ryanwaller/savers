"use client";

interface SidebarToggleIconProps {
  isOpen: boolean;
  className?: string;
}

export function SidebarToggleIcon({ isOpen, className = "" }: SidebarToggleIconProps) {
  return isOpen ? (
    // CLOSE SIDEBAR (Left Arrow)
    // Sidebar is visible, click to collapse left
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M19 12H5" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  ) : (
    // OPEN SIDEBAR (Right Arrow)
    // Sidebar is hidden, click to expand right
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 12h14" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
