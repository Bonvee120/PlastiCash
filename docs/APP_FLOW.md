# App Flow
## PlastiCash by EcoCyclers

How each person moves through the app, step by step. Diagrams use Mermaid (they render on GitHub and in most Markdown viewers).

---

## 1. Navigation map

```mermaid
flowchart LR
  L[Landing /] --> G[Guide /guide]
  L --> S[Sign up]
  L --> LI[Log in]
  S --> R{Role}
  LI --> R
  R -->|USER| U[/app dashboard/]
  R -->|COLLECTOR| C[/collector today/]
  R -->|ADMIN| A[/ops-portal/]

  U --> U1[Request pickup]
  U --> U2[My pickups] --> U2a[Pickup detail]
  U --> U3[Wallet]
  U --> U4[Impact + ESG]
  U --> U5[Settings + bank]

  C --> C1[Pickup job]
  C --> C2[Hub walk-in]

  A --> A1[Pickups board]
  A --> A2[Disputes]
  A --> A3[Prices]
  A --> A4[Withdrawals]
  A --> A5[Users + collectors]
  A --> A6[Stock + bales]
```

## 2. Sign-up and onboarding

```mermaid
flowchart TD
  A[Open site] --> B[Sign up: email + password]
  B --> C{Individual or Organization?}
  C -->|Individual| D[Full name, phone, address, area]
  C -->|Organization| E[Org name, type, address, area, contact person, phone, CAC optional]
  D --> F[Profile saved]
  E --> F
  F --> G["Dashboard: Welcome, Chinaza / Welcome, Green Hills School"]
  G --> H[Prompt: add bank account to withdraw later]
```

Steps:
1. Sign up with email and password (Supabase).
2. Choose **Individual** or **Organization**; fill the matching fields.
3. Land on the dashboard with a personal greeting.
4. A card reminds them to add a bank account (needed only to withdraw).

## 3. Door pickup (main journey)

```mermaid
flowchart TD
  A[Request pickup] --> B[Choose materials]
  B --> C[Estimate: sacks / bags / bottles]
  C --> D{Estimated ≥ 50 kg?}
  D -->|No| E[Progress bar + hub address]
  E --> E1{User choice}
  E1 -->|Drop at hub| H1[See hub walk-in flow]
  E1 -->|Join area pickup day| F[Saved as pooled request]
  E1 -->|Keep saving| X[Back to dashboard]
  D -->|Yes| G[Photo, map pin, address, area, date + window]
  G --> I[Request sent: REQUESTED]
  F --> I
  I --> J[Admin checks photo + estimate, assigns collector + date: ASSIGNED]
  J --> K[User sees QR code]
  K --> L[Collector taps Start: EN_ROUTE]
  L --> M[User watches live map]
  M --> N[Collector scans user's QR]
  N --> O[Collector weighs each material, deductions, photo]
  O --> P[AWAITING_CONFIRMATION + SMS with weight, amount, code]
  P --> Q[Confirmation flow, section 5]
```

## 4. Hub walk-in

```mermaid
flowchart TD
  A[User arrives at hub] --> B[Hub collector searches user by phone]
  B --> C{Found?}
  C -->|No| D[User signs up on their phone first]
  D --> B
  C -->|Yes| E[Weigh each material, deductions, photo]
  E --> F[HUB pickup created: AWAITING_CONFIRMATION]
  F --> G[Confirmation flow, section 5]
```

## 5. Confirmation, dispute and auto-confirm

```mermaid
flowchart TD
  A[AWAITING_CONFIRMATION] --> B{What happens?}
  B -->|User taps Confirm in app| C[COMPLETED]
  B -->|User reads SMS code to collector| C
  B -->|User taps Something's wrong| D[Dispute form: photo, claimed kg, reason]
  D --> E[DISPUTED: nothing paid]
  E --> F[Admin compares both photos and weights]
  F --> G[Admin sets final kg per material + note]
  G --> C
  B -->|No answer| R1[Reminder at 2 h]
  R1 --> R2[Reminder at 12 h]
  R2 --> R3[Reminder at 24 h]
  R3 --> R4[48 h: auto-confirm]
  R4 --> C
  C --> P[Wallet credited once: points = naira]
  P --> N[User notified: You earned N pts]
```

After COMPLETED, a complaint goes to the admin, who can add an **adjustment** with a note. Nothing already recorded is edited.

## 6. Withdrawal

```mermaid
flowchart TD
  A[Wallet] --> B{Bank account saved?}
  B -->|No| C[Settings: pick bank, enter account number]
  C --> D[Paystack resolves account name]
  D --> E[User confirms name: recipient saved]
  E --> A
  B -->|Yes| F[Enter amount ≥ ₦5,000 and ≤ balance]
  F --> G[Confirm dialog]
  G --> H[PENDING: amount held from balance]
  H --> I{Admin review}
  I -->|Reject| J[REJECTED: amount returned]
  I -->|Approve| K[PROCESSING: Paystack transfer sent]
  K --> L{Paystack webhook}
  L -->|transfer.success| M[PAID]
  L -->|transfer.failed / reversed| N[FAILED: amount returned]
```

## 7. Collector's day

```mermaid
flowchart TD
  A[Log in] --> B[Today's assigned pickups]
  B --> C[Open next job]
  C --> D[Start trip: location shared]
  D --> E[Arrive: Scan QR]
  E --> F{QR matches?}
  F -->|No| E
  F -->|Yes| G[Weigh per material + photo]
  G --> H{Customer present?}
  H -->|Yes| I[Customer reads SMS code: COMPLETED]
  H -->|No| J[Customer confirms later in app]
  I --> B
  J --> B
```

## 8. Admin flows

### Daily dispatch
```mermaid
flowchart TD
  A[Pickups board: REQUESTED] --> B[Filter by area and date]
  B --> C[Check photo and estimate]
  C --> D{Looks right?}
  D -->|Doubtful| E[Call or message the user]
  E --> C
  D -->|Yes, ≥ 50 kg or area total worth a trip| F[Assign collector + date]
  D -->|Too small| G[Leave pooled until area total is enough]
```

### Prices
Add a new price version for a material (₦/kg, kg per sack, items per kg, CO₂ factor). It applies to all weighings from now on; earlier pickups keep their old price.

### Stock and bales
```mermaid
flowchart LR
  A[Completed pickups add raw kg] --> B[Raw stock per material]
  B --> C[Create bale ≤ raw stock: IN_STORE]
  C --> D[Mark PROCESSED]
  D --> E[Mark SOLD: buyer + price]
  B --> F[Real loss % shown]
```

## 9. Notifications

| Event | User sees | Channel |
|---|---|---|
| Pickup assigned | "Collector assigned for {date}" | In-app (Realtime + toast) |
| Collector on the way | Live map | In-app |
| Weighed | Weight, amount, code | SMS + in-app |
| Reminder | "Please confirm your pickup" | SMS (2, 12, 24 h) |
| Paid | "You earned N pts" | In-app |
| Dispute resolved | Final weight + note | In-app |
| Withdrawal paid / failed | Status change | In-app |

## 10. Pickup status reference

| Status | Meaning | Next |
|---|---|---|
| REQUESTED | Waiting for admin | ASSIGNED, CANCELLED |
| ASSIGNED | Collector and date set | EN_ROUTE, CANCELLED |
| EN_ROUTE | Collector travelling | AWAITING_CONFIRMATION |
| AWAITING_CONFIRMATION | Weighed, waiting for user | COMPLETED, DISPUTED |
| DISPUTED | Admin reviewing | COMPLETED |
| COMPLETED | Paid | final |
| CANCELLED | Cancelled | final |
