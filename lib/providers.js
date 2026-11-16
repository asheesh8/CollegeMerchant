// SMTP settings for common providers, picked from the email's domain.
// Shared by the browser form and the server.

export const PROVIDERS = {
  gmail: {
    label: "Gmail / Google Workspace",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    passwordLabel: "App password",
    help: "Turn on 2-Step Verification, then create a 16-character app password. Your normal Gmail password won't work.",
    helpUrl: "https://myaccount.google.com/apppasswords",
  },
  outlook: {
    label: "Outlook / Microsoft 365",
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    passwordLabel: "Password or app password",
    help: "If you use two-step sign-in, create an app password. Some Microsoft accounts have SMTP sign-in turned off; if the test fails, check SMTP AUTH in your account settings.",
    helpUrl: "https://account.live.com/proofs/AppPassword",
  },
  yahoo: {
    label: "Yahoo Mail",
    host: "smtp.mail.yahoo.com",
    port: 465,
    secure: true,
    passwordLabel: "App password",
    help: "Generate an app password under Account Security.",
    helpUrl: "https://login.yahoo.com/account/security",
  },
  icloud: {
    label: "iCloud Mail",
    host: "smtp.mail.me.com",
    port: 587,
    secure: false,
    passwordLabel: "App-specific password",
    help: "Create an app-specific password at appleid.apple.com under Sign-In and Security.",
    helpUrl: "https://account.apple.com/account/manage",
  },
  zoho: {
    label: "Zoho Mail",
    host: "smtp.zoho.com",
    port: 465,
    secure: true,
    passwordLabel: "App password",
    help: "If two-factor is on, create an application-specific password.",
    helpUrl: "https://accounts.zoho.com/home#security/app_password",
  },
  custom: {
    label: "Other (custom SMTP)",
    host: "",
    port: 587,
    secure: false,
    passwordLabel: "Password",
    help: "Look up your provider's SMTP server, port, and whether it uses SSL (usually port 465) or STARTTLS (usually 587).",
    helpUrl: "",
  },
};

const DOMAINS = {
  gmail: ["gmail.com", "googlemail.com"],
  outlook: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
  yahoo: ["yahoo.com", "ymail.com", "rocketmail.com"],
  icloud: ["icloud.com", "me.com", "mac.com"],
  zoho: ["zoho.com", "zohomail.com"],
};

export function detectProvider(email) {
  const domain = String(email || "").split("@")[1]?.toLowerCase().trim();
  if (!domain) return null;
  for (const [id, list] of Object.entries(DOMAINS)) {
    if (list.includes(domain) || list.some((d) => domain.startsWith(d.split(".")[0] + "."))) return id;
  }
  // School and work addresses are often Google Workspace or Microsoft 365, but we can't tell from the name.
  return "custom";
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
