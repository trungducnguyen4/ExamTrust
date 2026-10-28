import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./../index.css";

import { Providers } from "./providers";

// `NEXT_PUBLIC_APP_URL` is baked in at build time. An empty or malformed value
// used to crash `next build` ("TypeError: Invalid URL") while collecting page
// data for /_not-found, so resolve it defensively and fall back to a valid URL.
const FALLBACK_APP_URL = "https://exam-trust.vercel.app";

function resolveMetadataBase(): URL {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  for (const candidate of [configured, FALLBACK_APP_URL, "http://localhost:3000"]) {
    if (!candidate) continue;
    try {
      return new URL(candidate);
    } catch {
      // try the next candidate
    }
  }
  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: {
    default: "ExamTrust | Nền tảng đánh giá học thuật tin cậy",
    template: "%s | ExamTrust",
  },
  description:
    "Nền tảng tổ chức thi với đề ngẫu nhiên, giám sát toàn vẹn, phân tích kết quả và hỗ trợ AI có giảng viên kiểm duyệt.",
  icons: {
    icon: "/examtrust-mark.svg",
  },
  openGraph: {
    title: "ExamTrust",
    description:
      "Đánh giá học thuật minh bạch, có thể kiểm chứng và được thiết kế cho môi trường đại học.",
    images: ["/examtrust-og.svg"],
    locale: "vi_VN",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="vi" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
      </head>
      <body className="min-h-[100dvh] bg-background font-sans text-foreground antialiased">
        <a className="skip-link" href="#main-content">
          Chuyển đến nội dung chính
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
