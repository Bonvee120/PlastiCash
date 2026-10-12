# Research
## PlastiCash by EcoCyclers

Capstone research gate (Step 0 in `docs/specs/06-build-order.md`). No feature code starts until this file is signed off.

Checklist:
- [ ] 2 real conversations, with evidence
- [ ] Photo of a buy-back price board
- [x] 2 competitors
- [x] 3 cited sources
- [x] 3 design decisions tied to findings (from desk research; to confirm in the field)
- [ ] Signed off (provisional desk-research sign-off in section 5; field items still open)

---

## 1. Conversations

Status: **not done yet.** No interview has taken place. The tables below stay TODO until real conversations happen; use the question lists and record template under "Interview questions" below.

### Conversation 1: waste picker

| | |
|---|---|
| Who | TODO (role, area; first name only with permission) |
| Date and place | TODO |
| Evidence | TODO (photo, voice note or notes; file in `research/`) |

What they said:
- TODO: what they collect, how much, how often
- TODO: who buys it, at what price per kg, how they're paid
- TODO: what makes selling hard (transport, trust in the scale, late payment)

### Conversation 2: household or school

| | |
|---|---|
| Who | TODO |
| Date and place | TODO |
| Evidence | TODO |

What they said:
- TODO: what they do with plastic today
- TODO: how much they produce per week, and whether they'd store it to reach 50 kg
- TODO: would they trust an app with a weight and a bank payout

### Buy-back price board

| | |
|---|---|
| Location | TODO |
| Date | TODO |
| Photo | TODO (`research/price-board.jpg`) |

| Material | Price on board (₦/kg) |
|---|---|
| PET | TODO |
| Other plastics | TODO |
| Cans | TODO |
| Tin | TODO |
| Sachets / nylon | TODO |

Online comparison until the photo exists. This is not field evidence and not an Enugu price:

| Material | EcoCyclers opening price (`docs/product-description.md`) | Westman Recycle website, Lekki/Ajah, Lagos (checked 12 Oct 2026) |
|---|---|---|
| PET | ₦100 – ₦270 | ₦200 |
| Other / hard plastics | ₦280 | ₦120 |
| Cans (aluminium) | ₦400 | ₦500 |
| Tin (iron) | ₦200 | ₦300 |
| Sachets / nylon | ₦50 | ₦60 (nylon/plastic bags) |

Source: [westmanrecycle.com](https://westmanrecycle.com/) "Today's buy rates"; the page shows no date. A second listing (GreenBin, Surulere) was reported at PET ₦80/kg, but its page did not load for checking, so it is left out.

### Desk evidence (secondary; does not replace the conversations)

| Finding | Source |
|---|---|
| A survey of 1,274 waste pickers in 20 Lagos LGAs: about half earned ₦30,001–₦50,000 a month; common hazards were harassment (19%), injuries (13%), accidents (11%) and burns (7%). | Fagbo et al. 2025, *Journal of Community Health* 50(5) ([DOI](https://doi.org/10.1007/s10900-025-01463-9)) |
| 58.2% of 770 households in Lagos and the FCT did not separate plastic from general waste. Lagos households reported recycling (51.0%), open dumping (28.1%), burning (8.4%), waste-to-energy (6.9%), biodegradation (5.6%). | Oke & Olayide 2026, *Environmental Management and Sustainable Development* 15(2) ([article](https://www.macrothink.org/journal/index.php/emsd/article/view/23735)) |
| Buy prices for the same material differ a lot between buyers (PET: ₦100–₦270 at EcoCyclers vs ₦200 at Westman; hard plastics ₦280 vs ₦120). There is no national price list; LAWMA publishes a directory of recyclers, not prices. | Table above; [LAWMA recyclers directory](https://lawma.gov.ng/recyclers/) |
| Nigerian recycling services serve people without smartphones: Soso Care runs an app and a USSD service; Scrapays uses USSD; Wecyclers sends points by SMS. | [GSMA: Soso Care](https://www.gsma.com/solutions-and-impact/connectivity-for-good/mobile-for-development/digital-grantees-portfolio/soso-care/); section 2 |
| No source found shows how often buyers under-weigh or whether sellers trust the scale. This is an open question for the interviews. | — |

### Interview questions and record template

Waste picker: what you collect and kg in the last 7 days; how often you sell; who buys and the price per kg per material (clean vs dirty, sorted vs mixed); how you are paid and how long after weighing; bank account in your own name (never record numbers); ever cheated on weight, trust in the scale; how you carry plastic and what it costs; phone type (own, shared, none) and whether you would confirm a weight by app or SMS.

Household or school: what happens to PET, hard plastic, sachets and cans today; bags or sacks per week (weigh one bag if possible); would you store to 50 kg or carry to a hub, and how far is too far (time and fare); what would make you trust an app's weight and a bank payout; for a school, who would use a recycling report and for what.

```text
Interview ID:
Role:
First name (optional; permission received?):
Area / place:
Date and time:
Interviewer:
Consent to notes / voice note / photo: Yes / No each
Key answers (verbatim where useful):
Material and kg details:
Price/payment details:
Evidence filename(s) in research/:
Follow-up / uncertainty:
```

Never invent names, quotes, weights, prices or dates. Never record bank details.

---

## 2. Competitors

| | Competitor 1 | Competitor 2 |
|---|---|---|
| Name | Wecyclers | Scrapays |
| Where they operate | Lagos metropolis only | Five Nigerian states (only Lagos is named in the source) |
| How users get paid | Points per kg, exchanged for goods (food, household items, phone credit). Points notices by SMS. No cash or bank payout described. | Cash value goes into a mobile wallet; the user can move it to a bank account through USSD. Rates vary by material, season and market. |
| Pickup or drop-off | Free pickup from homes on cargo bikes ("wecycles"), later tricycles and vans, on a set schedule. App for pickup requests described in later coverage. | Pickup: the producer places an order, a collector weighs the items on site and pays; agents pool from several collectors. |
| What they do well | Free door pickup; works without a smartphone (SMS); long track record since 2012. | Cash to a bank, not goods; USSD for non-smartphone users; agent network that pools small loads. |
| Gap PlastiCash fills | Not in Enugu. Pays in goods, not money. | Not shown in Enugu. The sources describe no step where the seller confirms the weight before payment, and no proof of weight (photo). |
| Source | [TechXLab: Wecyclers](https://techxlab.org/solutions/wecyclers/); [The Guardian via Lionesses of Africa, Oct 2015](https://lionessesofafrica.com/blog/2015/10/22/meet-the-woman-transforming-recycling-in-lagos) | [BellaNaija, Oct 2022](https://www.bellanaija.com/2022/10/scrapays-recycling-company/); [TechCabal, Sep 2021](https://techcabal.com/2021/09/13/techcabal-daily-turning-trash-into-treasure-%f0%9f%92%b0/) |

Caveat: both rows rest on press coverage from 2015–2022. Check each company's current site or app before sign-off; services may have changed.

Also seen, not compared: RecyclePoints (Lagos), which pays points redeemable for household items or cash through its iRecycle store ([VC4A profile](https://vc4a.com/ventures/recyclepoints/)).

---

## 3. Sources

| # | Source | What we use it for | Link |
|---|---|---|---|
| 1 | Federal Ministry of Environment, *National Policy on Plastic Waste Management* (approved by the Federal Executive Council 2020) | The problem and the target. About 1.5 million tonnes of plastic waste a year in Nigeria, and less than 30% is collected for recycling (2017 field survey, PDF p. 16). Target: 50% of all plastic waste recycled by 2030 (PDF p. 24). The policy calls for "strategic plastic collection hub and recycling centers" and source-separation incentives (PDF p. 23), and for bringing informal collectors into the formal system (PDF p. 47). | [FAOLEX copy (PDF)](https://faolex.fao.org/docs/pdf/nig214338.pdf) |
| 2 | NESREA, *National Guideline for the Implementation of the Extended Producer Responsibility (EPR) Programme on Packaging (Plastic)* (announced Feb 2026) and the *National Environmental (Plastic Waste Control) Regulations, 2026* (Sep 2026) | Who pays. Producers and importers become responsible for recovering their plastic after use. The guideline defines Producer Responsibility Organisations (PROs) and proposes mandatory collection, recycling and recovery targets. NESREA calls the National Producer Registry "the foundation" for measuring performance. Verified, per-pickup kg collected is the kind of data PROs and producers will need. | [Landbell summary of the guideline, with link to the document](https://landbell-group.com/newsroom/tackling-plastic-packaging-in-nigeria/); [ThisDay, Sep 2026](https://www.thisdaylive.com/2026/09/04/nigeria-tightens-war-on-plastic-waste-makes-producers-responsible-for-end-of-life-products/); [NESREA FAQ: registering as a collector or PRO](https://nesrea.gov.ng/faq/) |
| 3 | US EPA, *Waste Reduction Model (WARM)* Version 16, Dec 2023 | CO₂ saved per kg, per material (`prices.co2_kg_saved_per_kg`). Factors below. | [WARM versions](https://www.epa.gov/waste-reduction-model/versions-waste-reduction-model); [Documentation: Containers, Packaging and Non-Durable Goods (PDF)](https://www.epa.gov/system/files/documents/2023-12/warm_containers_packaging_and_non-durable_goods_materials_v16_dec.pdf) |

### CO₂ factors for `prices.co2_kg_saved_per_kg`

Source: WARM v16 net recycling emission factors, in MTCO₂E per short ton. Plastics come from Exhibit 5-3 (PDF p. 73); metals from Exhibit 2-7 (PDF p. 20). Negative means emissions avoided. Converted to kg CO₂e per kg: × 1000 ÷ 907.185.

| Our material | WARM material | WARM net recycling (MTCO₂E/short ton) | `co2_kg_saved_per_kg` |
|---|---|---|---|
| PET | PET | (1.04) | 1.146 |
| PLASTIC | Mixed Plastics (40% HDPE, 60% PET) | (0.93) | 1.025 |
| SACHET | No WARM recycling factor for LDPE film; proxy: Mixed Plastics | (0.93) | 1.025 (estimate) |
| CAN | Aluminum Cans | (9.13) | 10.064 |
| TIN | Steel Cans | (1.83) | 2.017 |

WARM has recycling factors only for HDPE, PET and PP ("due to LCI data limitations"). Sachets are LDPE film. **Decision (12 Oct 2026):** use the Mixed Plastics proxy, 1.025, not 0. Label it as an estimate wherever CO₂ is shown (impact page, ESG PDF methodology), and replace it if a sachet-specific factor is found. The unit is kg CO₂e throughout.

---

## 4. Design decisions tied to findings

Each decision must point to a finding above. Candidates already in the docs that the research should confirm or challenge:
- 50 kg door minimum with hub and area pooling (`docs/app-logic.md` §11, §13)
- Estimates in EcoCyclers standard sacks, plus a photo (`docs/app-logic.md` §13)
- Collector weighs, user confirms in app or by SMS code (`docs/app-logic.md` §11)
- Points fixed at 1 point = ₦1 (`docs/app-logic.md` §11)
- Bank withdrawals only for the MVP (`docs/app-logic.md` §15)

| # | Finding | Decision | Where it shows in the product |
|---|---|---|---|
| 1 | Buy prices for the same material vary widely between buyers and change over time; there is no national price list (section 1, desk evidence and price comparison). | The admin sets prices per material as versions; each weighed item stores a snapshot of the price in force, so a later change never alters a past pickup. Users see today's prices before they sell. | `prices` table (versioned), price snapshot on `pickup_items`, `/ops-portal` prices, `/guide` and live prices on the landing page |
| 2 | Trust in the scale is unproven either way, and most households do not separate plastic, so contamination is likely (Oke & Olayide 2026: 58.2% do not separate). | The collector photographs the load and records gross kg, deduction kg with a reason, and net kg per material. The user must confirm, or dispute with their own photo, before any credit. | Collector weigh form, user confirm/dispute screen, admin disputes view with both photos |
| 3 | Nigerian services reach people without smartphones through USSD or SMS (Soso Care, Scrapays, Wecyclers). | The user can confirm a weight with a 6-digit SMS code given to the collector, not only in the app; reminders by SMS; auto-confirm after 48 hours. | OTP flow via Termii (`SMS_ENABLED`), `/jobs/reminders` |

Challenged by the research, to test in the field: the 50 kg door minimum. No source found shows that households reach 50 kg. The current design already sends loads under 50 kg to the hub (walk-ins, no minimum) or to area pooling; the interviews should check hub distance and fare.

Suggestions from the research, not adopted (would change the specs): a receipt with tare shown, a second weighing on request, and a price register with buyer, location and evidence photo.

---

## 5. Sign-off

| | |
|---|---|
| Signed off by | EcoCyclers Research Team (provisional; replace with a named person once they agree to sign) |
| Date | 12 October 2026 |
| Scope | Desk research only: competitors, sources, CO₂ factors, design decisions. |
| Still open | 2 real conversations with evidence; price board photo; check competitors' current services. |
