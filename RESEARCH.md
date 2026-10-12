# Research
## PlastiCash by EcoCyclers

Capstone research gate (Step 0 in `docs/specs/06-build-order.md`). No feature code starts until this file is signed off.

Checklist:
- [ ] 2 real conversations, with evidence
- [ ] Photo of a buy-back price board
- [x] 2 competitors
- [x] 3 cited sources
- [ ] 3 design decisions tied to findings
- [ ] Signed off

---

## 1. Conversations

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
| SACHET | No WARM recycling factor for LDPE film; proposed proxy: Mixed Plastics | (0.93) | 1.025 (to confirm) |
| CAN | Aluminum Cans | (9.13) | 10.064 |
| TIN | Steel Cans | (1.83) | 2.017 |

Open question: WARM has recycling factors only for HDPE, PET and PP ("due to LCI data limitations"). Sachets are LDPE film, so SACHET needs a decision: use the Mixed Plastics proxy above, or use 0 and claim no CO₂ for sachets.

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
| 1 | TODO | TODO | TODO |
| 2 | TODO | TODO | TODO |
| 3 | TODO | TODO | TODO |

---

## 5. Sign-off

| | |
|---|---|
| Signed off by | TODO |
| Date | TODO |
