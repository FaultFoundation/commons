"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSignOut() {
    if (pending) return;
    setPending(true);
    await authClient.signOut();
    router.push("/login/");
    router.refresh();
  }

  return (
    <button
      className="ff-btn ff-btn--outline"
      type="button"
      onClick={onSignOut}
      disabled={pending}
    >
      Sign out
    </button>
  );
}
