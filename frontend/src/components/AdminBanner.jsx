import "./AdminBanner.css";

export function AdminBanner({ eyebrow, title, description, children }) {
  return <header className="admin-banner">
    <div className="admin-banner-eyebrow">{eyebrow}</div>
    <h1>{title}</h1>
    <p>{description}</p>
    {children && <div className="admin-banner-actions">{children}</div>}
  </header>;
}
