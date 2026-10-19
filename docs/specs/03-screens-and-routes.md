# 03 — Screens and routes (Next.js App Router)

All pages work on a phone first (most users and all collectors are on mobile). Loading states use shadcn `Skeleton`. Every form shows a Sonner toast on success or error. daisyUI classes use the `d-` prefix; use shadcn for forms, dialogs, toasts and tables.

Money is shown as points with naira: "2,450 pts (₦2,450)".

## Public

| Route | Content |
|---|---|
| `/` | Landing page: hero ("Your plastic is money") with a photo carousel managed in `/ops-portal/hero` (brand slides until photos exist; cross-fade every 5 s, arrows, dots, swipe; pauses on hover and for reduced motion), latest blog posts and upcoming events (when any are published), scroll-in motion on the sections below the hero, problem (drains, floods, burning), how it works (5 steps), what we buy (live prices from `/prices/current`), for individuals / for organizations, impact counter, who pays (export story), FAQ, CTA to sign up, "Chat on WhatsApp" link (wa.me) |
| `/guide` | Bottles per kg and sack guide: "about N bottles = 1 kg = ₦X today" per material |
| `/blog` | Published posts, newest first (added 13 Oct 2026) |
| `/blog/[slug]` | One post: title, date, author, cover, Markdown body (no raw HTML), Open Graph tags |
| `/events` | Upcoming climate and recycling events (soonest first) and a short past-events archive; times in Lagos time |
| `/login`, `/signup` | Supabase email + password. Sign-up step 2 chooses Individual or Organization and fills the matching fields (calls `POST /me/profile`). |

## User (role USER) — `/app/...`

Shared layout: top bar with "Welcome, {display_name}" and balance; bottom nav on mobile (Home, Request, Pickups, Wallet, Impact).

| Route | Content |
|---|---|
| `/app` | Dashboard: greeting, balance, active pickup card (status + map if EN_ROUTE), quick "Request pickup", impact summary |
| `/app/request` | Step form: materials → estimate (sacks, bags or bottle count; live kg + points estimate and progress bar to 50 kg) → photo → map pin (Leaflet) + address + area → preferred date + window → review. Under 50 kg: show hub address and "Join next area pickup day" option. |
| `/app/pickups` | List with status badges |
| `/app/pickups/[id]` | Status timeline; QR code to show the collector (ASSIGNED/EN_ROUTE); live collector marker via Supabase Realtime subscription to this pickup row; weight breakdown per material with collector photo; **Confirm** and **Dispute** buttons while AWAITING_CONFIRMATION, with countdown to auto-confirm; dispute form (photo, claimed kg, reason); resolution note when resolved |
| `/app/wallet` | Balance, ledger history, withdraw form (min ₦5,000), withdrawals with status |
| `/app/settings` | Profile fields, bank details (select bank, enter account number, show resolved account name, save) |
| `/app/impact` | Kg by material chart, total kg, points earned, CO₂ saved. ORGANIZATION only: ESG report section with month/year picker and "Download PDF". |

## Collector (role COLLECTOR) — `/collector/...`

Very simple, big buttons, works on a cheap Android phone.

| Route | Content |
|---|---|
| `/collector` | Today's assigned pickups, ordered, with area and address; "Walk-in" button for hub collectors |
| `/collector/pickups/[id]` | Customer first name, address, map directions link. **Start** (begins sending location every 20 s while the page is open) → **Scan QR** (camera, e.g. `html5-qrcode`) → **Weigh**: per material gross kg, deduction kg + reason, photo → submit → screen shows total and "Ask the customer for the SMS code" with OTP input, or "Customer will confirm in app" |
| `/collector/walk-in` | Search user by phone → materials and weights → photo → submit → OTP step |

## Admin (role ADMIN) — `/ops-portal/...`

Not linked anywhere on the public site. Access is still enforced by role on every API call; the hidden URL is not the security.

| Route | Content |
|---|---|
| `/ops-portal` | Stats: kg this month, points paid, pending withdrawals, open disputes, raw stock |
| `/ops-portal/pickups` | Board by status; filter by area and date; area totals of estimated kg for pooling; assign collector + date; flags for under-minimum and low estimate accuracy |
| `/ops-portal/disputes` | Collector photo and user photo side by side, collector weight vs claimed weight; enter final kg per material + note → resolve |
| `/ops-portal/prices` | Current prices and history; add new price version per material (also kg per sack, items per kg, CO₂ factor) |
| `/ops-portal/withdrawals` | Queue with user, amount, bank; approve / reject |
| `/ops-portal/users` | Users and collectors; create collector; deactivate; verified picker badge; manual adjustment |
| `/ops-portal/stock` | Raw stock per material, create bale, bales list with status actions (process, sell with buyer + price), real loss % |
| `/ops-portal/blog`, `/ops-portal/blog/new`, `/ops-portal/blog/[id]` | Posts (drafts and published); editor with title, summary, cover, Markdown toolbar (headings, bold, italic, link, lists, quote, photo) and preview; publish, unpublish, delete (added 13 Oct 2026) |
| `/ops-portal/events` | Events list; add or edit in a dialog (title, start/end in Lagos time, place or online, description, image, registration link, show on site); delete |
| `/ops-portal/hero` | Landing hero photos: upload with headline and line, reorder, hide, delete |

## Route protection

`middleware.ts` checks the Supabase session and redirects to `/login`. The layout for each area fetches `/me` and redirects if the role doesn't match (`/app` → USER, `/collector` → COLLECTOR, `/ops-portal` → ADMIN). The API still checks every request.
