import type { Metadata, Viewport } from "next";
import { Alfa_Slab_One, Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const alfa = Alfa_Slab_One({
  variable: "--font-alfa",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: {
    default: "AJACTv — TV ao vivo",
    template: "%s · AJACTv",
  },
  description:
    "AJACTv: assista canais de TV ao vivo — esportes, filmes, notícias, infantil e muito mais — direto no navegador.",
  applicationName: "AJACTv",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0c0b09",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${poppins.variable} ${alfa.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
