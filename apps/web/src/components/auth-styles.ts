import type { CSSProperties } from "react";

/** Shared input/button styles matching design/screens/SignIn.dc.html + SignUp.dc.html. */

export const label: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 14,
  fontWeight: 600,
};

export const input: CSSProperties = {
  font: "400 15px Inter, sans-serif",
  height: 46,
  boxSizing: "border-box",
  padding: "0 12px",
  borderRadius: 6,
  border: "1px solid var(--color-border-strong)",
  background: "var(--color-input-bg)",
  color: "var(--color-text)",
};

export const oauthButton: CSSProperties = {
  font: "600 15px Inter, sans-serif",
  height: 48,
  borderRadius: 6,
  border: "1px solid var(--color-border-strong)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  cursor: "pointer",
};

export const primaryButton: CSSProperties = {
  textDecoration: "none",
  height: 48,
  borderRadius: 6,
  background: "var(--color-accent)",
  color: "var(--color-on-accent)",
  fontWeight: 700,
  fontSize: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  cursor: "pointer",
  width: "100%",
};

export const errorText: CSSProperties = {
  fontSize: 14,
  color: "#D64545",
  margin: 0,
};
