import { useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { BrowserProvider, type Eip1193Provider } from "ethers";
import { IExecDataProtector } from "@iexec/dataprotector";
import styles from "./EmailOptInModal.module.css";

const WEB3MAIL_WHITELIST = "0x8d46d40840f1Aa2264F96184Ffadf04e5D573B9B";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const OPT_IN_KEY = "magen_notify_optin";

type Stage = "input" | "protecting" | "granting" | "done" | "error";

interface Props {
  onClose: () => void;
  onOptedIn?: () => void;
}

const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;

export function EmailOptInModal({ onClose, onOptedIn }: Props) {
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Stage>("input");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const { wallets } = useWallets();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || stage !== "input") return;

    const wallet = wallets[0];
    if (!wallet) {
      setStage("error");
      setErrorMsg("No wallet found. Sign in first and try again.");
      return;
    }

    try {
      const eip1193 = await wallet.getEthereumProvider() as Eip1193Provider;
      const makeProvider = () => new BrowserProvider(eip1193);

      let readyProvider = makeProvider();
      const { chainId: liveChainId } = await readyProvider.getNetwork();

      if (Number(liveChainId) !== ARBITRUM_SEPOLIA_CHAIN_ID) {
        setStage("protecting");
        setStatusMsg("Switching to Arbitrum Sepolia…");
        try {
          await wallet.switchChain(ARBITRUM_SEPOLIA_CHAIN_ID);
        } catch {
          await eip1193.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x66eee",
              chainName: "Arbitrum Sepolia",
              nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
              blockExplorerUrls: ["https://sepolia.arbiscan.io"],
            }],
          });
        }
        readyProvider = makeProvider();
        const { chainId: afterSwitch } = await readyProvider.getNetwork();
        if (Number(afterSwitch) !== ARBITRUM_SEPOLIA_CHAIN_ID) {
          throw new Error("Chain switch did not complete. Please switch to Arbitrum Sepolia manually and try again.");
        }
      }

      const signer = await readyProvider.getSigner();
      const dataProtector = new IExecDataProtector(
        signer as ConstructorParameters<typeof IExecDataProtector>[0],
        { allowExperimentalNetworks: true }
      );

      setStage("protecting");
      setStatusMsg("Encrypting email — approve transaction in MetaMask…");

      const { address: protectedData } = await dataProtector.core.protectData({
        data: { email },
        name: "Magen notifications",
        onStatusUpdate: ({ title }) => {
          if (title) setStatusMsg(title);
        },
      });

      setStage("granting");
      setStatusMsg("Granting access to Web3Mail — approve transaction in MetaMask…");

      await dataProtector.core.grantAccess({
        protectedData,
        authorizedApp: WEB3MAIL_WHITELIST,
        authorizedUser: ZERO_ADDRESS,
        numberOfAccess: 100,
      });

      localStorage.setItem(OPT_IN_KEY, "1");
      onOptedIn?.();
      setStage("done");
    } catch (err) {
      setStage("error");
      const cause = (err as { errorCause?: unknown })?.errorCause;
      const msg = cause ? `${String(err)} — cause: ${String(cause)}` : String(err);
      setErrorMsg(msg);
    }
  }

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget && stage !== "protecting" && stage !== "granting") {
          onClose();
        }
      }}
    >
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Notifications</span>
          <button
            className={styles.btnClose}
            onClick={onClose}
            disabled={stage === "protecting" || stage === "granting"}
          >
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          {stage === "input" && (
            <>
              <div className={styles.modalHeadline}>
                <p className={styles.headline}>Private payment notifications</p>
                <p className={styles.subheadline}>
                  Get email updates without sharing your email with Magen.
                </p>
              </div>

              <div className={styles.infoSection}>
                <p className={styles.infoLabel}>What you'll get</p>
                <ul className={styles.eventList}>
                  <li>Payment sent (with transaction hash)</li>
                  <li>Payment failed or paused (with reason)</li>
                  <li>Payment received (incoming transfers)</li>
                </ul>
              </div>

              <div className={styles.stepsSection}>
                <p className={styles.infoLabel}>2 wallet actions required</p>
                <div className={styles.stepRow}>
                  <span className={styles.stepNum}>1</span>
                  <div className={styles.stepDetail}>
                    <span className={styles.stepTitle}>Encrypt &amp; register email</span>
                    <span className={styles.stepDesc}>
                      Encrypt your email locally and store it via iExec DataProtector on Arbitrum Sepolia.
                    </span>
                  </div>
                  <span className={styles.gasBadge}>gas</span>
                </div>
                <div className={styles.stepRow}>
                  <span className={styles.stepNum}>2</span>
                  <div className={styles.stepDetail}>
                    <span className={styles.stepTitle}>Authorize notifications</span>
                    <span className={styles.stepDesc}>
                      Sign an EIP-712 message to allow Web3Mail to send notifications to your encrypted address.
                    </span>
                  </div>
                  <span className={styles.freeBadge}>free</span>
                </div>
                <p className={styles.privacyNote}>
                  Your email is encrypted client-side — Magen never sees or stores it in plaintext.
                </p>
              </div>

              <form onSubmit={handleSubmit}>
                <label className={styles.fieldLabel}>Your email address</label>
                <input
                  type="email"
                  className={styles.emailInput}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
                <button type="submit" className={styles.btnPrimary}>
                  Enable notifications →
                </button>
              </form>
            </>
          )}

          {(stage === "protecting" || stage === "granting") && (
            <div className={styles.processing}>
              <div className={styles.spinner} />
              <p className={styles.statusMsg}>{statusMsg}</p>
              <p className={styles.statusSub}>
                {stage === "protecting" ? "Step 1 / 2 — encrypting & uploading" : "Step 2 / 2 — authorizing"}
              </p>
            </div>
          )}

          {stage === "done" && (
            <div className={styles.success}>
              <span className={styles.successIcon}>✓</span>
              <p className={styles.successTitle}>Notifications enabled</p>
              <p className={styles.successSub}>
                You'll receive emails on payment success and failures via iExec Web3Mail.
              </p>
              <button className={styles.btnPrimary} onClick={onClose}>
                Done
              </button>
            </div>
          )}

          {stage === "error" && (
            <div className={styles.errorBox}>
              <p className={styles.errorTitle}>Something went wrong</p>
              <p className={styles.errorMsg}>{errorMsg.slice(0, 250)}</p>
              <button className={styles.btnGhost} onClick={() => setStage("input")}>
                Try again
              </button>
            </div>
          )}
        </div>

        {stage === "input" && (
          <div className={styles.modalFooter}>
            <span className={styles.footerNote}>
              Powered by iExec DataProtector + Web3Mail
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
