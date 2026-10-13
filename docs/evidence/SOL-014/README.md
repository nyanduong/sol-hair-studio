# SOL-014 — Web UI refinement evidence

Source of work: [Sheet row SOL-014](https://docs.google.com/spreadsheets/d/1mKBFo0c1PcSJEVwbI80AAsorL47a7VyGk-nE0hIGLbw/edit#gid=0&range=A13:O13).
Tested 13 October 2026 on Windows, Codex in-app browser (browser version unavailable through the supported inspection API). Branch: `feat/SOL-014-web-ui-refinement`; baseline: `d24b599`. Screenshots belong to this commit's implementation.

## Automated checks

- `npm run lint`: PASS, all workspaces.
- `npm test`: PASS, 51 tests (API 12, mobile 25, web 14).
- `npm run build`: PASS, API syntax checks, Android/iOS Expo exports, Vite web build.
- After a final retry-button focus style adjustment: web lint/build and `git diff --check` PASS.
- Expo export is build validation, not testing on a simulator or physical device.

## Browser checks

The success screenshots use the existing local API and its three actual services, including Cloudinary images. No catalog fixture or database change is shipped. Testing used `localhost:5173` and API `localhost:4000`.

| Viewport width | Document client / scroll width | Service columns | Evidence |
| --- | --- | --- | --- |
| 320 | 305 / 305 | 1 | [320px](after-320.jpg) |
| 375 | 360 / 360 | 1 | [375px](after-375.jpg) |
| 768 | 753 / 753 | 2 | [768px](after-768.jpg) |
| 1024 | 1009 / 1009 | 3 | [1024px](after-1024.jpg) |
| 1440 | 1425 / 1425 | 3 | [1440px](after-1440.jpg) |

- No horizontal overflow at the five widths. All three API services render in API order.
- Mobile menu: choosing Dịch vụ closes the menu and focuses `#services`; Escape closes it and returns focus to the summary.
- Keyboard Tab reveals the skip link with a solid outline; Enter moves focus to `#main-content`.
- Reduced-motion emulation: video paused, poster visible, smooth scrolling disabled. Emulation reset after testing.
- Primary text contrast calculated from theme tokens: muted on canvas 5.25:1; white on terracotta 5.67:1. This is a token check, not a complete WCAG certification.
- [Health](health.jpg): API connected and database status connected. Database was not directly modified or separately tested.
- [Before](before-desktop.jpg): baseline built page, viewport screenshot; after images are full-page captures. Existing offscreen reveal effects make a baseline full-page capture unsuitable.

Controlled browser-only interception of `/api/services` verified [loading](loading.jpg), [empty](empty.jpg), [HTTP 503 error](error.jpg), and [8-second timeout](timeout.jpg). Clearing interception and clicking Thử lại recovered the three real API services. A one-service fixture with a broken image, zero price and equal duration verified [image fallback, Miễn phí and 30 phút](image-fallback-free-fixed-duration.jpg). No internal server error text is exposed. Interception was cleared after testing.

## Scope and review notes

The implementation retains existing logo, fonts, video and editorial assets. `hero-poster.jpg` is a frame extracted from the existing hero video; it introduces no external image source. The experience image differs from the reference prototype and remains subject to Owner asset approval. Editorial content is explicitly marked as sample content. Official contact details and asset/font approval are still pending; unverified address, phone, social and legal links are omitted.

Booking links lead to a section explaining that online booking is unavailable. There is no booking workflow, service detail route, authentication, payment or CMS. API contracts, database, mobile source, dependencies and lockfile are unchanged. Owner visual/content acceptance and PR merge remain outstanding; this evidence does not mark the task completed.
