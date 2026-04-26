import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "./lib/wagmiConfig.js";
import { WalletButton } from "./components/WalletButton.js";
import { NotificationBanner } from "./components/NotificationBanner.js";
import { EmailOptInModal } from "./components/EmailOptInModal.js";
import { Home } from "./pages/Home.js";
import { Dashboard } from "./pages/Dashboard.js";
import styles from "./App.module.css";

const queryClient = new QueryClient();

const rkTheme = darkTheme({
  accentColor: "#2f81f7",
  accentColorForeground: "white",
  borderRadius: "none",
  overlayBlur: "small",
});

export function App() {
  const [showOptIn, setShowOptIn] = useState(false);
  const [notifyOptedIn, setNotifyOptedIn] = useState(false);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rkTheme}>
          <BrowserRouter>
            <div className={styles.shell}>
              <header className={styles.header}>
                <a href="/" className={styles.logo}>
                  <svg viewBox="40 22 290 124" width="108" height="38" xmlns="http://www.w3.org/2000/svg" aria-label="Magen">
                    <path d="M80 28 L112 40 L112 88 C112 112 98 130 80 138 C62 130 48 112 48 88 L48 40 Z" fill="#7c3aed"/>
                    <text x="136" y="102" fontFamily="Georgia, 'Times New Roman', serif" fontSize="64" fontWeight="700" letterSpacing="-1" fill="currentColor">magen</text>
                  </svg>
                </a>

                <nav className={styles.navCapsule}>
                  {/* Payments dropdown */}
                  <div className={styles.navItem}>
                    <span className={styles.navLink}>
                      Payments <span className={styles.navCaret}>▾</span>
                    </span>
                    <div className={styles.dropdown}>
                      <div className={styles.dropdownPanel}>
                        <NavLink to="/" end className={styles.dropdownItem}>
                          <span className={styles.dropdownIcon}>✦</span>
                          <span className={styles.dropdownLabel}>
                            <span className={styles.dropdownTitle}>New Payment</span>
                            <span className={styles.dropdownDesc}>Schedule a private transfer</span>
                          </span>
                        </NavLink>
                        <div className={styles.dropdownDivider} />
                        <NavLink to="/dashboard" className={styles.dropdownItem}>
                          <span className={styles.dropdownIcon}>◈</span>
                          <span className={styles.dropdownLabel}>
                            <span className={styles.dropdownTitle}>My Policies</span>
                            <span className={styles.dropdownDesc}>View active schedules</span>
                          </span>
                        </NavLink>
                      </div>
                    </div>
                  </div>

                  <div className={styles.navDivider} />

                  {/* Dashboard direct link */}
                  <NavLink
                    to="/dashboard"
                    className={({ isActive }) =>
                      `${styles.navLink} ${isActive ? styles.navActive : ""}`
                    }
                  >
                    Dashboard
                  </NavLink>
                </nav>

                <div className={styles.navRight}>
                  <WalletButton />
                </div>
              </header>
              <main className={styles.main}>
                <NotificationBanner onEnable={() => setShowOptIn(true)} forceHide={notifyOptedIn} />
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                </Routes>
              </main>
              {showOptIn && (
                <EmailOptInModal
                  onClose={() => setShowOptIn(false)}
                  onOptedIn={() => {
                    setNotifyOptedIn(true);
                    setShowOptIn(false);
                  }}
                />
              )}
            </div>
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
