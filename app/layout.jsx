import "./globals.css";

export const metadata = {
  title: "Boster Bost | SMM Panel",
  description:
    "Boster Bost is a reliable SMM panel for influencers, brands, agencies, and resellers worldwide.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
