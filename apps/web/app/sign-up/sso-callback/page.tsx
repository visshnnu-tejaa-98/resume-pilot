"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

export default function SignUpSsoCallbackPage() {
  return (
    <AuthenticateWithRedirectCallback
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/welcome"
    />
  );
}
