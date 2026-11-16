"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Dashboard"],
  ["/places", "Places"],
  ["/review", "Review"],
  ["/sent", "Sent"],
  ["/settings", "Settings"],
  ["/accounts", "Accounts"],
];

export default function Nav() {
  const path = usePathname();
  if (path === "/login") return null;
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <header className="nav">
      <div className="nav-inner">
        <span className="brand">CollegeMerchant</span>
        <nav>
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? "active" : ""}>{label}</Link>
          ))}
        </nav>
        <button className="link small" onClick={logout}>Sign out</button>
      </div>
    </header>
  );
}
