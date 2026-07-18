import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "方块谷 · 生存模式",
  description: "一个属于你的像素方块世界。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
