/* Alex Neon — reveal-on-scroll behavior. Everything here is progressive enhancement: without
   JavaScript the page is fully readable and navigable. */
(() => {
  "use strict";

  const root = document.documentElement;
  root.classList.add("js");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* --- Reveal on scroll ----------------------------------------------------- */
  const revealed = document.querySelectorAll("[data-reveal]");
  if (revealed.length) {
    const show = (el) => el.classList.add("is-in");

    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      revealed.forEach(show);
    } else {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              show(entry.target);
              observer.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
      );
      for (const el of revealed) observer.observe(el);

      /* Observer notifications can be withheld while the document is hidden
         (a page opened in a background tab). Nothing may stay invisible
         because of that, so anything already on screen is swept in directly
         whenever the page becomes visible. */
      const sweepVisible = () => {
        for (const el of revealed) {
          if (el.classList.contains("is-in")) continue;
          const box = el.getBoundingClientRect();
          if (box.top < window.innerHeight && box.bottom > 0) {
            show(el);
            observer.unobserve(el);
          }
        }
      };
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) sweepVisible();
      });
      window.addEventListener("pageshow", sweepVisible);
    }
  }
})();
