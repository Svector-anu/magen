import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "./lib/wagmiConfig.js";
import { WalletButton } from "./components/WalletButton.js";
import { Home } from "./pages/Home.js";
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
                <WalletButton />
              </header>
              <main className={styles.main}>
                <Routes>
                  <Route path="/" element={<Home />} />
                </Routes>
              </main>
            </div>
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
