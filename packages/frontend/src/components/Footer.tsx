import { NavLink } from "react-router-dom";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>

        {/* ── top row ── */}
        <div className={styles.top}>
          <div className={styles.topLeft}>
            <span className={styles.eyebrow}>open source · arbitrum sepolia · iExec Nox FHE</span>
            <p className={styles.cta}>
              automate payments.<br />
              <span className={styles.ctaAccent}>privacy built in.</span>
            </p>
            <a
              className={styles.ctaLink}
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              view on GitHub →
            </a>
          </div>

          <nav className={styles.topRight}>
            <NavLink to="/" end className={styles.footerLink}>New Payment</NavLink>
            <NavLink to="/dashboard" className={styles.footerLink}>Dashboard</NavLink>
            <NavLink to="/contacts" className={styles.footerLink}>Contacts</NavLink>
          </nav>
        </div>

        {/* ── wordmark ── */}
        <div className={styles.wordmarkRow}>
          <span className={styles.wordmark}>magen</span>
        </div>

        {/* ── bottom bar ── */}
        <div className={styles.bottom}>
          <span className={styles.copy}>© 2026 Magen · private · encrypted · on-chain</span>
          <div className={styles.bottomLinks}>
            <a href="https://arbitrum.io" target="_blank" rel="noopener noreferrer" className={styles.bottomLink}>Arbitrum</a>
            <span className={styles.bottomDot}>·</span>
            <a href="https://iex.ec" target="_blank" rel="noopener noreferrer" className={styles.bottomLink}>iExec</a>
            <span className={styles.bottomDot}>·</span>
            <a href="https://github.com/Svector-anu/magen" target="_blank" rel="noopener noreferrer" className={styles.bottomLink}>GitHub</a>
          </div>
        </div>

      </div>
    </footer>
  );
}
