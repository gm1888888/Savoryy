import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Source_Serif_4 } from "next/font/google";

import { WelcomeSplash } from "@/components/home/welcome-splash";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { SetupNotice } from "@/components/shared/setup-notice";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const sans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const serif = Source_Serif_4({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Savory -- Share and discover home recipes",
    template: "%s | Savory",
  },
  description:
    "A community cooking blog where home cooks publish their own recipes, save favourites and swap notes in the comments.",
  openGraph: {
    title: "Savory -- Share and discover home recipes",
    description:
      "A community cooking blog where home cooks publish their own recipes.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={sans.variable + " " + serif.variable + " h-full antialiased"}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <WelcomeSplash />
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
          >
            Skip to content
          </a>
          <SetupNotice />
          <Navbar />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
          <ThemeToggle />
          <Toaster richColors closeButton position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
