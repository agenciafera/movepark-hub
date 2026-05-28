/* TopNav.jsx — Movepark global navigation
   Three product tabs (Vagas / Mensal / Serviços), brand wordmark left,
   account utilities right. Inactive tabs muted; active tab has 2px underline.
*/

const { useState } = React;

function NavIcon({ name }) {
  const stroke = "currentColor";
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  if (name === "parking") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M9 17V8h4a3 3 0 0 1 0 6H9" />
      </svg>
    );
  }
  if (name === "monthly") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
        <path d="M8 3v4M16 3v4" />
      </svg>
    );
  }
  if (name === "services") {
    return (
      <svg {...common}>
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4l-6 6a2 2 0 1 0 2.8 2.8l6-6a4 4 0 0 0 5.4-5.4l-3 3-2.2-2.2 3-3z" />
      </svg>
    );
  }
  if (name === "globe") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15 15 0 0 1 0 20" />
        <path d="M12 2a15 15 0 0 0 0 20" />
      </svg>
    );
  }
  if (name === "menu") {
    return (
      <svg {...common}><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    );
  }
  return null;
}

function TopNav({ activeTab, onTabChange, onAccountClick }) {
  const tabs = [
    { id: "parking", label: "Vagas", icon: "parking" },
    { id: "monthly", label: "Mensal", icon: "monthly", isNew: true },
    { id: "services", label: "Serviços", icon: "services", isNew: true },
  ];
  return (
    <nav className="mp-nav" data-screen-label="Top nav">
      <div className="mp-nav-logo">
        <img src="../../assets/logo-movepark.svg" alt="Movepark" />
      </div>
      <div className="mp-nav-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`mp-tab ${activeTab === t.id ? "is-active" : ""}`}
            onClick={() => onTabChange && onTabChange(t.id)}
          >
            <NavIcon name={t.icon} />
            <span className="mp-tab-label">{t.label}</span>
            {t.isNew ? <span className="mp-new-tag">NEW</span> : null}
          </button>
        ))}
      </div>
      <div className="mp-nav-right">
        <a className="mp-nav-link" href="#">Seja um operador</a>
        <button className="mp-icon-btn" aria-label="Idioma"><NavIcon name="globe" /></button>
        <button className="mp-account" onClick={onAccountClick} aria-label="Conta">
          <NavIcon name="menu" />
          <div className="mp-avatar">A</div>
        </button>
      </div>
    </nav>
  );
}

window.TopNav = TopNav;
window.NavIcon = NavIcon;
