import { useEffect, useRef, useState } from "react";
import styles from "./EcosystemSection.module.css";

const LINES = [
  "Money that runs on your rules.",
  "Set it once → it pays, every time.",
  "Amounts hidden. Logic enforced.",
  "Powered by Arbitrum. secured by iExec.",
  "This is how money moves now.",
];

// USDC is the anchor — all others start stacked behind it
// All pairs are symmetric around the 50% horizontal axis
const ANCHOR = { left: 47, top: 12 };

const ICONS = [
  // ① anchor — top center
  { id: "usdc",      src: "/icons/usdc.png",           left: 47, top: 12, size: 86, drift: "magenDrift3", dur: "35s", driftDelay: "-15s", scatterDelay: 0,   isAnchor: true },
  // ② inner ring   (centers at 26% / 74% — symmetric)
  { id: "arbitrum",  src: "/icons/arb.png",             left: 23, top: 26, size: 86, drift: "magenDrift1", dur: "32s", driftDelay: "0s",   scatterDelay: 120 },
  { id: "iexec",     src: "/icons/iexec.png",           left: 71, top: 26, size: 86, drift: "magenDrift2", dur: "28s", driftDelay: "-8s",  scatterDelay: 200 },
  // ③ widest ring  (centers at 13% / 87% — symmetric)
  { id: "farcaster", src: "/icons/farcaster.png",       left: 10, top: 48, size: 86, drift: "magenDrift5", dur: "38s", driftDelay: "-20s", scatterDelay: 300 },
  { id: "ens",       src: "/icons/ens-mark-Blue.svg",   left: 80, top: 48, size: 86, drift: "magenDrift4", dur: "30s", driftDelay: "-5s",  scatterDelay: 380 },
  // ④ bottom pair  (centers at 27% / 73% — symmetric)
  { id: "privy",     src: "/icons/Privy-square.svg",    left: 24, top: 73, size: 86, drift: "magenDrift6", dur: "26s", driftDelay: "-10s", scatterDelay: 460 },
  { id: "coinbase",  src: "/icons/coinbase.png",        left: 70, top: 73, size: 86, drift: "magenDrift7", dur: "33s", driftDelay: "-3s",  scatterDelay: 540 },
];

export function EcosystemSection() {
  const sectionRef  = useRef<HTMLElement>(null);
  const [revealCount, setRevealCount] = useState(1);
  const [scattered,   setScattered]   = useState(false);
  const [drifting,    setDrifting]     = useState(false);

  // scroll-reveal for text
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const onScroll = () => {
      const rect = section.getBoundingClientRect();
      const scrollable = section.offsetHeight - window.innerHeight;
      if (scrollable <= 0) { setRevealCount(LINES.length); return; }
      const progress = Math.max(0, Math.min(1, -rect.top / scrollable));
      setRevealCount(Math.min(1 + Math.floor(progress * LINES.length), LINES.length));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // scatter trigger on first viewport entry
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setScattered(true);
          setTimeout(() => setDrifting(true), 1600);
          observer.disconnect();
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className={styles.section}>
      <div className={styles.sticky}>

        {ICONS.map(({ id, src, left, top, size, drift, dur, driftDelay, scatterDelay, isAnchor }) => {
          // vector from icon's final position → anchor position (where all start stacked)
          const sx = `${ANCHOR.left - left}vw`;
          const sy = `${ANCHOR.top  - top}vh`;

          return (
            <div
              key={id}
              className={styles.icon}
              style={{
                left: `${left}%`,
                top:  `${top}%`,
                width: size,
                height: size,
                transform: drifting
                  ? undefined
                  : scattered
                    ? "translate(0,0) scale(1)"
                    : `translate(${sx},${sy}) scale(${isAnchor ? 0.75 : 0.5})`,
                opacity:    scattered ? 1 : 0,
                transition: drifting ? "none" : scattered
                  ? `transform 0.8s cubic-bezier(0.34,1.56,0.64,1) ${scatterDelay}ms, opacity 0.35s ease ${scatterDelay}ms`
                  : "none",
                animation:  drifting
                  ? `${drift} ${dur} ease-in-out ${driftDelay} infinite`
                  : "none",
                zIndex: isAnchor ? 3 : 1,
              }}
            >
              <img src={src} alt={id} width={size} height={size} draggable={false} />
            </div>
          );
        })}

        <div className={styles.center}>
          {LINES.map((line, i) => (
            <p
              key={i}
              className={`${styles.line} ${i < revealCount ? styles.lineVisible : ""} ${i === LINES.length - 1 ? styles.lineKiller : ""}`}
            >
              {line}
            </p>
          ))}
        </div>

      </div>
    </section>
  );
}
