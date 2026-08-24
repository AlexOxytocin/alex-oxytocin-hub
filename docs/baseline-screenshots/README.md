# Visual baseline evidence

The JPEG set was captured from production on 2026-08-23 with headless Chrome. Those images record the fragmented pre-migration site and remain historical comparison evidence.

Browser settings: reduced motion, hidden scrollbars, fixed viewport, viewport-only capture after a 2.5-second virtual-time budget. No authenticated or mutating interaction was performed.

The sole release baselines for Home are `home-ru-{desktop,tablet,mobile}.png` and `home-en-{desktop,tablet,mobile}.png`. They were captured from the restored public `/` and `/en/` pages on 2026-08-24 and are release-blocking inputs for `npm run test:home:visual`. `home-release-baselines.json` fixes their source, capture environment, dimensions and SHA-256 hashes. Changes to either the PNGs or manifest require explicit owner review through `CODEOWNERS`.

The original lossy `home-{desktop,tablet,mobile}.jpg` set remains historical evidence; its mobile image contains a wider layout cropped to 375px and is not used as a silent-pass exception.

| Name | Public URL | Viewports |
| --- | --- | --- |
| `home-*` | `https://godmodetools.com/` | mobile 375×812, tablet 768×1024, desktop 1440×900 |
| `experience-*` | `https://cv.godmodetools.com/` | mobile 375×812, tablet 768×1024, desktop 1440×900 |
| `projects-*` | `https://cv.godmodetools.com/showcase/` | mobile 375×812, tablet 768×1024, desktop 1440×900 |
| `learning-*` | `https://ai.godmodetools.com/` | mobile 375×812, tablet 768×1024, desktop 1440×900 |
| `community-*` | `https://allo.godmodetools.com/` | mobile 375×812, tablet 768×1024, desktop 1440×900 |

The JPEG quality is intentionally reduced to keep repository weight reasonable; layout, hierarchy and above-the-fold content remain suitable for regression comparison. Network weights are recorded separately in `docs/site-modernization-plan.md`.
