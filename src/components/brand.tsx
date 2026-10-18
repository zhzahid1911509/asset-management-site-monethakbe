export function Brand({ href = "/" }: { href?: string }) {
  return (
    <a href={href} className="brand brand-image" aria-label="মনে থাকবে — Home">
      <img
        src="/brand/logo.jpg"
        width="1909"
        height="1280"
        alt="মনে থাকবে — Family Asset Management"
      />
    </a>
  );
}
