import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState
} from 'react';
import {
  AnimatePresence,
  motion,
  stagger,
  useScroll,
  useSpring,
  useTransform,
  type Variants
} from 'motion/react';
import { submitPartnerLead } from './api';

const wavesSrc = `${import.meta.env.BASE_URL}pattern-waves.html`;
const TEAL = '#05998C';

const springSoft = { type: 'spring' as const, bounce: 0.18, visualDuration: 0.55 };
const springSnappy = { type: 'spring' as const, bounce: 0.22, visualDuration: 0.4 };

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      ...springSoft,
      opacity: { duration: 0.35, ease: 'easeOut' }
    }
  }
};

const staggerParent: Variants = {
  hidden: {},
  show: {
    transition: { delayChildren: stagger(0.09, { startDelay: 0.06 }) }
  }
};

/** Partner landing — Motion scroll reveals + product-true CutLy features. */
export default function App() {
  const page = useHashPage();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.35 });
  const barScaleX = useTransform(progress, [0, 1], [0, 1]);

  if (page === 'terms') {
    return (
      <div className="relative min-h-dvh overflow-x-hidden bg-canvas text-ink">
        <LegalChrome />
        <TermsPage />
        <Footer />
      </div>
    );
  }

  if (page === 'privacy') {
    return (
      <div className="relative min-h-dvh overflow-x-hidden bg-canvas text-ink">
        <LegalChrome />
        <PrivacyPage />
        <Footer />
      </div>
    );
  }

  return (
    <div className="relative overflow-x-hidden bg-canvas text-ink">
      <motion.div
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-coral"
        style={{ scaleX: barScaleX }}
        aria-hidden
      />
      <Nav />
      <Hero />
      <ListedSection />
      <AnalyticsSection />
      <FloorSection />
      <OpsStrip />
      <HowItWorks />
      <LeadForm />
      <Footer />
    </div>
  );
}

type SitePage = 'home' | 'terms' | 'privacy';

function useHashPage(): SitePage {
  const read = (): SitePage => {
    const h = (window.location.hash || '').replace(/^#\/?/, '').toLowerCase();
    if (h === 'terms' || h.startsWith('terms')) return 'terms';
    if (h === 'privacy' || h.startsWith('privacy')) return 'privacy';
    return 'home';
  };
  const [page, setPage] = useState<SitePage>(() =>
    typeof window === 'undefined' ? 'home' : read()
  );
  useEffect(() => {
    const onHash = () => {
      setPage(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return page;
}

function LegalChrome() {
  return (
    <header className="border-b border-line bg-white/80 px-5 py-4 backdrop-blur-md sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
        <a href="#/" className="text-[17px] font-bold tracking-tight text-ink">
          CutLy
        </a>
        <a href="#/" className="text-sm font-semibold text-coral hover:text-coral-dark">
          Back to home
        </a>
      </div>
    </header>
  );
}

function Nav() {
  const [onHero, setOnHero] = useState(true);

  useEffect(() => {
    const hero = document.getElementById('top');
    if (!hero) return;
    const io = new IntersectionObserver(
      ([entry]) => setOnHero(entry.isIntersecting && entry.intersectionRatio > 0.35),
      { threshold: [0.35, 0.6] }
    );
    io.observe(hero);
    return () => io.disconnect();
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-5">
      <motion.div
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={springSnappy}
        className={`pointer-events-auto mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-full px-3 py-2 backdrop-blur-xl transition-[background,border,box-shadow] duration-500 sm:px-5 sm:py-2.5 ${
          onHero
            ? 'border border-white/25 bg-white/15 shadow-[0_8px_32px_rgba(23,38,60,0.12)]'
            : 'border border-line bg-canvas/90 shadow-[0_8px_32px_rgba(23,38,60,0.08)]'
        }`}
      >
        <a
          href="#top"
          className={`pl-1 text-[17px] font-bold tracking-tight sm:text-lg ${
            onHero ? 'text-white' : 'text-ink'
          }`}
        >
          CutLy
        </a>
        <nav
          className={`hidden items-center gap-7 text-sm md:flex ${
            onHero ? 'text-white/85' : 'text-muted'
          }`}
        >
          <a href="#listed" className={onHero ? 'hover:text-white' : 'hover:text-ink'}>
            Get listed
          </a>
          <a href="#analytics" className={onHero ? 'hover:text-white' : 'hover:text-ink'}>
            Analytics
          </a>
          <a href="#floor" className={onHero ? 'hover:text-white' : 'hover:text-ink'}>
            Floor
          </a>
          <a href="#join" className={onHero ? 'hover:text-white' : 'hover:text-ink'}>
            Join
          </a>
        </nav>
        <motion.a
          href="#join"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className={`rounded-full px-3.5 py-2 text-xs font-semibold sm:px-4 sm:text-sm ${
            onHero ? 'bg-white text-ink' : 'bg-coral text-white'
          }`}
        >
          List your shop
        </motion.a>
      </motion.div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative min-h-[100dvh] overflow-hidden bg-coral">
      <iframe
        title="CutLy pattern waves"
        src={wavesSrc}
        className="pointer-events-none absolute inset-0 h-full w-full border-0"
        loading="eager"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/60 via-ink/20 to-transparent"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-6xl flex-col justify-end px-5 pb-16 pt-28 sm:px-8 sm:pb-20 md:pb-28 lg:px-10">
        <motion.div
          variants={staggerParent}
          initial="hidden"
          animate="show"
          className="max-w-3xl"
        >
          <motion.p
            variants={fadeUp}
            className="mb-4 text-[15px] font-bold tracking-tight text-white sm:text-base"
          >
            CutLy
          </motion.p>
          <motion.h1
            variants={fadeUp}
            className="max-w-[18ch] text-[clamp(2.4rem,7.5vw,4.75rem)] font-bold leading-[0.98] tracking-tight text-white"
          >
            Want to grow your business? Partner with us.
          </motion.h1>
          <motion.p
            variants={fadeUp}
            className="mt-5 max-w-lg text-base leading-relaxed text-white/90 sm:mt-6 sm:text-lg"
          >
            Salons, spas, studios, nails, and more. Neighbours find you, book a time, and walk in
            ready. You stay in control of the day.
          </motion.p>
          <motion.div
            variants={fadeUp}
            className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:items-center sm:gap-5"
          >
            <motion.a
              href="#join"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-7 text-sm font-semibold text-white sm:h-[52px] sm:text-base"
            >
              Become a partner
            </motion.a>
            <p className="text-sm text-white/80 sm:text-[15px]">
              Leave your number. We call you back.
            </p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function SectionReveal({
  children,
  className = ''
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={staggerParent}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.25, margin: '0px 0px -8% 0px' }}
    >
      {children}
    </motion.div>
  );
}

/** Device chrome + scroll settle — HTML mocks of real CutLy screens (no fake AI shots). */
function PhoneFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'center center']
  });
  const smooth = useSpring(scrollYProgress, { stiffness: 100, damping: 26, mass: 0.4 });
  const scale = useTransform(smooth, [0, 1], [0.9, 1]);
  const y = useTransform(smooth, [0, 1], [56, 0]);
  const rotateX = useTransform(smooth, [0, 1], [10, 0]);
  const opacity = useTransform(smooth, [0, 0.4, 1], [0.4, 1, 1]);

  return (
    <div ref={ref} className="flex justify-center [perspective:1200px]">
      <motion.div
        style={{ scale, y, rotateX, opacity, transformPerspective: 1200 }}
        className="relative w-[272px] will-change-transform sm:w-[300px]"
      >
        <div className="rounded-[40px] border-[10px] border-[#1a1a1c] bg-[#1a1a1c] shadow-[0_32px_80px_rgba(23,38,60,0.28)]">
          <div className="relative overflow-hidden rounded-[30px] bg-canvas">
            <div
              className="pointer-events-none absolute left-1/2 top-2 z-20 h-[22px] w-[96px] -translate-x-1/2 rounded-full bg-[#1a1a1c]"
              aria-hidden
            />
            <div className="h-[540px] overflow-hidden sm:h-[580px]">{children}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ListedSection() {
  return (
    <section id="listed" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28 lg:px-10">
      <SectionReveal className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <motion.p variants={fadeUp} className="text-sm font-semibold tracking-wide text-coral">
            Get listed
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="mt-3 text-[clamp(1.85rem,4vw,3rem)] font-bold tracking-tight"
          >
            Show up when someone nearby is looking for you.
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mt-4 max-w-md text-base leading-relaxed text-muted sm:text-lg"
          >
            Your shop appears for people around you. Honest open hours, real ratings from visits,
            and a menu they can trust.
          </motion.p>
          <motion.ul variants={fadeUp} className="mt-8 space-y-3 text-[15px] text-ink">
            {[
              'Found by neighbours searching nearby',
              'Open and closed status that stays true',
              'Services and hours you update anytime'
            ].map((line) => (
              <li key={line} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
                <span>{line}</span>
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div variants={fadeUp} className="lg:col-span-7">
          <PhoneFrame>
            <ExplorePhoneScreen />
          </PhoneFrame>
        </motion.div>
      </SectionReveal>
    </section>
  );
}

function ExplorePhoneScreen() {
  const cards = [
    { name: 'Looks Salon', meta: '0.8 km · ★ 4.7', price: 'from ₹299', open: true },
    { name: 'Ink & Needle', meta: '1.4 km · New', price: 'from ₹800', open: true },
    { name: 'Calm Spa', meta: '2.1 km · ★ 4.9', price: 'from ₹999', open: false }
  ];

  return (
    <div className="flex h-full flex-col bg-canvas px-4 pb-6 pt-10">
      <p className="text-[13px] font-bold tracking-tight text-coral">CutLy</p>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Salons</p>
      <h3 className="mt-1 text-[22px] font-bold tracking-tight text-ink">Near you</h3>
      <div className="mt-4 flex gap-2 overflow-hidden">
        {['Nearest', 'Earliest', 'Price', 'Rating'].map((chip, i) => (
          <span
            key={chip}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold ${
              i === 0 ? 'bg-coral text-white' : 'bg-white text-ink ring-1 ring-[rgba(23,38,60,0.12)]'
            }`}
          >
            {chip}
          </span>
        ))}
      </div>
      <div className="mt-4 space-y-2.5">
        {cards.map((c, i) => (
          <motion.div
            key={c.name}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ ...springSoft, delay: 0.1 * i }}
            className="rounded-2xl bg-white p-3.5 ring-1 ring-[rgba(23,38,60,0.1)]"
          >
            <div className="mb-2.5 h-20 rounded-xl bg-sand/80" />
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-ink">{c.name}</p>
                <p className="mt-0.5 text-[11px] text-muted">{c.meta}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[12px] font-semibold text-ink">{c.price}</p>
                <p
                  className="mt-0.5 text-[11px] font-semibold"
                  style={{ color: c.open ? TEAL : '#667386' }}
                >
                  {c.open ? 'Open' : 'Closed'}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsSection() {
  return (
    <section id="analytics" className="border-y border-line bg-white">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28 lg:px-10">
        <SectionReveal className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <motion.div variants={fadeUp} className="order-2 lg:order-1 lg:col-span-7">
            <PhoneFrame>
              <PartnerHomePhoneScreen />
            </PhoneFrame>
          </motion.div>
          <div className="order-1 lg:order-2 lg:col-span-5">
            <motion.p variants={fadeUp} className="text-sm font-semibold tracking-wide text-coral">
              Your day
            </motion.p>
            <motion.h2
              variants={fadeUp}
              className="mt-3 text-[clamp(1.85rem,4vw,3rem)] font-bold tracking-tight"
            >
              All your day-to-day analytics, at a glance.
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="mt-4 max-w-md text-base leading-relaxed text-muted sm:text-lg"
            >
              See how the day is going without digging through notes or chats. Quiet numbers when
              you need them. Calm when you do not.
            </motion.p>
            <motion.p variants={fadeUp} className="mt-6 text-[15px] font-medium text-ink">
              Made for the shop floor, not a spreadsheet.
            </motion.p>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}

function PartnerHomePhoneScreen() {
  const hourBars = [18, 42, 68, 54, 88, 36, 24, 12];
  const metrics = [
    { label: "Today's take", value: '₹12,450' },
    { label: 'Still due', value: '₹3,200' },
    { label: 'Booked ahead', value: '₹2,100' },
    { label: 'Open chairs', value: '3' }
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas px-3.5 pb-5 pt-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[12px] font-bold text-coral">CutLy</p>
          <p className="text-[11px] text-muted">Partner</p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-ink ring-1 ring-[rgba(23,38,60,0.12)]">
          Past visits
        </span>
      </div>
      <p className="mt-4 text-[13px] text-muted">Good evening, Priya</p>
      <p className="text-[24px] font-bold tracking-tight text-ink">Looks Salon</p>

      <div className="mt-3 flex items-center justify-between rounded-2xl border border-coral bg-white px-3.5 py-3">
        <div>
          <p className="text-[13px] font-semibold text-ink">Open for appointments</p>
          <p className="mt-0.5 text-[11px] text-muted">Accepting nearby bookings</p>
        </div>
        <span className="h-6 w-10 rounded-full bg-coral p-0.5">
          <span className="ml-auto block h-5 w-5 rounded-full bg-white" />
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-2xl border border-coral bg-white px-3.5 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-coral">Appointments</p>
          <p className="mt-0.5 text-[14px] font-semibold text-ink">2 pending requests</p>
          <p className="text-[11px] text-muted">New booking waits</p>
        </div>
        <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-coral px-2 text-[12px] font-bold text-white">
          2
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {metrics.map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ ...springSoft, delay: 0.06 * i }}
            className="rounded-2xl bg-white p-3 ring-1 ring-[rgba(23,38,60,0.1)]"
          >
            <p className="text-[18px] font-bold tracking-tight text-ink tabular-nums">{m.value}</p>
            <p className="mt-0.5 text-[10px] text-muted">{m.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-3 flex-1 rounded-2xl bg-white p-3 ring-1 ring-[rgba(23,38,60,0.1)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-coral">Bookings by hour</p>
        <p className="mt-0.5 text-[13px] font-semibold text-ink">Today&apos;s pace</p>
        <div className="mt-3 flex h-[72px] items-end gap-1">
          {hourBars.map((h, i) => (
            <motion.div
              key={i}
              className="flex-1 rounded-t-md bg-coral"
              initial={{ height: 6 }}
              whileInView={{ height: h * 0.7 }}
              viewport={{ once: true }}
              transition={{ ...springSoft, delay: 0.04 * i }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FloorSection() {
  return (
    <section id="floor" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28 lg:px-10">
      <SectionReveal className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <motion.p variants={fadeUp} className="text-sm font-semibold tracking-wide text-coral">
            At the door
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="mt-3 text-[clamp(1.85rem,4vw,3rem)] font-bold tracking-tight"
          >
            A simple code when they arrive.
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mt-4 max-w-md text-base leading-relaxed text-muted sm:text-lg"
          >
            Guests bring a short visit code. You enter it, welcome them in, and keep the day moving.
            No more awkward phone chase.
          </motion.p>
        </div>
        <motion.div variants={fadeUp} className="lg:col-span-7">
          <PhoneFrame>
            <FloorPhoneScreen />
          </PhoneFrame>
        </motion.div>
      </SectionReveal>
    </section>
  );
}

function FloorPhoneScreen() {
  const digits = ['4', '8', '2', '1'];

  return (
    <div className="relative flex h-full flex-col bg-canvas px-3.5 pb-5 pt-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Today</p>
      <h3 className="text-[24px] font-bold tracking-tight text-ink">Floor</h3>
      <p className="mt-1 text-[12px] leading-snug text-muted">
        See who is coming in and welcome them with a code.
      </p>

      <p className="mt-4 text-[12px] font-semibold text-ink">Live visits</p>
      <div className="mt-2 rounded-2xl bg-white p-3.5 ring-1 ring-[rgba(23,38,60,0.1)]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[14px] font-semibold text-ink">Ananya R.</p>
            <p className="mt-0.5 text-[11px] text-muted">Glow facial · 4:30 PM · Staff 1</p>
            <p className="mt-1 text-[10px] text-muted">CL-8F2A</p>
          </div>
          <span className="rounded-full bg-sand px-2 py-0.5 text-[10px] font-semibold text-ink">
            Confirmed
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          <span className="flex-1 rounded-full bg-coral py-2 text-center text-[11px] font-semibold text-white">
            Start with code
          </span>
          <span className="rounded-full bg-canvas px-3 py-2 text-[11px] font-semibold text-ink ring-1 ring-[rgba(23,38,60,0.12)]">
            Call
          </span>
        </div>
      </div>

      {/* Visit-code sheet — mirrors Floor ChoiceSheet */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={springSoft}
        className="absolute inset-x-0 bottom-0 rounded-t-[24px] bg-white px-4 pb-8 pt-4 shadow-[0_-12px_40px_rgba(23,38,60,0.18)]"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-sand" />
        <p className="text-[12px] font-semibold text-ink">Visit code</p>
        <p className="mt-1 text-[11px] leading-snug text-muted">
          Ask Ananya R. for their 4-digit CutLy code to check them in and start the visit.
        </p>
        <div className="mt-4 flex justify-center gap-2.5">
          {digits.map((d, i) => (
            <motion.span
              key={i}
              initial={{ scale: 0.6, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ ...springSnappy, delay: 0.12 * i }}
              className="flex h-12 w-10 items-center justify-center rounded-xl bg-canvas text-[22px] font-bold text-coral ring-1 ring-coral/40"
            >
              {d}
            </motion.span>
          ))}
        </div>
        <div className="mt-4 rounded-full bg-coral py-3 text-center text-[13px] font-semibold text-white">
          Start service
        </div>
      </motion.div>
    </div>
  );
}

function OpsStrip() {
  const items = [
    {
      title: 'Booking requests, calmly',
      body: 'See who wants to come in. Say yes or not, on your time.'
    },
    {
      title: 'Your menu, your hours',
      body: 'Change what you offer and when you are open, whenever you need.'
    },
    {
      title: 'Pay how it suits you',
      body: 'Guests can settle at the shop, or pay a little up front when you want that.'
    }
  ];

  return (
    <section className="border-y border-line bg-ink text-white">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
        <SectionReveal>
          <motion.h2
            variants={fadeUp}
            className="max-w-2xl text-[clamp(1.6rem,3.5vw,2.4rem)] font-bold tracking-tight"
          >
            Less phone tag. More time with guests.
          </motion.h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
            {items.map((item) => (
              <motion.article key={item.title} variants={fadeUp}>
                <h3 className="text-lg font-semibold tracking-tight text-white">{item.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-white/70">{item.body}</p>
              </motion.article>
            ))}
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: '01',
      title: 'Leave your number',
      body: 'Tell us your shop and city. We reach out on WhatsApp or call within a day.'
    },
    {
      n: '02',
      title: 'We set you up',
      body: 'We get your profile, menu, hours, and photos ready, then share your login.'
    },
    {
      n: '03',
      title: 'Welcome guests on CutLy',
      body: 'Open for bookings when you are ready. Neighbours find you. You run the day with ease.'
    }
  ];

  return (
    <section id="how" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28 lg:px-10">
      <SectionReveal>
        <motion.h2
          variants={fadeUp}
          className="max-w-3xl text-[clamp(1.85rem,4vw,3rem)] font-bold tracking-tight"
        >
          Three easy steps to your first booking.
        </motion.h2>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {steps.map((step, i) => (
            <motion.article
              key={step.n}
              variants={fadeUp}
              whileHover={{ y: -4, transition: { type: 'spring', bounce: 0.35, visualDuration: 0.35 } }}
              className="rounded-[24px] border border-line bg-white p-6 sm:p-7"
            >
              <span className="text-xs font-semibold tracking-[0.14em] text-coral">{step.n}</span>
              <h3 className="mt-3 text-xl font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{step.body}</p>
              <motion.div
                className="mt-6 h-1 origin-left rounded-full bg-coral/30"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ ...springSoft, delay: 0.15 * i }}
              />
            </motion.article>
          ))}
        </div>
      </SectionReveal>
    </section>
  );
}

function LeadForm() {
  const [phone, setPhone] = useState('');
  const [shopName, setShopName] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await submitPartnerLead({
        phone,
        shopName: shopName.trim() || undefined,
        city: city.trim() || undefined
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="join" className="border-t border-line bg-white">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28 lg:px-10">
        <SectionReveal className="grid items-start gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <motion.h2
              variants={fadeUp}
              className="text-[clamp(1.85rem,4vw,3rem)] font-bold tracking-tight"
            >
              Leave your number. We&apos;ll take it from here.
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="mt-4 max-w-md text-base leading-relaxed text-muted sm:text-lg"
            >
              No spam. Someone from CutLy will call to learn about your shop and help you get listed.
            </motion.p>
            <motion.ul variants={fadeUp} className="mt-8 space-y-2 text-sm text-muted">
              <li>Salons, spas, studios, nails, tattoo, piercing</li>
              <li>India mobiles (+91)</li>
            </motion.ul>
          </div>

          <motion.div variants={fadeUp} className="lg:col-span-7">
            <div className="rounded-[28px] border border-line bg-canvas p-5 shadow-[0_20px_60px_rgba(23,38,60,0.06)] sm:p-8">
              <AnimatePresence mode="wait">
                {done ? (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={springSoft}
                    className="flex min-h-[240px] flex-col justify-center sm:min-h-[280px]"
                  >
                    <h3 className="text-2xl font-semibold tracking-tight">
                      Got it. We&apos;ll call soon.
                    </h3>
                    <p className="mt-3 max-w-sm text-muted">
                      Keep an eye on WhatsApp and your phone. If we miss each other, just reply to
                      the CutLy message.
                    </p>
                  </motion.div>
                ) : (
                  <motion.form
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onSubmit={onSubmit}
                    className="space-y-4 sm:space-y-5"
                  >
                    <Field label="Mobile number">
                      <div className="flex overflow-hidden rounded-xl border border-line bg-white focus-within:border-coral sm:rounded-2xl">
                        <span className="flex items-center border-r border-line px-3 text-sm font-semibold text-muted sm:px-4">
                          +91
                        </span>
                        <input
                          inputMode="numeric"
                          autoComplete="tel-national"
                          placeholder="98XXX XXXXX"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          className="min-w-0 w-full bg-transparent px-3 py-3.5 text-base outline-none placeholder:text-muted/60 sm:px-4"
                          required
                        />
                      </div>
                    </Field>
                    <Field label="Shop name (optional)">
                      <input
                        value={shopName}
                        onChange={(e) => setShopName(e.target.value)}
                        placeholder="e.g. Looks Salon, Burdwan"
                        className="w-full rounded-xl border border-line bg-white px-3 py-3.5 outline-none focus:border-coral sm:rounded-2xl sm:px-4"
                      />
                    </Field>
                    <Field label="City (optional)">
                      <input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="e.g. Kolkata"
                        className="w-full rounded-xl border border-line bg-white px-3 py-3.5 outline-none focus:border-coral sm:rounded-2xl sm:px-4"
                      />
                    </Field>
                    {error ? <p className="text-sm text-coral-dark">{error}</p> : null}
                    <motion.button
                      type="submit"
                      disabled={busy || phone.length < 10}
                      whileHover={busy || phone.length < 10 ? undefined : { scale: 1.015 }}
                      whileTap={busy || phone.length < 10 ? undefined : { scale: 0.98 }}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-coral text-base font-semibold text-white disabled:opacity-40 sm:h-[52px]"
                    >
                      {busy ? 'Sending…' : 'Request a callback'}
                    </motion.button>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </SectionReveal>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-white px-5 py-10 sm:px-8 sm:py-12 lg:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-lg font-semibold tracking-tight">CutLy</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
              Book local salons, spas, studios, and more. Partners run the day. Guests book with ease.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-ink">
            <a href="#join" className="hover:text-coral">
              Partner with us
            </a>
            <a href="#/terms" className="hover:text-coral">
              Terms of use
            </a>
            <a href="#/privacy" className="hover:text-coral">
              Privacy policy
            </a>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-line pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} CutLy. All rights reserved.</p>
          <p>Made for local beauty and wellness in India.</p>
        </div>
        <p className="text-xs leading-relaxed text-muted/80">
          Draft policies for product launch. They are not a substitute for formal legal advice. Contact
          us via the partner form if you have questions.
        </p>
      </div>
    </footer>
  );
}

function LegalArticle({
  title,
  updated,
  children
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16 lg:px-10">
      <p className="text-sm font-semibold tracking-wide text-coral">Legal</p>
      <h1 className="mt-2 text-[clamp(1.75rem,4vw,2.5rem)] font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted">Last updated: {updated}</p>
      <div className="prose-legal mt-10 space-y-8 text-[15px] leading-relaxed text-ink">{children}</div>
    </main>
  );
}

function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">{heading}</h2>
      <div className="mt-3 space-y-3 text-muted">{children}</div>
    </section>
  );
}

function TermsPage() {
  return (
    <LegalArticle title="Terms of use" updated="7 October 2026">
      <LegalSection heading="1. Who we are">
        <p>
          CutLy is a booking platform that helps guests discover nearby salons, spas, studios, nails,
          tattoo, piercing, and similar shops, and helps partners manage day-to-day appointments.
        </p>
        <p>These terms apply when you use our website, partner lead form, apps, or related services.</p>
      </LegalSection>
      <LegalSection heading="2. Partner interest form">
        <p>
          Submitting your phone number (and optional shop details) is a request for CutLy to contact
          you about listing your shop. It does not create a binding partnership until we confirm
          onboarding and you accept partner terms separately.
        </p>
      </LegalSection>
      <LegalSection heading="3. Accounts and access">
        <p>
          Partner accounts are created by CutLy after review. You must keep login details secure and
          provide accurate shop information (hours, services, prices, open status).
        </p>
        <p>
          Guest accounts use phone or other sign-in methods we support. You are responsible for
          activity under your account.
        </p>
      </LegalSection>
      <LegalSection heading="4. Bookings and payments">
        <p>
          Bookings are between the guest and the shop. CutLy provides tools to request, accept, start,
          and complete visits. Payment may be at the shop or through methods we enable in the app.
          Shops remain responsible for the service delivered.
        </p>
      </LegalSection>
      <LegalSection heading="5. Acceptable use">
        <p>
          Do not misuse CutLy: no fraud, spam, scraping, harassment, fake listings, or content that
          breaks the law. We may suspend access if we reasonably believe these rules were broken.
        </p>
      </LegalSection>
      <LegalSection heading="6. Intellectual property">
        <p>
          CutLy name, logo, design, and software belong to CutLy or our licensors. You may not copy or
          reuse them without permission, except as needed to use the service normally.
        </p>
      </LegalSection>
      <LegalSection heading="7. Disclaimers">
        <p>
          We aim for reliable uptime and accurate listings, but the service is provided as available.
          We are not liable for shop cancellations, service quality, or losses beyond what applicable
          law requires.
        </p>
      </LegalSection>
      <LegalSection heading="8. Changes">
        <p>
          We may update these terms as CutLy grows. Material changes will be reflected by the date
          above. Continued use after an update means you accept the revised terms.
        </p>
      </LegalSection>
      <LegalSection heading="9. Contact">
        <p>
          Questions about these terms: use the partner form on our homepage or email the address we
          share during onboarding.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}

function PrivacyPage() {
  return (
    <LegalArticle title="Privacy policy" updated="7 October 2026">
      <LegalSection heading="1. Overview">
        <p>
          This policy explains what information CutLy collects and how we use it when you visit our
          website, submit a partner lead, or use the CutLy apps.
        </p>
      </LegalSection>
      <LegalSection heading="2. Information we collect">
        <p>
          <span className="font-semibold text-ink">Partner leads:</span> mobile number, and optional
          shop name and city when you request a callback.
        </p>
        <p>
          <span className="font-semibold text-ink">Accounts:</span> phone or email, name, and profile
          details you provide. Partners may also share shop hours, menu, staff, and photos.
        </p>
        <p>
          <span className="font-semibold text-ink">Bookings:</span> visit times, services, status, and
          related payment or visit-code data needed to run the appointment.
        </p>
        <p>
          <span className="font-semibold text-ink">Device and usage:</span> basic technical data such
          as app version, device type, and approximate location when you allow it for nearby shops.
        </p>
      </LegalSection>
      <LegalSection heading="3. How we use information">
        <p>
          To contact partner applicants, create and run accounts, show nearby shops, process
          bookings, send service messages (for example OTP or booking updates), improve CutLy, and
          meet legal obligations.
        </p>
      </LegalSection>
      <LegalSection heading="4. Sharing">
        <p>
          We share booking details with the relevant shop so they can serve the guest. We use trusted
          processors for hosting, messaging, maps, and payments where enabled. We do not sell your
          personal information.
        </p>
      </LegalSection>
      <LegalSection heading="5. Retention">
        <p>
          We keep information as long as needed for the purposes above, including accounts, bookings,
          and support, then delete or anonymise it when it is no longer required, unless the law says
          otherwise.
        </p>
      </LegalSection>
      <LegalSection heading="6. Security">
        <p>
          We use reasonable technical and organisational measures to protect data. No method of
          transmission or storage is perfectly secure.
        </p>
      </LegalSection>
      <LegalSection heading="7. Your choices">
        <p>
          You may update profile details in the app, withdraw location permission in device settings,
          or ask us to correct or delete personal data where applicable. Partner lead applicants can
          ask us not to call again by replying to our message.
        </p>
      </LegalSection>
      <LegalSection heading="8. Children">
        <p>CutLy is not directed at children under 13. We do not knowingly collect their data.</p>
      </LegalSection>
      <LegalSection heading="9. Updates">
        <p>
          We may update this policy. The date at the top will change when we do. Please check back
          from time to time.
        </p>
      </LegalSection>
      <LegalSection heading="10. Contact">
        <p>
          Privacy questions: use the partner form on our homepage or the contact channel shared when
          you join CutLy.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
