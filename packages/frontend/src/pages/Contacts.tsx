import { useState, useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useSignMessage } from "wagmi";
import { api } from "../lib/api.js";
import { getOrSign } from "../lib/walletAuth.js";
import type { Contact } from "@magen/shared";
import styles from "./Contacts.module.css";

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;

interface FormState {
  display_name: string;
  wallet_address: string;
  email: string;
  aliases: string;
}

const EMPTY_FORM: FormState = { display_name: "", wallet_address: "", email: "", aliases: "" };

export function Contacts() {
  const { authenticated, login } = usePrivy();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const signRef = useRef(signMessageAsync);
  useEffect(() => { signRef.current = signMessageAsync; });

  useEffect(() => {
    if (!address) { setLoading(false); return; }
    getOrSign(address, "list-contacts", (msg) => signRef.current({ message: msg }))
      .then((auth) => api.listContacts(address, auth.sig, auth.minute))
      .then(setContacts)
      .catch(() => setContacts([]))
      .finally(() => setLoading(false));
  }, [address]);

  useEffect(() => {
    if (showForm) nameRef.current?.focus();
  }, [showForm]);

  function openForm() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setFormError(null);
  }

  async function handleSave() {
    setFormError(null);
    if (!address) return;
    if (!form.display_name.trim()) { setFormError("Name is required."); return; }
    if (form.wallet_address && !EVM_RE.test(form.wallet_address)) {
      setFormError("Wallet must be a valid 0x address (42 chars).");
      return;
    }

    setSaving(true);
    try {
      const auth = await getOrSign(address, "save-contact", (msg) => signRef.current({ message: msg }));
      const payload: Parameters<typeof api.upsertContact>[0] = {
        display_name: form.display_name.trim(),
        aliases: form.aliases.split(",").map(a => a.trim()).filter(Boolean),
        resolution_status: form.wallet_address ? "confirmed" : "unresolved",
        ...(form.wallet_address ? { wallet_address: form.wallet_address.trim() } : {}),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
      };
      const created = await api.upsertContact(payload, address, auth.sig, auth.minute);
      setContacts(prev => [created, ...prev]);
      closeForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save contact.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!address) return;
    setDeletingId(id);
    try {
      const auth = await getOrSign(address, "delete-contact", (msg) => signRef.current({ message: msg }));
      await api.deleteContact(id, address, auth.sig, auth.minute);
      setContacts(prev => prev.filter(c => c.id !== id));
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  }

  function statusBadgeClass(status: Contact["resolution_status"]) {
    if (status === "confirmed") return `${styles.badge} ${styles.badgeConfirmed}`;
    if (status === "resolved") return `${styles.badge} ${styles.badgeResolved}`;
    return `${styles.badge} ${styles.badgeUnresolved}`;
  }

  if (!authenticated) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>◈</div>
          <div className={styles.emptyTitle}>sign in first</div>
          <div className={styles.emptyText}>Contacts are linked to your account.</div>
          <button className={styles.btnPrimary} onClick={login}>sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <h1 className={styles.title}>contacts</h1>
          <span className={styles.count}>{contacts.length} saved</span>
        </div>
        <button className={styles.btnPrimary} onClick={openForm}>+ add contact</button>
      </div>

      {showForm && (
        <div className={styles.formCard}>
          <div className={styles.formHeader}>new contact</div>
          <div className={styles.formBody}>
            <label className={styles.fieldLabel}>
              name <span className={styles.required}>*</span>
              <input
                ref={nameRef}
                className={styles.input}
                placeholder="Alice"
                value={form.display_name}
                onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
              />
            </label>
            <label className={styles.fieldLabel}>
              wallet address
              <input
                className={styles.input}
                placeholder="0x..."
                value={form.wallet_address}
                onChange={e => setForm(f => ({ ...f, wallet_address: e.target.value }))}
              />
            </label>
            <label className={styles.fieldLabel}>
              email <span className={styles.optional}>(optional)</span>
              <input
                className={styles.input}
                placeholder="alice@company.com"
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </label>
            <label className={styles.fieldLabel}>
              aliases <span className={styles.optional}>(comma-separated)</span>
              <input
                className={styles.input}
                placeholder="@alice, designlead"
                value={form.aliases}
                onChange={e => setForm(f => ({ ...f, aliases: e.target.value }))}
              />
            </label>
            {formError && <div className={styles.formError}>{formError}</div>}
          </div>
          <div className={styles.formFooter}>
            <button className={styles.btnGhost} onClick={closeForm} disabled={saving}>cancel</button>
            <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
              {saving ? "saving…" : "save contact"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className={styles.loadingRow}>
          <span className={styles.spinner} />
          loading contacts…
        </div>
      ) : contacts.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>◈</div>
          <div className={styles.emptyTitle}>no contacts yet</div>
          <div className={styles.emptyText}>
            Save recipients by name so you can reference them in payment instructions.
          </div>
        </div>
      ) : (
        <div className={styles.list}>
          {contacts.map(c => (
            <div key={c.id} className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowName}>{c.display_name}</div>
                {c.wallet_address && (
                  <div className={styles.rowWallet}>
                    {c.wallet_address.slice(0, 8)}…{c.wallet_address.slice(-6)}
                  </div>
                )}
                {c.aliases.length > 0 && (
                  <div className={styles.rowAliases}>
                    {c.aliases.map(a => (
                      <span key={a} className={styles.alias}>{a}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.rowRight}>
                <span className={statusBadgeClass(c.resolution_status)}>{c.resolution_status}</span>
                <button
                  className={styles.deleteBtn}
                  onClick={() => handleDelete(c.id)}
                  disabled={deletingId === c.id}
                  aria-label={`Delete ${c.display_name}`}
                >
                  {deletingId === c.id ? "…" : "✕"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
