"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

/**
 * Not Clerk's prebuilt sign-in UI — this is the one piece Clerk's own
 * custom-flow guide says to keep even for a fully custom UI: the
 * component that completes the OAuth handshake after the provider
 * redirects back here. It renders nothing itself.
 */
export default function SignInSsoCallbackPage() {
  return (
    <AuthenticateWithRedirectCallback
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/welcome"
    />
  );
}
