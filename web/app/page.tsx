import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Droplets,
  Flame,
  Home as HomeIcon,
  Landmark,
  Scale,
  ShieldCheck,
  Ship,
  Smartphone,
  Truck,
  Waves,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { EventRow, PostCard } from "@/components/content/cards";
import {
  CountUp,
  MotionRoot,
  Reveal,
  Stagger,
  StaggerItem,
} from "@/components/motion/reveal";
import { HeroCarousel } from "@/components/public/hero-carousel";
import { SiteFooter, SiteHeader } from "@/components/public/site-chrome";
import { Skeleton } from "@/components/ui/skeleton";
import { AREAS } from "@/lib/areas";
import { naira } from "@/lib/format";
import { getEvents, getHeroSlides, getPosts } from "@/lib/content";
import { getCurrentPrices, getImpactTotals } from "@/lib/public-data";
import { HUB, SITE_DESCRIPTION, SITE_URL, WHATSAPP_URL } from "@/lib/site";
import { MATERIALS } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: {
    absolute: "PlastiCash by EcoCyclers · Sell your plastic in Enugu for cash",
  },
  alternates: { canonical: "/" },
};

// Landing page (03-screens-and-routes.md, DESIGN_BRIEF.md §9). Prices and totals come from the public API through
// lib/public-data.ts (cached, so the page is prerendered); if the API is down the page still renders, without numbers.
// Structured data for search engines: the EcoCyclers hub as a local recycling centre (schema.org RecyclingCenter).
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "RecyclingCenter",
  name: "EcoCyclers (PlastiCash)",
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
  image: `${SITE_URL}/opengraph-image`,
  address: {
    "@type": "PostalAddress",
    streetAddress: HUB.address,
    addressLocality: "Enugu",
    addressRegion: "Enugu",
    addressCountry: "NG",
  },
  areaServed: { "@type": "City", name: "Enugu" },
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ],
    opens: "08:00",
    closes: "17:00",
  },
  ...(WHATSAPP_URL ? { sameAs: [WHATSAPP_URL] } : {}),
};

export default function LandingPage() {
  return (
    <MotionRoot>
      <div className="flex min-h-svh flex-col bg-canvas">
        <script
          type="application/ld+json"
          // Static object from this file; "<" escaped so the JSON can never close the script tag.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c"),
          }}
        />
        <SiteHeader dark />
        <section
          className="relative overflow-hidden text-white"
          style={{
            background:
              "linear-gradient(160deg, #052E16 0%, #14532D 55%, #166534 100%)",
          }}
        >
          <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 pt-6 pb-16 lg:grid-cols-[1.1fr_1fr] lg:px-[72px] lg:pt-14 lg:pb-24">
            {/* Hero shows at once (no fade): it holds the largest text and image, so fading would delay LCP. */}
            <div className="flex flex-col gap-6">
              <span className="eyebrow text-[#86EFAC]">
                Enugu · by EcoCyclers
              </span>
              <h1 className="font-display text-[44px] !text-white leading-[1.02] font-extrabold tracking-[-0.04em] lg:text-[72px]">
                Your plastic <br className="hidden sm:block" />
                is <span className="text-gold">money.</span>
              </h1>
              <p className="max-w-xl text-lg text-[#DCFCE7]">
                Gather bottles, cans and sachets. A verified EcoCyclers
                collector weighs them in front of you, you confirm the weight,
                and the points land in your wallet. 1 point = ₦1, withdrawn to
                any Nigerian bank.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/signup"
                  prefetch={false}
                  className="d-btn d-btn-accent d-btn-lg"
                >
                  Start earning <ArrowRight className="size-5" aria-hidden />
                </Link>
                <a href="#prices" className="d-btn d-btn-glass d-btn-lg">
                  See today&apos;s prices
                </a>
              </div>
            </div>
            <div className="order-first lg:order-none">
              <Suspense
                fallback={
                  <Skeleton className="aspect-[5/4] w-full rounded-3xl bg-white/10" />
                }
              >
                <HeroSlides />
              </Suspense>
            </div>
          </div>
        </section>

        <main className="flex flex-col">
          <Section
            id="prices"
            eyebrow="What we buy"
            title="Today's prices per kg"
          >
            <Suspense
              fallback={<Skeleton className="h-48 w-full rounded-2xl" />}
            >
              <PriceCards />
            </Suspense>
            <p className="text-sm text-muted-foreground">
              Prices can change; the price on the day the collector weighs is
              the one you&apos;re paid.{" "}
              <Link href="/guide" className="font-bold text-primary">
                How many bottles make a kilo?
              </Link>
            </p>
          </Section>

          <Section
            eyebrow="The problem"
            title="Plastic blocks drains, floods streets and gets burned"
          >
            <Stagger className="grid gap-4 md:grid-cols-3">
              <Fact
                icon={Waves}
                value="1.5 million tonnes"
                source={
                  <Cite href="https://faolex.fao.org/docs/pdf/nig214338.pdf">
                    National Policy on Plastic Waste Management
                  </Cite>
                }
              >
                of plastic waste a year in Nigeria, and less than 30% of it is
                collected for recycling.
              </Fact>
              <Fact
                icon={Droplets}
                value="58%"
                source={
                  <Cite href="https://www.macrothink.org/journal/index.php/emsd/article/view/23735">
                    Oke &amp; Olayide 2026
                  </Cite>
                }
              >
                of households surveyed in Lagos and Abuja don&apos;t separate
                plastic from other waste, so it ends up in drains and dumps.
              </Fact>
              <Fact
                icon={Flame}
                value="Burned or dumped"
                source={
                  <Cite href="https://www.macrothink.org/journal/index.php/emsd/article/view/23735">
                    Oke &amp; Olayide 2026
                  </Cite>
                }
              >
                Over a third of Lagos households in that survey dump plastic in
                the open or burn it. Paying for it gives it a better place to
                go.
              </Fact>
            </Stagger>
          </Section>

          <Section
            id="how-it-works"
            eyebrow="How it works"
            title="Five steps, from sack to bank"
          >
            <Stagger as="ol" className="grid gap-4 md:grid-cols-5">
              <Step n={1} icon={HomeIcon} title="Gather">
                Keep bottles, hard plastic, sachets, cans and tins in separate
                sacks.
              </Step>
              <Step n={2} icon={Smartphone} title="Request">
                Ask for a pickup from 50 kg, join your area&apos;s pickup day,
                or bring it to the hub.
              </Step>
              <Step n={3} icon={Scale} title="We weigh">
                A verified collector weighs each kind in front of you and
                photographs the scale.
              </Step>
              <Step n={4} icon={ShieldCheck} title="You confirm">
                Check the weights in the app, or give the collector the SMS
                code. Wrong weight? Dispute it.
              </Step>
              <Step n={5} icon={Landmark} title="Get paid">
                Points land in your wallet. Withdraw to your bank from ₦1,000.
              </Step>
            </Stagger>
          </Section>

          <Section
            id="organizations"
            eyebrow="Who it's for"
            title="For homes, pickers, schools and businesses"
          >
            <Stagger className="grid gap-4 md:grid-cols-2">
              <Audience
                icon={HomeIcon}
                title="Individuals and waste pickers"
                points={[
                  "See the price per kg before anyone comes.",
                  "Every kilo weighed in front of you, with a photo.",
                  "Confirm in the app or by SMS code, no smartphone needed for the code.",
                  "Withdraw to any Nigerian bank account in your name.",
                ]}
              />
              <Audience
                icon={Building2}
                title="Schools, offices and estates"
                points={[
                  "Regular door pickups for large loads.",
                  "Points paid to the organization's account.",
                  "A monthly recycling report (PDF) with kg by material and CO₂ avoided, for ESG reporting.",
                  "One login per organization.",
                ]}
              />
            </Stagger>
            <p className="text-sm text-muted-foreground">
              Areas we serve: {AREAS.join(", ")}.
            </p>
          </Section>

          <section className="bg-mist">
            <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-14 lg:px-[72px]">
              <span className="eyebrow text-primary">Impact so far</span>
              <Suspense
                fallback={<Skeleton className="h-24 w-full rounded-2xl" />}
              >
                <ImpactBand />
              </Suspense>
            </div>
          </section>

          <Suspense>
            <ClimateNews />
          </Suspense>

          <Section eyebrow="Who pays" title="Where the money comes from">
            <Stagger className="grid gap-4 md:grid-cols-3">
              <Fact icon={Truck} value="We collect and sort">
                EcoCyclers buys plastic at the posted price, then sorts it by
                type and colour and removes dirt.
              </Fact>
              <Fact icon={Ship} value="We bale and export">
                Clean, sorted bales are sold to recycling companies abroad. The
                difference between what we pay you and the export price runs the
                business.
              </Fact>
              <Fact
                icon={CheckCircle2}
                value="Producers pay too"
                source={
                  <Cite href="https://www.thisdaylive.com/2026/09/04/nigeria-tightens-war-on-plastic-waste-makes-producers-responsible-for-end-of-life-products/">
                    NESREA, 2026
                  </Cite>
                }
              >
                New rules make producers responsible for recovering their
                plastic. Every pickup on PlastiCash is weighed and recorded: the
                kind of record they will need.
              </Fact>
            </Stagger>
          </Section>

          <Section eyebrow="Questions" title="Good to know">
            <div className="flex max-w-3xl flex-col gap-2">
              <Faq q="How much plastic do I need?">
                Door pickup starts at 50 kg. With less, join your area&apos;s
                pickup day or bring it to the hub at {HUB.address} ({HUB.hours}
                ). There is no minimum at the hub.
              </Faq>
              <Faq q="How do I know the weight is right?">
                The collector weighs each kind in front of you and takes a photo
                of the scale. Nothing is paid until you confirm. If it&apos;s
                wrong, dispute it with your own photo and EcoCyclers reviews
                both.
              </Faq>
              <Faq q="When do I get paid?">
                As soon as you confirm. If you don&apos;t answer within 48
                hours, the weight confirms by itself and you&apos;re paid.
              </Faq>
              <Faq q="How do I withdraw?">
                Add a bank account in your name, then withdraw from ₦1,000.
                EcoCyclers approves it and the money is sent to your bank.
              </Faq>
              <Faq q="What is a point?">
                1 point = ₦1. Your wallet shows both.
              </Faq>
            </div>
          </Section>

          <section className="bg-forest text-white">
            <div className="mx-auto flex max-w-[1280px] flex-col items-start gap-5 px-4 py-14 lg:flex-row lg:items-center lg:justify-between lg:px-[72px]">
              <div>
                <h2 className="font-display text-3xl font-extrabold tracking-[-0.03em] !text-white lg:text-4xl">
                  Start with the sack you have.
                </h2>
                <p className="mt-2 text-[#BBF7D0]">
                  Create an account and see your estimate before you request a
                  pickup.
                </p>
              </div>
              <Link
                href="/signup"
                prefetch={false}
                className="d-btn d-btn-accent d-btn-lg"
              >
                Start earning <ArrowRight className="size-5" aria-hidden />
              </Link>
            </div>
          </section>
        </main>
        <SiteFooter />
      </div>
    </MotionRoot>
  );
}

async function PriceCards() {
  const list = await getCurrentPrices();
  if (!list)
    return (
      <p className="text-muted-foreground">
        Prices are not available right now. Try again shortly.
      </p>
    );
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {MATERIALS.map((m) => {
        const p = list.find((x) => x.material === m.value);
        if (!p) return null;
        const top = m.value === "PET"; // PET is the core material (strongest demand)
        return (
          <div
            key={m.value}
            className={cn(
              "flex flex-col gap-1 rounded-2xl border p-4",
              top
                ? "border-forest bg-forest text-white"
                : "border-border bg-card",
            )}
          >
            <span
              className={cn(
                "eyebrow",
                top ? "text-[#86EFAC]" : "text-muted-foreground",
              )}
            >
              {m.label}
            </span>
            <b
              className={cn(
                "tabular text-3xl font-bold",
                top ? "text-gold" : "text-primary-ink",
              )}
            >
              {naira(p.price_kobo_per_kg)}
            </b>
            <small className={top ? "text-[#BBF7D0]" : "text-muted-foreground"}>
              {p.items_per_kg
                ? `≈ ${p.items_per_kg} ${m.value === "SACHET" ? "sachets" : "items"} = 1 kg`
                : m.hint}
            </small>
          </div>
        );
      })}
    </div>
  );
}

async function ImpactBand() {
  const t = await getImpactTotals();
  if (!t)
    return (
      <p className="text-muted-foreground">
        Totals are not available right now.
      </p>
    );
  return (
    <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:grid-cols-4">
      <Stat
        value={<CountUp value={Number(t.kg_recycled)} format="kg" />}
        label="plastic recycled"
      />
      <Stat
        value={<CountUp value={t.points_paid_kobo / 100} format="naira" />}
        label="paid to recyclers"
      />
      <Stat
        value={<CountUp value={Number(t.co2_kg)} format="kg" />}
        label="CO₂ avoided (US EPA WARM)"
      />
      <Stat
        value={<CountUp value={t.pickups} format="number" />}
        label="completed pickups"
      />
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-14 lg:px-[72px]">
        <Reveal>
          <span className="eyebrow text-primary">{eyebrow}</span>
          <h2 className="mt-2 max-w-3xl font-display text-3xl leading-tight font-extrabold tracking-[-0.03em] lg:text-[40px]">
            {title}
          </h2>
        </Reveal>
        <Reveal delay={0.1} className="flex flex-col gap-6">
          {children}
        </Reveal>
      </div>
    </section>
  );
}

function Fact({
  icon: Icon,
  value,
  source,
  children,
}: {
  icon: typeof Waves;
  value: string;
  source?: ReactNode;
  children: ReactNode;
}) {
  return (
    <StaggerItem className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-5">
      <span className="grid size-10 place-items-center rounded-xl bg-mint text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <b className="font-display text-2xl font-extrabold tracking-[-0.02em]">
        {value}
      </b>
      <p className="text-[15px] text-slate-700">{children}</p>
      {source && (
        <small className="text-xs text-muted-foreground">
          Source: {source}
        </small>
      )}
    </StaggerItem>
  );
}

function Cite({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-2"
    >
      {children}
    </a>
  );
}

function Step({
  n,
  icon: Icon,
  title,
  children,
}: {
  n: number;
  icon: typeof Waves;
  title: string;
  children: ReactNode;
}) {
  return (
    <StaggerItem
      as="li"
      className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-5"
    >
      <span className="flex items-center gap-2">
        <span className="tabular grid size-8 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {n}
        </span>
        <Icon className="size-5 text-primary" aria-hidden />
      </span>
      <b className="text-lg">{title}</b>
      <p className="text-sm text-slate-700">{children}</p>
    </StaggerItem>
  );
}

function Audience({
  icon: Icon,
  title,
  points,
}: {
  icon: typeof Waves;
  title: string;
  points: string[];
}) {
  return (
    <StaggerItem className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-6">
      <span className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-cream text-warn">
          <Icon className="size-5" aria-hidden />
        </span>
        <b className="text-xl">{title}</b>
      </span>
      <ul className="flex flex-col gap-2">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-[15px]">
            <CheckCircle2
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden
            />{" "}
            {p}
          </li>
        ))}
      </ul>
    </StaggerItem>
  );
}

function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-card p-5">
      <b className="tabular font-display text-[26px] font-extrabold tracking-[-0.03em] break-words text-primary-ink lg:text-3xl">
        {value}
      </b>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-border bg-card p-4 open:pb-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-bold [&::-webkit-details-marker]:hidden">
        {q}
        <span
          className="text-primary transition-transform group-open:rotate-45"
          aria-hidden
        >
          +
        </span>
      </summary>
      <p className="mt-2 text-[15px] text-slate-700">{children}</p>
    </details>
  );
}

async function HeroSlides() {
  return <HeroCarousel slides={await getHeroSlides()} />;
}

// Latest posts and upcoming climate events; each block shows only when there is something published.
async function ClimateNews() {
  const [posts, events] = await Promise.all([
    getPosts(4),
    getEvents("upcoming", 4),
  ]);
  if (posts.length === 0 && events.length === 0) return null;
  // Posts in a two-by-two grid across the full width; events below in two columns.
  return (
    <Section
      id="news"
      eyebrow="Climate news"
      title="From the blog, and what is coming up"
    >
      <div className="flex flex-col gap-10">
        {posts.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xl font-bold">Latest posts</h3>
              <Link href="/blog" className="text-sm font-bold text-primary">
                All posts →
              </Link>
            </div>
            <Stagger className="grid gap-5 sm:grid-cols-2">
              {posts.map((p) => (
                <StaggerItem key={p.id}>
                  <PostCard post={p} />
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        )}
        {events.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xl font-bold">Upcoming events</h3>
              <Link href="/events" className="text-sm font-bold text-primary">
                All events →
              </Link>
            </div>
            <Stagger as="ul" className="grid gap-3 lg:grid-cols-2">
              {events.map((e) => (
                <StaggerItem key={e.id} as="li">
                  <EventRow event={e} />
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        )}
      </div>
    </Section>
  );
}
