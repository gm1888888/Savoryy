"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CookingPot } from "lucide-react";

const SEEN_KEY = "savory-welcome-seen";

// Runs before the splash is parsed, so someone who already saw it this
// session never gets a flash of it (globals.css hides it via this attribute).
const hideIfSeen = `try{if(sessionStorage.getItem("${SEEN_KEY}"))document.documentElement.dataset.welcomeSeen="1"}catch(e){}`;

/**
 * Once-per-session intro over the homepage. The slide-off is a plain CSS
 * animation timed from page load, so it leaves even if JavaScript never runs;
 * JS only removes the overlay once it is gone.
 */
export function WelcomeSplash() {
  // Mounted in the root layout so it is in the very first bytes of the
  // response; inside the page it would only arrive after the recipe data.
  const pathname = usePathname();
  const [gone, setGone] = useState(false);
  // StrictMode runs effects twice in dev; without this the second run would
  // see the flag the first run just wrote and hide the intro immediately.
  const checked = useRef(false);

  useEffect(() => {
    if (pathname !== "/" || checked.current) return;
    checked.current = true;
    try {
      if (sessionStorage.getItem(SEEN_KEY)) {
        document.documentElement.dataset.welcomeSeen = "1";
      } else {
        sessionStorage.setItem(SEEN_KEY, "1");
      }
    } catch {
      // Storage blocked: the intro just plays on every visit.
    }
  }, [pathname]);

  if (gone || pathname !== "/") return null;

  function finish(event: React.AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    document.documentElement.dataset.welcomeSeen = "1";
    setGone(true);
  }

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: hideIfSeen }} />
      <div
        id="welcome-splash"
        onAnimationEnd={finish}
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background animate-[welcome-out_700ms_cubic-bezier(0.7,0,0.3,1)_2600ms_forwards] motion-reduce:animate-[welcome-fade_500ms_ease-out_2600ms_forwards]"
      >
        <div className="absolute inset-0 bg-warm-wash" aria-hidden="true" />

        <div className="relative flex flex-col items-center px-6 text-center">
          <div className="flex h-6 items-end gap-1.5" aria-hidden="true">
            {[0, 300, 600].map((delay) => (
              <span
                key={delay}
                className="h-5 w-1 rounded-full bg-primary/50 opacity-0 animate-[steam_1.8s_ease-out_infinite] motion-reduce:hidden"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>

          <span className="mt-2 flex size-20 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-lg animate-in zoom-in-50 fade-in duration-700 ease-out fill-mode-both motion-reduce:animate-none">
            <CookingPot className="size-10" aria-hidden="true" />
          </span>

          <p className="mt-6 font-heading text-5xl font-bold tracking-tight animate-in fade-in slide-in-from-bottom-3 duration-700 fill-mode-both [animation-delay:300ms] motion-reduce:animate-none sm:text-6xl">
            Savory<span className="text-primary">.</span>
          </p>

          <p className="mt-3 text-base text-muted-foreground animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both [animation-delay:650ms] motion-reduce:animate-none sm:text-lg">
            Real recipes from real home cooks
          </p>
        </div>
      </div>
    </>
  );
}
