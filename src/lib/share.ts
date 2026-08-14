// Helpers for handing new accounts their credentials over WhatsApp (or the
// device's native share sheet). The text is plain and self-explanatory; the
// person signs in and is forced to set their own password on first login.

export type Credentials = {
  platformName: string;
  loginUrl: string;
  email: string;
  password: string;
  roleLabel?: string;
};

export function credentialsText(c: Credentials): string {
  const lines = [
    `You've been added to ${c.platformName}.`,
    c.roleLabel ? `Role: ${c.roleLabel}` : null,
    ``,
    `Sign in: ${c.loginUrl}`,
    `Email: ${c.email}`,
    `Temporary password: ${c.password}`,
    ``,
    `You'll be asked to set your own password on first sign-in.`,
  ];
  return lines.filter((l) => l !== null).join("\n");
}

/** A strong, readable temporary password (no ambiguous characters). Generated
 *  so admins/family never invent (or permanently know) a weak one — the person
 *  resets it on first sign-in anyway. */
export function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

/** Open WhatsApp (or the native share sheet) pre-filled with the credentials. */
export function shareOnWhatsApp(text: string): void {
  const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (nav?.share) {
    nav.share({ text }).catch(() => window.open(wa, "_blank", "noopener"));
  } else {
    window.open(wa, "_blank", "noopener");
  }
}
