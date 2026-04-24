import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "./lib/wagmiConfig.js";
import { WalletButton } from "./components/WalletButton.js";
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
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rkTheme}>
          <BrowserRouter>
            <div className={styles.shell}>
              <header className={styles.header}>
                <div className={styles.logo}>
                  <span className={styles.logoMark}>MAGEN</span>
                  <span className={styles.logoDivider}>▸</span>
                  <span className={styles.logoSub}>disbursements</span>
                </div>
                <nav className={styles.nav}>
                  <NavLink
                    to="/"
                    end
                    className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navActive : ""}`}
                  >
                    New
                  </NavLink>
                  <NavLink
                    to="/dashboard"
                    className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navActive : ""}`}
                  >
                    Dashboard
                  </NavLink>
                </nav>
                <WalletButton />
              </header>
              <main className={styles.main}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                </Routes>
              </main>
            </div>
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
