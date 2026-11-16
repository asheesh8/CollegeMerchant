import "./globals.css";
import Nav from "./Nav.js";

export const metadata = {
  title: "CollegeMerchant",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
