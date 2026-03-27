import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Doc Digest",
  description: "Transform documents into interactive reading experiences",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-[#faf9f6] text-[#0f1f35]">
        {children}
      </body>
    </html>
  );
}
