import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://ranvoo-creator-workbench.x78771046.chatgpt.site"),
  title: "RANVOO Creator Operations",
  description: "RANVOO 红人合作邮箱、跟进、话术与飞书同步工作台。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "RANVOO Creator Operations",
    description: "读取邮件、判断阶段、预览回复与表格变更，在人工确认后执行。",
    images: [{ url: "/og.png", width: 1728, height: 905, alt: "RANVOO Creator Operations" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RANVOO Creator Operations",
    description: "Read · Decide · Confirm · Execute",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
