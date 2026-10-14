# PlastiCash Design Brief (web app)

How PlastiCash looks, feels and reads. This brief describes the approved mockup:
**https://claude.ai/artifact/NzdCNvD42EkacFsHtEqdXS**

Read it with `specs/03-screens-and-routes.md` (every route) and `design/theme.css` (the tokens in code).
Where it disagrees with the older `docs/DESIGN_BRIEF.md`, this brief wins.

---

## 1. The product in one line

PlastiCash pays people in Enugu for their plastic waste. You request a pickup, it gets weighed in front of you, you get paid and you see your impact.

**1 point = ₦1.** Door pickup starts at 50 kg. The minimum withdrawal is ₦1,000. A weight auto-confirms after 48 hours.

## 2. Platform: a web app, mobile first

PlastiCash is **one responsive web app** (Next.js) opened in a browser at `plasticash.ng`. It is not a native app.

| Who | Where they open it | Design for |
|---|---|---|
| Households (Chinaza) | Phone browser, slow or expensive data | 360 px first |
| Organizations (Mrs Okoye, Green Hills School) | Laptop and phone | 1280 px and 360 px |
| Collectors (Emeka) | Cheap Android phone, outdoors | 360 px only, high contrast |
| EcoCyclers office (admin) | Desktop | 1280 px+, dense tables |

**Breakpoints (Tailwind):** `base` from 360 px, `md` from 768 px, `lg` from 1024 px, `xl` from 1280 px.
Below `lg` the user area uses a top bar and a bottom nav. From `lg` up, a left sidebar replaces both.

**Installable (PWA).** Saving the site to the home screen shows a green launch screen with the logo and "Made in Enugu · 1 point = ₦1". There is no browser bar in that mode.

## 3. Brand personality

**Trustworthy, hopeful, local, simple.**

- **Reliable:** it handles money, so it should feel like a bank, not a game.
- **Positive and green:** about cleaner streets and earning. It never preaches.
- **From Enugu:** local names, local streets and Nigerian photos only.
- **Plain words:** "Your plastic is money.", not "Monetize your recyclable waste stream."

## 4. Design principles

1. **Money is always clear.** Every amount shows points with naira: **2,450 pts (₦2,450)**. Payouts always show kg × price per material.
2. **One main action per screen.** There is exactly one primary (green) button per view.
3. **Show where things are.** Every pickup shows its step on a progress track.
4. **Light on data.** Use WebP photos through Cloudinary and Skeleton loaders. No autoplay video. Keep the dashboard under about 500 KB.
5. **Readable outdoors.** Body text is 16 px minimum, tap targets 48 px minimum, and collector buttons 56 px.
6. **Forgiving.** Ask for confirmation before anything with money. Errors say what happened and what to do next.

---

## 5. Visual identity

### 5.1 Logo

- **Mark:** a PET bottle with the naira sign drawn inside. Two amber bars break out of the bottle (plastic becomes cash).
  - Built on a 64-unit grid with an 18-unit corner radius.
  - Files are in `design/logo/`: `plasticash-mark.svg`, `-reversed.svg` and `-mono.svg`.
- **Wordmark:** "Plasti**Cash**" in Bricolage Grotesque ExtraBold with −3% tracking. "Cash" is green on light backgrounds and gold `#FBBF24` on dark ones.
- **Sub-line:** "by EcoCyclers" in small caps with wide tracking.
- **Minimum size:** 32 px, so it works as the favicon and on collector screens.
- **Ops portal:** shows "OPS PORTAL" under the wordmark.

### 5.2 Colour

| Token | Hex | Use |
|---|---|---|
| `primary` | `#15803D` | Primary buttons, links, active nav, progress |
| `primary-dark` | `#14532D` | Gradients, deep accents |
| `forest` | `#052E16` | Hero, ops sidebar, totals rows, dark screens |
| `heading` | `#0B3B20` | Headings on light backgrounds |
| `leaf` | `#22C55E` | Focus ring, progress gradient start, chart series 2 |
| `mint` | `#DCFCE7` | Selected nav item, icon tiles, success badges |
| `mist` | `#F0FDF4` | Selected cards, info panels |
| `amber` | `#F59E0B` | Withdraw and "Start earning" buttons, ESG download, warnings (always with dark text `#0B3B20`) |
| `gold` | `#FBBF24` | "pts" suffix and highlights on dark backgrounds |
| `cream` | `#FEF3C7` | Wallet card, balance chip, countdown chip |
| `ink` | `#0F172A` | Body text |
| `muted` | `#64748B` | Secondary text |
| `border` | `#E2E8F0` | Card borders and dividers |
| `input` | `#CBD5E1` | Input borders |
| `canvas` | `#F8FAFC` | Page background |
| `danger` | `#DC2626` | Errors, disputes, "Something's wrong" |

- The product is **light mode only** for the MVP.
- Signature surfaces:
  - **Wallet card:** a gradient from `#15803D` to `#052E16` with a faint logo watermark.
  - **Hero:** a gradient from `#052E16` to `#166534` with a soft green glow.

### 5.3 Pickup status badges

Every badge has a label and an icon. Colour is never used alone.

| Status | Label | Background / text |
|---|---|---|
| REQUESTED | Requested | `#F1F5F9` / `#475569` |
| ASSIGNED | Assigned | `#DBEAFE` / `#1D4ED8` |
| EN_ROUTE | On the way | `#E0E7FF` / `#4338CA` |
| AWAITING_CONFIRMATION | Please confirm | `#FEF3C7` / `#B45309` |
| DISPUTED | Under review | `#FEE2E2` / `#B91C1C` |
| COMPLETED | Paid | `#DCFCE7` / `#15803D` |
| CANCELLED | Cancelled | `#F1F5F9` / `#94A3B8`, struck through |

### 5.4 Typography

| Role | Font | Weights |
|---|---|---|
| Display, headings, balances | **Bricolage Grotesque** | 600–800, tracking −2% to −4.5% |
| UI and body | **Plus Jakarta Sans** | 400–700 |
| Numbers, kg, refs, codes, ledger | **Geist Mono** | 400–600, tabular figures |

All three are free on Google Fonts; load them with `next/font/google`. The mono face makes money columns line up, and it separates 0 from O and 1 from l in SMS codes.

| Style | Phone | Laptop |
|---|---|---|
| Landing hero | 40 / 0.98 | 84 / 0.95 |
| Section title (landing) | 30 | 46 |
| Page title | 26 | 24 (top bar) |
| Card title | 17 | 17–18 |
| Body | 15–16 | 15 |
| Small / help | 12–13 | 12–13 |
| Overline (mono caps, +12% tracking) | 11 | 11–12 |
| Balance figure | 46–48 | 54–60 |

### 5.5 Icons

- Use **Lucide** icons (they ship with shadcn): 20–24 px with a 2 px stroke. Always pair an icon with a text label in nav and on buttons.
- Material icons:
  - PET = `bottle`
  - Cans = `cylinder`
  - Hard plastic and tins = `package`
  - Sachets = `droplet`
- Icons sit on 40 px tiles with a 12 px radius, tinted with `mint`.

### 5.6 Shape, space and depth

- **Radius:**
  - Cards: 20 px (shadcn `--radius` 0.75rem is the base).
  - Hero and wallet cards: 24 px.
  - Buttons: 14 px.
  - Inputs: 12 px.
  - Badges and chips: pill.
- **Spacing:** 8 px grid. Gutters are 16 px on phones and 32 px in the laptop content area. Cards use 18–24 px padding.
- **Shadows:** soft and green-tinted (`rgba(5,46,22,…)`). Only raised elements get one: the wallet card, the primary button, the active pickup and toasts.

---

## 6. Layout shells

### 6.1 Public site (`/`, `/guide`, `/login`, `/signup`)

- **Laptop:**
  - Full-width forest hero, with the nav: logo, How it works, Prices, For organizations, Bottle guide, Log in, and "Start earning" (amber).
  - Content runs to 1280 px with 72 px side padding.
- **Phone:** the logo and a menu button, then the hero. Prices sit directly under the fold.
- **Auth pages on a laptop:** a split screen. A 600 px photo carousel sits on the left and the form on the right, max 560 px wide.

### 6.2 User area (`/app/...`)

- **Laptop:**
  - **248 px white sidebar** containing:
    - logo
    - full-width green **Request pickup** button
    - Home, Pickups, Wallet, Impact and Settings (the active item is mint)
    - a help card at the bottom: hub address and "Chat on WhatsApp". Organizations see "Monthly ESG report" here instead.
  - **Top bar:** page title and subtitle on the left. On the right: a balance chip ("2,450 pts (₦2,450)" on cream), notifications, then the avatar with name and account type.
- **Phone:**
  - Top area: greeting and notifications.
  - **Bottom nav:** Home, **Request** (raised green square button in the middle), Pickups, Wallet, Impact.

### 6.3 Collector (`/collector/...`)

- Phone only, with a forest header.
- One job per screen, with full-width 56 px buttons in this order: Start trip → Scan QR → Weigh → Get code.
- No decoration and no motion beyond button feedback.

### 6.4 Ops portal (`/ops-portal/...`)

- Desktop with a **240 px forest sidebar** containing Overview, Pickups (count), Disputes (red count), Withdrawals (count), Prices, Users and collectors, and Stock and bales.
- The content area uses 30 px padding, a 32 px page title, filter inputs at the top right, then stat cards and tables.
- The portal is not linked from the public site.

---

## 7. Components (daisyUI `d-` prefix + shadcn/ui)

The rule from the spec: **daisyUI for buttons, badges, progress and carousels; shadcn for forms, dialogs, drawers, toasts and tables.** Both libraries read one palette from `theme.css`.

| Component | Built with | Notes |
|---|---|---|
| Button | `d-btn` | Variants: primary (green), accent (amber), outline, ghost, danger (red outline), glass (on dark). Heights: 52 default, 58 large, 40 small, 56 collector |
| StatusBadge | `d-badge` | Table in 5.3; icon + label |
| Progress to 50 kg | `d-progress` | Leaf-to-green gradient, 12 px tall, with the "N kg more for a door pickup" label |
| Stepper | custom | Phone: 5 segments + "Step n of 5". Laptop: numbered circles joined by lines (done = mint ✓, current = green) |
| Timeline | custom | Vertical on phone, horizontal on laptop; done = green ✓, waiting = amber with a halo |
| MoneyDisplay | custom | Big Bricolage figure + gold/amber "pts" + mono "(₦…)" line |
| Wallet card | custom | Forest gradient, Withdraw (accent) + History (glass) |
| Counter | custom | − value + for sacks, bags and bottles; the plus side is green |
| Material toggle card | custom | Selected = 2 px green border, mist fill, green tick |
| Inputs, Select | shadcn `Input`, `Select` | 52 px tall; focus = 2 px green; error = 2 px red + message under the field |
| InputOTP | shadcn `InputOTP` | 6 boxes, mono 24 px |
| Withdraw confirm | shadcn `Drawer` (phone) / `Dialog` (laptop) | Shows the amount, bank and arrival time before money moves |
| Toasts | Sonner | Forest background; bottom-centre on phone, bottom-right on laptop; 4 s |
| Data table | shadcn `Table` | Mono numbers right-aligned; mono uppercase header on `canvas` |
| Weight table | shadcn `Table` | Material · kg · ₦/kg · points; deduction rows in amber, indented; forest total row |
| Map | Leaflet | Muted green base map; the collector is an amber marker with a truck; home is a green dot; dotted route; "6 min · 1.2 km away" chip |
| QR card | `qrcode.react` | Logo in the centre; caption "Show this to your collector" |
| Carousel | `d-carousel` + small script | See section 8 |
| Skeleton | shadcn `Skeleton` | Shaped like the content; never a blank screen |

---

## 8. Carousels

Three carousels appear in the mockup. All of them follow these rules:

- They pause when the user prefers reduced motion.
- Every slide can be reached with dots and with arrows or swipes.
- Dots are 8 px. The active dot stretches to 26 px: green on light backgrounds, gold on dark.

| Where | Behaviour |
|---|---|
| **Landing hero** (`/`, laptop) | Three slides, cross-fade, auto-advance every 5 s, prev/next arrows + dots. Each slide pairs a headline with a photo. Built 13 Oct 2026: photos and headlines are managed by admins in `/ops-portal/hero` (brand slides until photos exist); the carousel takes the place of the price board, and prices stay in the section below |
| **Landing hero** (`/`, phone) | Photo-only carousel above the headline, auto-advance 4.5 s |
| **Sign-up** (`/signup`, laptop) | Full-height photo panel, 3 slides with headline + one line, auto-advance 4.5 s |
| **Welcome** (`/welcome`, phone, first visit only) | Three swipeable slides with a bottom sheet: copy, dots, **Skip** and **Next**. The last slide's button says **Get started** |
| **Stories from Enugu** (`/`) | Horizontal scroll-snap row of 380 px story cards with arrow buttons; no auto-advance |

Welcome slide copy:
1. "Your plastic is money." Gather bottles, cans and sachets. We buy them by the kilo, and you see the price before we come.
2. "We weigh it in front of you." A verified collector comes to your gate. Every kilo is weighed and photographed.
3. "Paid in seconds. Withdraw anytime." Confirm the weight and points land in your wallet. 1 point = ₦1, sent to any Nigerian bank.

---

## 9. Pages

Every route below exists in the mockup. **L** = laptop layout, **P** = phone layout.

### Public
- **`/` Landing**
  - L + P.
  - Hero carousel ("Your plastic is money.", Start earning, See today's prices).
  - Price cards per kg: PET ₦180, cans ₦250, hard plastic ₦120, sachets ₦90, tins ₦60. The top seller is shown on forest. Each card carries a hint such as "≈ 50 bottles = 1 kg".
  - "Stories from Enugu" carousel.
  - Impact band: kg recycled, points paid, CO₂ avoided.
  - Still to design (in the spec but not yet in the mockup): how it works, for individuals and organizations, FAQ, and the footer with the hub address and WhatsApp.
- **`/guide`:** bottles per kg per material, a photo of one full sack, and the hub address and hours (21A Off Umuawulu, by Ugwuaji, Enugu/PH Expressway, Mon–Sat 8 am to 5 pm).
- **`/signup`:**
  - Layout: L split screen with the carousel; P is a form with step segments.
  - Step 2 asks "Who's recycling?" with Just me / Organization cards, then full name, phone (+234), area and street.
- **`/login`:** a hub photo header on P, then email, password, "Forgot password?", Log in, and "Chat with us on WhatsApp".

### User
- **`/app` Dashboard**
  - L shows the wallet and the active pickup side by side. P stacks them.
  - Wallet card.
  - "Got another sack ready?" call-to-action.
  - Three impact stats: kg, CO₂, pickups.
  - Active pickup card: map, collector, 5-step track and "Show my QR code".
  - Recent activity table.
  - Enugu photo banner: "4,120 kg kept out of our drains".
- **`/app/notifications`** (P): pickup, payment and price alerts, using the same words as the SMS messages.
- **`/app/request`:** five steps.
  - **1 Materials:** large toggle cards.
  - **2 Estimate:** counters per material. L adds a sticky estimate panel with kg, points, the progress bar to 50 kg and the two under-50 kg options ("Join the next area pickup day" or "Drop it at the hub").
  - **3 Photo:** camera and preview.
  - **4 Location and time:** draggable map pin, "Use my location", area, date and window.
  - **5 Review:** summary card, then Request pickup.
  - **Sent:** clear next step.
- **`/app/pickups`:** filter chips (All, Active, Paid) and rows grouped by month with badges.
- **`/app/pickups/[id]`:**
  - **On the way:** map with the distance chip, the collector with a verified badge and call/message buttons, and the QR card.
  - **Please confirm:**
    - Progress track: horizontal on L, vertical on P.
    - "Auto-confirms in 41 h 12 m" chip.
    - The collector's scale photo next to the weight table: PET 21.30 kg; −0.60 kg for "wet, caps on"; cans 3.80 kg; total **4,676 pts (₦4,676)** for 24.50 kg net.
    - Buttons: **Confirm and get paid** (primary) and **Something's wrong** (danger outline).
    - SMS-code fallback.
  - **Dispute:** reason radio cards, claimed kg (with "Emeka recorded 24.50 kg"), the user's photo and a note. The button is "Send for review".
  - **Paid** (P): the one celebration: confetti, "+4,676 points", new balance, CO₂ saved, Withdraw to bank and Rate Emeka.
- **`/app/wallet`**
  - Cream balance card, verified bank row and withdraw form: quick amounts ₦1,000 / ₦2,000 / All, with the "Minimum ₦1,000" help text.
  - L shows the full ledger table (date, what, status, points, running balance) with All / Earned / Withdrawals filters.
  - The confirm step is a Drawer (P) or Dialog (L).
- **`/app/settings`:** profile, and bank details. Picking a bank and entering the account number shows the resolved name ("CHINAZA OKAFOR") before Save.
- **`/app/impact`**
  - Individual: kg by material and CO₂.
  - Organization:
    - Photo stat "1,240 kg in 2026".
    - Stats: 1,860 kg CO₂ avoided, 186,400 pts earned, 18 pickups.
    - Stacked monthly bar chart: PET green, sachets leaf, cans amber.
    - ESG report card with a month/year picker and an amber **Download PDF** button.
- **ESG report PDF:** one A4 page in the same brand: logo, period, "Prepared for", big numbers, a by-material table, a statement line and the EcoCyclers sign-off.

### Collector (P only)
- **`/collector`:** forest header with the collector's name and ID and an "Online" pill. Day stats: done, kg to collect, route km. The job list is ordered; the next job is outlined, marked **NEXT** and has a **Start trip** button.
- **`/collector/pickups/[id]`:**
  - **Scan QR:** camera view with a match card.
  - **Weigh:** one row per material with large numeric inputs, a deduction toggle with a reason, a photo, and a running total pinned at the bottom.
  - **Get the code:** 6-digit OTP, or "She'll confirm on PlastiCash".
- **`/collector/walk-in`:** search by phone, then the weigh step, then OTP.

### Ops portal (L only)
- **`/ops-portal/pickups`:**
  - Stats: kg this month, points paid, pending withdrawals, open disputes, raw stock.
  - Estimated-kg bars per area for pooling; areas under 50 kg are amber.
  - Table with Assign and Add to pool actions, plus area and date filters.
- **`/ops-portal/disputes`:** collector photo and customer photo side by side with each weight table and the customer's words. Then final kg per material, a note, and **Resolve and pay N pts**.
- **`/ops-portal/withdrawals`:** queue table with user, amount, bank and status; select rows to approve in bulk; reject asks for a reason.
- **`/ops-portal/stock`:** cards per material (raw kg; bales in store, processed and sold) and a bales table with status actions and real loss %.
- **Still to design:** `/ops-portal` overview, prices and users. Build them with the same shell and table patterns.

---

## 10. Photography

**Real photos from Enugu only.** That means Nigerian people, EcoCyclers vests and sacks, and recognisable streets. No foreign stock and no beaches or turtles.

- **Look:** warm natural light, late morning or golden hour. Real faces and real hands, never staged smiles at the camera.
- **Delivery:** WebP through Cloudinary (`f_auto,q_auto,w_…`).
- **Text over photos:** add a dark forest gradient from the bottom so the text stays readable.
- **Shot list:** the mockup labels every photo slot with the shot it needs.

| # | Shot | Used on |
|---|---|---|
| 1 | Mother hands a sack of bottles to a collector at her gate, Independence Layout | Hero, sign-up, welcome 1 |
| 2 | Collector in an amber vest weighs a sack on a hanging scale | Hero, sign-up, welcome 2, stories |
| 3 | Young woman smiles at her phone on the porch as her points arrive | Sign-up, welcome 3, stories |
| 4 | Green Hills students carry sacks of bottles across the school yard | Impact (organization), hero, stories |
| 5 | Clean drain on Zik Avenue after a community pickup day | Dashboard banner, stories |
| 6 | EcoCyclers hub on the Enugu/PH Expressway: bales, scale and today's price board | Log in, guide, stories |
| 7 | One full EcoCyclers sack of PET bottles next to a 1 kg bundle | Bottle guide, request estimate |
| 8 | Close-up of a scale reading (collector's proof photo) | Confirm weights, disputes |
| 9 | Bales leaving the hub on a truck | Stories, ops |

The photo slots in the mockup are illustrated placeholders. Figma's AI image credits ran out before real images could be generated.

---

## 11. Voice and copy

- Use simple English, short sentences and second person: "Your pickup is on the way."
- Greet by name: "Welcome, Chinaza" or "Welcome, Green Hills School".
- Celebrate earnings with the reason: "You earned 4,676 pts from 24.5 kg of plastic. That's about 1,200 bottles out of Enugu's drains."
- Explain the 50 kg rule kindly: "26 kg more for a door pickup. Join Saturday's area pickup day, or drop it at the hub."
- Errors give the fix: "That account number didn't match a bank account. Check the number and the bank."
- Keep all copy in one file so Igbo and Pidgin translations can be added later.

## 12. Motion

Built 13 Oct 2026 (landing, blog list, events): sections and cards fade and rise in as they scroll into view, impact
numbers count up, the hero carousel cross-fades. The hero text, first image and page headings are never faded in, so the
largest content paints at once (LCP). Reduced motion is honoured in CSS (`[data-reveal]` forced visible), so nothing is
hidden before scripts load. The animation engine (`motion`, lazy features) loads after the page.

- **Timing:** 150–250 ms with ease-out. Carousels cross-fade over 600–700 ms.
- **Use motion to explain change:**
  - a timeline step advancing
  - the balance counting up when points arrive
  - the collector marker gliding on the map
- **One celebration only:** confetti on the Paid screen.
- **Respect `prefers-reduced-motion`:** turn off auto-advance, confetti and count-ups.
- **Collector screens:** no motion beyond press feedback.

## 13. Feedback states

- **Loading:** Skeletons shaped like the content.
- **Toasts:** every form submit gets one. Success uses forest with a green tick; errors use red.
- **Empty states:** a small illustration, one line and one action. For example: "No pickups yet. Gather your plastic and request your first pickup."
- **Offline:** a thin banner: "You're offline. We'll retry when you're back."
- **Confirm dialogs** before:
  - withdrawing
  - confirming a weight
  - raising a dispute
  - approving a withdrawal
  - resolving a dispute

## 14. Accessibility

- Meet WCAG AA contrast. Amber always carries dark text; white text on amber is not allowed.
- Show visible focus rings: 3 px `leaf` with a 2 px offset.
- Give every input a real label, not just a placeholder. Show errors next to the field and announce them.
- Everything must work without hover. Carousels can be operated by keyboard and expose "Slide n" labels.
- Status is never shown by colour alone.

## 15. Physical brand

- **EcoCyclers sack:** one standard size, green with the logo and two amber bands, printed "Fill me with bottles. We pay." The app's estimate counts in these sacks.
- **Collector vest:** amber, with the logo and staff ID.
- **Hub signboard:** shows today's prices, matching `/prices/current`.

## 16. Hand-off to build

1. Set up `design/theme.css` (daisyUI theme `plasticash` with prefix `d-`, plus the shadcn variables) and the three fonts.
2. Build the shared components first: Button, StatusBadge, MoneyDisplay, Stepper, Timeline, WeightTable, Carousel, EmptyState, AppShell (sidebar + bottom nav) and OpsShell.
3. Build the routes in `specs/06-build-order.md` order, checking each one against the mockup at both 360 px and 1280 px.
4. Swap the photo placeholders for the shot list in section 10 as the photos come in.

**Assets:**
- `design/logo/` holds the logo SVGs.
- `design/mockups/index.html` is the mockup source.
- `design/mockups/png/` holds all 40 screens.
- The Figma file is https://www.figma.com/design/1Q7WdEhbVsIjEm3saoBtoj. It has the brand system plus the earlier phone-app screens, not the web app layouts.
