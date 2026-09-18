// ============================================================================
// "Web3/space" visual effects, no external dependencies:
//  - FxBackground    : aurora blobs + gridlines + blockchain node canvas
//  - Coin3D          : 3D pie-flip token (CSS) with ring orbit + shine
//  - Reveal          : scroll-reveal (IntersectionObserver, Apple/Ledger-style)
//  - AnimatedNumber  : counter ramps up when the element enters view
//  - BrandMark       : animated hexagon-node SVG logo
//  - HashTicker      : marquee hash/status ticker, blockchain-explorer vibe
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";

import logoFront from "./assets/logo-front.png";
import coinBnb from "./assets/3d-bnb.png";
import coinBtc from "./assets/3d-btc.png";
import coinCake from "./assets/3d-cake.png";
import coinFloki from "./assets/3d-floki.png";

// ----------------------------------------------------------------------------
// Blockchain node network canvas (light particles, no library)
// ----------------------------------------------------------------------------
export function BlockField({ className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    const nodes = [];
    let w = 0;
    let h = 0;

    const spawn = () => {
      const n = 34;
      for (let i = 0; i < n; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.28,
          vy: (Math.random() - 0.5) * 0.28,
          r: Math.random() * 1.7 + 0.8,
        });
      }
    };

    const loop = () => {
      w = canvas.clientWidth || window.innerWidth;
      h = canvas.clientHeight || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 130) {
            ctx.strokeStyle = `rgba(45,212,191,${(1 - d / 130) * 0.30})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      for (const p of nodes) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.fillStyle = "rgba(139,92,246,0.85)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(loop);
    };
    spawn();
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className={`blockfield ${className}`} aria-hidden />;
}

// ----------------------------------------------------------------------------
// Page background: aurora + gridlines + node network
// ----------------------------------------------------------------------------
export function FxBackground({ nodes = 46 }) {
  return (
    <div className="fxbg" aria-hidden>
      <div className="gridlines" />
      <div className="blob blob-a" />
      <div className="blob blob-b" />
      <div className="blob blob-c" />
      <BlockField nodes={nodes} />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Animated logo: hexagon + connected nodes
// ----------------------------------------------------------------------------
export function BrandMark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="brandmark" aria-hidden>
      <defs>
        <linearGradient id="bmGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4d7cfe" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="none" stroke="url(#bmGrad)"
        strokeWidth="1.6" strokeLinejoin="round" />
      <line x1="16" y1="16" x2="7" y2="11" stroke="rgba(139,92,246,0.65)" strokeWidth="1" />
      <line x1="16" y1="16" x2="25" y2="21" stroke="rgba(122,162,255,0.65)" strokeWidth="1" />
      <circle cx="7" cy="11" r="1.6" fill="#8b5cf6" className="bm-node" />
      <circle cx="25" cy="21" r="1.6" fill="#22d3ee" className="bm-node bm-node-2" />
      <circle cx="16" cy="16" r="2.6" fill="#2dd4bf" className="bm-core" />
    </svg>
  );
}

// ----------------------------------------------------------------------------
// Scroll reveal (IntersectionObserver)
// ----------------------------------------------------------------------------
export function Reveal({ children, delay = 0, as = "div", className = "" }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const ob = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          ob.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, []);
  const Tag = as;
  return (
    <Tag ref={ref} className={`reveal ${inView ? "is-in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

// ----------------------------------------------------------------------------
// Counter that ramps up when visible
// ----------------------------------------------------------------------------
export function AnimatedNumber({ value, decimals = 2, duration = 900, prefix = "", suffix = "" }) {
  const ref = useRef(null);
  const [disp, setDisp] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setDisp(value);
      return;
    }
    const ob = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          const t0 = performance.now();
          const tick = (t) => {
            const p = Math.min(1, (t - t0) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            setDisp(value * eased);
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          ob.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [value, duration]);
  return (
    <span ref={ref}>
      {prefix}
      {Number(disp).toFixed(decimals)}
      {suffix}
    </span>
  );
}

// ----------------------------------------------------------------------------
// 3D logo — front photo only, floating (no rotation, no turntable). The logo
// PNG sits centered with a radial halo + ellipse shadow so it reads as a
// floating 3D object. With tilt=true it reacts to the mouse (subtle rotateX/Y)
// for a stronger 3D feel — used only on the big hero logo.
// ----------------------------------------------------------------------------
export function Logo3D({ size = 180, className = "", tilt = false }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!tilt) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const MAX = 14;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--tiltX", `${(-py * MAX).toFixed(2)}deg`);
      el.style.setProperty("--tiltY", `${(px * MAX).toFixed(2)}deg`);
    };
    const onLeave = () => {
      el.style.setProperty("--tiltX", "0deg");
      el.style.setProperty("--tiltY", "0deg");
    };
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [tilt]);

  return (
    <div ref={ref} className={`logo3d-wrap ${className}`} style={{ "--ls": `${size}px` }} aria-hidden>
      <div className="logo3d-scene">
        <div className="logo3d-halo" />
        <div className="logo3d-front">
          <img src={logoFront.src} alt="" draggable={false} />
        </div>
        <div className="logo3d-shadow" />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Floating Coins — 3D token images spread EVENLY across the container (grid +
// slight jitter) so they never clump, + floating animation
// ----------------------------------------------------------------------------
const COIN_IMAGES = [
  { src: coinBnb.src,   alt: "BNB" },
  { src: coinBtc.src,   alt: "BTC" },
  { src: coinCake.src,  alt: "CAKE" },
  { src: coinFloki.src, alt: "FLOKI" },
];

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildFloatingCoins(count) {
  const rng = mulberry32(20260917);
  const max = Math.min(count, 24);

  // Even grid: more columns than rows because the hero area is wide.
  const cols = Math.max(2, Math.ceil(Math.sqrt(max * 1.8)));
  const rows = Math.ceil(max / cols);
  const cellW = 92 / cols; // left range 4..96 (%)
  const cellH = 86 / rows; // top range 6..92 (%)

  const items = [];
  for (let i = 0; i < max; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const size = 2.5 + rng() * 4.2;
    const cx = 4 + cellW * col + cellW / 2;
    const cy = 7 + cellH * row + cellH / 2;
    const left = cx + (rng() - 0.5) * cellW * 0.6;
    const top = cy + (rng() - 0.5) * cellH * 0.6;

    const coin = COIN_IMAGES[i % COIN_IMAGES.length];
    items.push({
      key: i,
      src: coin.src,
      alt: coin.alt,
      left,
      top,
      size,
      dur: 5 + rng() * 6,
      delay: rng() * -9,
      drift: (rng() - 0.5) * 26,
      rot: -14 + rng() * 28,
    });
  }
  return items;
}

export function FloatingCoins({ count = 8, className = "" }) {
  const items = useMemo(() => buildFloatingCoins(count), [count]);
  return (
    <div className={`floating-coins ${className}`} aria-hidden>
      {items.map((c) => (
        <img
          key={c.key}
          src={c.src}
          alt={c.alt}
          draggable={false}
          className="floating-coin"
          style={{
            left: `${c.left}%`,
            top: `${c.top}%`,
            width: `${c.size}%`,
            "--fdur": `${c.dur}s`,
            "--fdrift": `${c.drift}px`,
            "--frot": `${c.rot}deg`,
            animationDelay: `${c.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Coin / token 3D (pure CSS)
// ----------------------------------------------------------------------------
function CoinFace({ side }) {
  return (
    <div className={`coin3d-face coin3d-${side}`}>
      <div className="coin-face-ring">
        <div className="coin-face-inner">
          <span className="coin-m">M</span>
          <span className="coin-ai">AI</span>
        </div>
      </div>
    </div>
  );
}

export function Coin3D({ size = 220, className = "" }) {
  return (
    <div className={`coin3d ${className}`}
      style={{ width: size, height: size, "--cr": `${Math.round(size * 0.68)}px` }} aria-hidden>
      <div className="coin-orbit">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="coin3d-inner">
        <CoinFace side="front" />
        <CoinFace side="back" />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Hash/status ticker — blockchain-explorer vibe
// ----------------------------------------------------------------------------
const TICKER = [
  "BLOCK 0x1a7f9e2b…",
  "MILESTONE #2 RELEASED",
  "CONFIDENCE 92/100",
  "TX 0x8b3d12aa…",
  "ESCROW #4 MINED",
  "AI AGENT VERIFIED",
  "DANA CAIR 2.400 TK",
  "FUNDS RELEASED 2.400 TK",
  "PROOF SUBMITTED",
  "BLOCK 0x5cc01d8f…",
];

export function HashTicker() {
  const items = [...TICKER, ...TICKER];
  return (
    <div className="ticker" aria-hidden>
      <div className="ticker-track">
        {items.map((t, i) => (
          <span key={i} className="ticker-item">
            <span className="tick-dot" /> {t}
          </span>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Scroll progress bar (thin, blue→purple gradient) at the top of the page
// ----------------------------------------------------------------------------
export function ScrollProgress() {
  const bar = useRef(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const p = max <= 0 ? 0 : window.scrollY / max;
        if (bar.current) bar.current.style.transform = `scaleX(${p})`;
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div className="progbar" aria-hidden>
      <i ref={bar} />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Simple parallax: element moves slower than the "scrolling" element (Fates-like).
// speed > 0 follows scroll direction, speed < 0 opposes it.
// opacityOut = true -> element fades out when leaving the viewport.
// ----------------------------------------------------------------------------
export function Parallax({ children, speed = -0.2, opacityOut = false, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const center = r.top + r.height / 2 - window.innerHeight / 2;
        el.style.transform = `translate3d(0, ${center * speed}px, 0)`;
        if (opacityOut) {
          const d = Math.min(1, Math.max(0, Math.abs(r.top) / (window.innerHeight * 0.85)));
          el.style.opacity = String(1 - d);
        }
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [speed, opacityOut]);
  return (
    <div ref={ref} className={`parallax ${className}`}>
      {children}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Big marquee (Fates vibe) — giant outlined text scrolling horizontally.
// ----------------------------------------------------------------------------
export function Marquee({ items, sep = "◇" }) {
  const doubled = [...items, ...items];
  return (
    <div className="marqueeBig" aria-hidden>
      <div className="marqueeBig-track">
        {doubled.map((t, i) => (
          <span key={i} className="marqueeBig-item">
            {t}
            <em>{sep}</em>
          </span>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// StoryStack — "pinned story" section Fates-style:
// container height = (steps count) * 100vh, inner sticky 100vh.
// Scroll progress picks the active step; past ones blur-fade upward.
// ----------------------------------------------------------------------------
export function StoryStack({ steps }) {
  const wrap = useRef(null);
  const bar = useRef(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = wrap.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const range = r.height - window.innerHeight;
        const p = range <= 0 ? 1 : Math.min(1, Math.max(0, -r.top / range));
        if (bar.current) bar.current.style.width = `${p * 100}%`;
        const next = Math.min(steps.length - 1, Math.max(0, Math.floor(p * steps.length)));
        setIdx((v) => (v === next ? v : next));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [steps.length]);

  return (
    <div className="story" ref={wrap} style={{ height: `${steps.length}00vh` }}>
      <div className="story-pin">
        <div className="story-label">How it works — scroll down</div>
        <div className="story-progress"><i ref={bar} /></div>
        <div className="story-stage">
          {steps.map((s, i) => (
            <div key={i} className={`story-slide ${i === idx ? "is-active" : i < idx ? "is-prev" : ""}`}>
              <span className="story-num">{String(i + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}</span>
              <h2>{s.title}</h2>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
        <div className="story-side" aria-hidden>
          {steps.map((s, i) => (
            <span key={i} className={i === idx ? "on" : ""} />
          ))}
        </div>
      </div>
    </div>
  );
}