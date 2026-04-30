"use client";

// Triage now lives as an overlay on the home page. Anyone hitting the
// old /triage URL gets redirected home with a hash that the home page
// uses to auto-open the overlay.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TriageRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/?triage=1");
  }, [router]);
  return null;
}
