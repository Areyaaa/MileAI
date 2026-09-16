// ============================================================================
// Efek visual "web3/space" tanpa dependency eksternal:
//  - FxBackground : aurora blobs + gridlines + canvas jaringan node blockchain
//  - Coin3D       : token pie-flip 3D (CSS) dengan orbit ring + shine
//  - Reveal       : scroll-reveal (IntersectionObserver, ala Apple/Ledger)
//  - AnimatedNumber: counter naik saat elemen terlihat
//  - BrandMark    : logo hexagon-node SVG beranimasi
//  - HashTicker   : marquee ticker hash/status, nuansa explorer blockchain
// ============================================================================
import { useEffect, useRef, useState } from "react";

// ----------------------------------------------------------------------------
// Kanvas jaringan node blockchain (partikel ringan, tanpa library)
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
// Background halaman: aurora + gridlines + jaringan node
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
// Logo animasi: hexagon + node tersambung
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
// Counter naik saat terlihat
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
// Ticker hash/status — nuansa block explorer
// ----------------------------------------------------------------------------
const TICKER = [
  "BLOCK 0x1a7f9e2b…",
  "MILESTONE #2 RELEASED",
  "CONFIDENCE 92/100",
  "TX 0x8b3d12aa…",
  "ESCROW #4 MINED",
  "AI AGENT VERIFIED",
  "DANA CAIR 2.400 TK",
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
// Scroll progress bar (tipis, gradient biru→ungu) di bagian atas halaman
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
// Parallax sederhana: elemen bergeser lambat dari elemen yang "scroll" (Fates-like).
// speed > 0 ikut arah scroll, speed < 0 melawan arah.
// opacityOut = true -> elemen memudar saat keluar dari viewport.
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
// Marquee besar (nuansa Fates) — teks outline raksasa bergerak horizontal.
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
// StoryStack — section "pinned story" ala Fates:
// container tinggi = (jumlah step) * 100vh, inner sticky 100vh.
// Scroll progress menentukan step aktif; yang sudah lewat blur-fade ke atas.
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
        <div className="story-label">Cara kerja — geser ke bawah</div>
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