import styles from "./brand.module.css";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <a href={href} className="brand brand-image" aria-label="মনে থাকবে — Home">
      <span className={styles.artwork}>
        <img
          className={styles.light}
          src="/brand/logo-light.png"
          alt="মনে থাকবে — Family Asset Management"
        />
        <img
          className={styles.dark}
          src="/brand/logo-dark.jpg"
          alt="মনে থাকবে — Family Asset Management"
        />
      </span>
    </a>
  );
}
