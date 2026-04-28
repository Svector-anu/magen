import { useState } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { arbitrumSepolia } from "wagmi/chains";
import { wagmiConfig } from "./lib/wagmiConfig.js";
import { WalletButton } from "./components/WalletButton.js";
import { ThemeToggle } from "./components/ThemeToggle.js";
import { MobileMenu } from "./components/MobileMenu.js";
import { NotificationBanner } from "./components/NotificationBanner.js";
import { NotificationBell } from "./components/NotificationBell.js";
import { EmailOptInModal } from "./components/EmailOptInModal.js";
import { Footer } from "./components/Footer.js";
import { Home } from "./pages/Home.js";
import { Dashboard } from "./pages/Dashboard.js";
import { Contacts } from "./pages/Contacts.js";
import styles from "./App.module.css";

const queryClient = new QueryClient();

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string;

export function App() {
  const [showOptIn, setShowOptIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "light",
          accentColor: "#7c3aed",
          logo: "/logo.svg",
          landingHeader: "Sign in to Magen",
          loginMessage: "Private scheduled payments on Arbitrum",
          walletChainType: "ethereum-only",
        },
        loginMethods: ["email", "wallet", "google", "apple"],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
        defaultChain: arbitrumSepolia,
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
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
                  <NavLink
                    to="/"
                    end
                    className={({ isActive }) =>
                      `${styles.navLink} ${isActive ? styles.navActive : ""}`
                    }
                  >
                    New Payment
                  </NavLink>

                  <div className={styles.navDivider} />

                  <NavLink
                    to="/dashboard"
                    className={({ isActive }) =>
                      `${styles.navLink} ${isActive ? styles.navActive : ""}`
                    }
                  >
                    Dashboard
                  </NavLink>

                  <div className={styles.navDivider} />

                  <NavLink
                    to="/contacts"
                    className={({ isActive }) =>
                      `${styles.navLink} ${isActive ? styles.navActive : ""}`
                    }
                  >
                    Contacts
                  </NavLink>
                </nav>

                <div className={styles.navRight}>
                  <span className={styles.themeToggleDesktop}>
                    <ThemeToggle />
                  </span>
                  <NotificationBell />
                  <WalletButton />
                  <button
                    className={styles.hamburger}
                    onClick={() => setMenuOpen(true)}
                    aria-label="Open menu"
                  >
                    ☰
                  </button>
                </div>
              </header>

              <MobileMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />

              <main className={styles.main}>
                <NotificationBanner onEnable={() => setShowOptIn(true)} forceHide={true} />
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/contacts" element={<Contacts />} />
                </Routes>
              </main>
              <Footer />
              {showOptIn && (
                <EmailOptInModal
                  onClose={() => setShowOptIn(false)}
                  onOptedIn={() => setShowOptIn(false)}
                />
              )}
            </div>
          </BrowserRouter>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
