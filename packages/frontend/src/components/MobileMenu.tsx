import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle.js";
import styles from "./MobileMenu.module.css";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileMenu({ isOpen, onClose }: Props) {
  // lock body scroll while open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label="Close menu">✕</button>

        <nav className={styles.nav}>
          <NavLink
            to="/"
            end
            className={({ isActive }) => `${styles.link} ${isActive ? styles.linkActive : ""}`}
            onClick={onClose}
          >
            New Payment
          </NavLink>
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `${styles.link} ${isActive ? styles.linkActive : ""}`}
            onClick={onClose}
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/contacts"
            className={({ isActive }) => `${styles.link} ${isActive ? styles.linkActive : ""}`}
            onClick={onClose}
          >
            Contacts
          </NavLink>
        </nav>

        <div className={styles.footer}>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
