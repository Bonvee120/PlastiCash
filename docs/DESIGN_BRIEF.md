# Design Brief
## PlastiCash by EcoCyclers

How PlastiCash should look, feel and read. Use it with `specs/03-screens-and-routes.md`, which lists every page.

## 1. The product in one line

PlastiCash pays people in Enugu for their plastic waste: request a pickup, get it weighed, get paid, see your impact.

## 2. Who we design for

| Person | Situation | What they need from the design |
|---|---|---|
| **Chinaza**, mother of three, Independence Layout | Mid-range Android phone, data is expensive, uses WhatsApp daily | Clear steps, few words, knows exactly what she will be paid and when |
| **Emeka**, waste picker | Cheap Android, cracked screen, often outdoors in bright sun, limited reading | Huge buttons, icons with labels, high contrast, numbers he can trust, fast loading |
| **Mrs Okoye**, admin officer at Green Hills School | Laptop and phone, reports to the principal | Professional look, the ESG report, a history she can show others |
| **Collector** (EcoCyclers staff) | Phone in one hand, sack in the other, in the street | One action per screen, thumb-reachable buttons, works on a slow network |
| **Admin** (EcoCyclers office) | Desktop | Dense, scannable tables, filters, nothing hidden |

Most users are on **phones with slow or expensive data**. Design for a 360 px wide screen first, then scale up.

## 3. Brand personality

**Trustworthy, hopeful, local, simple.**

- It handles people's money, so it must feel **reliable** like a bank app, not playful like a game.
- It's about cleaner streets and earning, so it should feel **positive and green**, not preachy about the environment.
- It's from **Enugu**, so it should use local names, local places and Nigerian photos, not foreign stock images.
- **Plain words.** "Your plastic is money", not "Monetize your recyclable waste stream."

## 4. Design principles

1. **Money is always clear.** Every amount shows points and naira: **2,450 pts (₦2,450)**. Never hide how a payout was calculated: show kg × price per material.
2. **One main action per screen.** One primary button, so the user always knows what to do next.
3. **Show where things are.** A pickup always shows its current step on a progress timeline.
4. **Light on data.** Compress images, avoid autoplay video, show skeletons while loading, and keep the user dashboard under about 500 KB.
5. **Readable outdoors.** High contrast, at least 16 px body text, tap targets at least 48 px.
6. **Forgiving.** Confirm before anything with money; explain errors in plain words with what to do next.

## 5. Visual identity

### Logo

Wordmark **"PlastiCash"** with a simple mark: a bottle shape merged with a naira sign or a coin. Sub-line "by EcoCyclers". It must work in one colour and at 32 px (favicon, collector screen). Until a designer makes one, use the wordmark in the heading font with a Lucide `recycle` icon.

### Colour palette

| Token | Hex | Use |
|---|---|---|
| `primary` | `#15803D` | Main buttons, links, active nav (green, readable on white) |
| `primary-dark` | `#14532D` | Headings on light backgrounds, footer |
| `primary-light` | `#DCFCE7` | Highlight backgrounds, selected cards |
| `accent` | `#F59E0B` | Points, earnings, celebration moments (use dark text on it) |
| `accent-light` | `#FEF3C7` | Wallet card background |
| `ink` | `#0F172A` | Body text |
| `muted` | `#64748B` | Secondary text |
| `border` | `#E2E8F0` | Lines, card borders |
| `surface` | `#FFFFFF` | Cards |
| `background` | `#F8FAFC` | Page background |
| `danger` | `#DC2626` | Errors, disputes |
| `info` | `#2563EB` | Informational states |

Set these once as CSS variables for shadcn (`--primary` etc.) **and** as the daisyUI theme, so both libraries use the same colours. Light mode only for the MVP.

### Pickup status colours (badges and timeline)

| Status | Label shown to users | Colour |
|---|---|---|
| REQUESTED | Requested | slate |
| ASSIGNED | Collector assigned | blue |
| EN_ROUTE | On the way | indigo |
| AWAITING_CONFIRMATION | Please confirm | amber |
| DISPUTED | Under review | red |
| COMPLETED | Paid | green |
| CANCELLED | Cancelled | slate, struck through |

Never use colour alone: every badge also has a text label and an icon.

### Typography

- **Headings:** Plus Jakarta Sans, 600–700 (Google Fonts, loaded via `next/font`).
- **Body and UI:** Inter, 400–500.
- **Numbers** (balances, kg): Inter with tabular figures, so columns line up.
- Sizes (mobile): body 16, small 14, h3 20, h2 24, h1 30, balance figure 36. Desktop scales h1 to 44 on the landing page.

### Icons

Lucide icons (they ship with shadcn), 24 px, 2 px stroke. Always paired with a text label on nav and buttons. Material icons per type: PET = bottle, Plastic = container, Sachet = droplet, Can = cylinder, Tin = box.

### Imagery

- Real photos from Enugu: collectors in EcoCyclers uniform, sacks at the hub, a school handing over plastic, clean drains vs. clogged drains. Take them during your research visits.
- Until then, use simple flat illustrations with Nigerian people, in the brand colours (e.g. from unDraw with the colour set to `#15803D`).
- No foreign stock photos of beaches and turtles.
- Images compressed (WebP), served through Cloudinary with automatic format and width.

### Shape and spacing

- Corner radius 12 px on cards, 10 px on buttons and inputs, pills for badges.
- 8 px spacing grid. Mobile page padding 16 px.
- Soft shadows only on raised cards (wallet, active pickup).

## 6. Voice and copy

- Simple English, short sentences, second person ("Your pickup is on the way").
- Greet by name: "Welcome, Chinaza" / "Welcome, Green Hills School".
- Celebrate earnings: "You earned 2,450 pts from 13.5 kg of plastic."
- Explain the 50 kg rule kindly: "About 12 kg so far. Door pickup starts at 50 kg. Keep saving, or drop it at our hub."
- Errors say what happened and what to do: "That account number didn't match a bank account. Check the number and the bank."
- Later: Igbo and Pidgin translations. Keep all text in one file so this is easy.

## 7. Motion (Framer Motion)

- Subtle and quick: 150–250 ms, ease-out.
- Use it to explain change: page transitions, timeline step advancing, balance counting up when points are credited, collector marker gliding on the map.
- One celebration only: a small confetti or pulse when a pickup is paid.
- Respect `prefers-reduced-motion`: turn animations off.
- Never animate on the collector screens beyond basic feedback; speed matters there.

## 8. Feedback states

- **Loading:** shadcn Skeletons shaped like the content (cards, rows), never a blank screen.
- **Toasts (Sonner):** success green, error red, bottom-centre on mobile, 4 s. Every form submit gets one.
- **Empty states:** a small illustration, one line and one action. E.g. no pickups yet: "No pickups yet. Gather your plastic and request your first pickup." with a button.
- **Offline/slow:** a thin banner "You're offline. We'll retry when you're back."
- **Confirm dialogs** before: withdrawing, confirming a weight, raising a dispute, approving a withdrawal, resolving a dispute.

## 9. Key screens: layout notes

### Landing page (`/`)
1. **Hero:** headline "Your plastic is money.", sub-line "We pick up your plastic in Enugu, weigh it, and pay you.", primary button "Start earning", secondary "See prices". Photo or illustration of a family handing a sack to a collector.
2. **Problem:** three short cards: no incentive, no convenience, no visibility, with the drains-and-floods photo.
3. **How it works:** 5 numbered steps with icons in a row (stacked on mobile).
4. **What we pay today:** live price cards per material from the API, with "about 50 bottles ≈ 1 kg" from the guide.
5. **For individuals / For organizations:** two columns; the organization side mentions the ESG report.
6. **Impact counter:** total kg recycled, points paid, CO₂ saved (animated count-up).
7. **FAQ**, then a final call to action, and a footer with the hub address and a "Chat on WhatsApp" link.

### User dashboard (`/app`)
- Top: "Welcome, Chinaza" and a small avatar.
- **Wallet card** (amber-light background): big balance in points with naira under it, "Withdraw" button.
- **Active pickup card**: status badge, timeline, and a map preview when the collector is on the way.
- Big primary button: **"Request pickup"**.
- Impact strip: kg recycled · CO₂ saved · pickups.
- Bottom nav with 5 items: Home, Request, Pickups, Wallet, Impact.

### Request pickup (`/app/request`)
- A stepper (1 of 5) at the top; one question per step, "Back" and "Next" at the bottom within thumb reach.
- Materials as large toggle cards with icons.
- Estimate step: +/– counters for sacks, bags or bottles, with a **live progress bar to 50 kg** and the estimated payout updating as they tap.
- Photo step: camera button, preview.
- Location: map with a draggable pin, "Use my location" button, address field, area dropdown.
- Review: summary card, then "Request pickup".

### Pickup detail (`/app/pickups/[id]`)
- Vertical timeline of steps with times.
- While the collector is on the way: full-width map, collector's first name, "on the way" text, and the QR code in a card ("Show this to your collector").
- While awaiting confirmation: weight table (material · kg · price · amount), the collector's photo, total in big text, two buttons **"Confirm and get paid"** (primary) and **"Something's wrong"** (outline), and a countdown "Auto-confirms in 41 h".

### Collector job (`/collector/pickups/[id]`)
- Full-width buttons, 56 px tall, one step at a time: **Start trip → Scan QR → Weigh → Get code**.
- Weigh screen: one row per material with large number inputs (numeric keyboard), deduction toggle, photo button, running total at the bottom.
- High contrast, no decoration.

### Admin portal (`/ops-portal`)
- Left sidebar on desktop; data tables with filters and status badges.
- Pickups board: columns by status (kanban-style) or a table with an "area totals" bar on top showing estimated kg per area for pooling.
- Disputes: two photos side by side with the weights under each.
- Stock: cards per material (raw kg, bales in store / processed / sold), bales table.

### ESG report PDF (organizations)
A4, one page: logo and organization name at the top; period; big numbers (kg recycled, CO₂ saved, pickups); a table by material; a short statement "Green Hills School diverted 1,240 kg of plastic from Enugu's drains in 2026"; an EcoCyclers sign-off. Same colours and fonts as the app.

## 10. Accessibility

- WCAG AA contrast for all text (the palette above passes on white for `primary`, `ink` and `muted`).
- Visible focus rings on everything.
- Labels on every input, not just placeholders.
- Errors announced and shown next to the field.
- Everything works without hover (touch first).

## 11. Physical brand (beyond the app)

- **EcoCyclers sack:** one standard size, green with the logo and "Fill me with bottles. We pay." It anchors the estimate in the app ("3 full sacks").
- **Collector uniform/vest** with the logo and staff ID, which builds trust at the gate.
- **Hub signboard** with today's prices, which also matches the prices in the app.

## 12. What to hand Claude Code

This file plus `specs/03-screens-and-routes.md`. Ask it to set up the colour tokens, fonts and shared components (Button, Card, StatusBadge, MoneyDisplay, Timeline, EmptyState, Stepper) first, then build the screens with them.
