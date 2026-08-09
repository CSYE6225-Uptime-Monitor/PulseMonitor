"use client";

import { useRedirectIfAuthenticated } from "@/lib/auth";
import { Landing } from "@/components/Landing";

export default function Home() {
  useRedirectIfAuthenticated();
  return <Landing />;
}
