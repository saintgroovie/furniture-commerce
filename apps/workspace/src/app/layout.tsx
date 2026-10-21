import type { ReactNode } from "react";
import type { Metadata } from "next";
import "../premium/styles.css";
import "../premium/responsive.css";
import "../premium/live.css";
export const metadata: Metadata = {
  title: "Woodright OS",
  description: "Рабочее пространство Woodright",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
