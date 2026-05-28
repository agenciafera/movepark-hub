/* CategoryStrip.jsx — horizontal category filter under the search bar.
   Movepark categories: Cobertas, Próximas, 24h, Com Valet, Para SUV, Para van, Carregamento EV…
*/

function CatIcon({ name }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "covered": return (<svg {...common}><path d="M3 11l9-7 9 7"/><path d="M5 11v9h14v-9"/></svg>);
    case "near": return (<svg {...common}><path d="M12 22s8-7 8-13a8 8 0 0 0-16 0c0 6 8 13 8 13z"/><circle cx="12" cy="9" r="3"/></svg>);
    case "twentyfour": return (<svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>);
    case "valet": return (<svg {...common}><circle cx="12" cy="7" r="3"/><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/></svg>);
    case "suv": return (<svg {...common}><path d="M3 14l2-6h14l2 6"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M3 14h18v3H3z"/></svg>);
    case "van": return (<svg {...common}><rect x="2" y="8" width="14" height="9" rx="1"/><path d="M16 11h4l1 3v3h-5"/><circle cx="6" cy="18" r="1.5"/><circle cx="18" cy="18" r="1.5"/></svg>);
    case "ev": return (<svg {...common}><rect x="3" y="6" width="13" height="13" rx="2"/><path d="M16 10h2l2 2v5a2 2 0 0 1-2 2"/><path d="M8 11l-2 3h4l-2 3"/></svg>);
    case "secured": return (<svg {...common}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>);
    case "airport": return (<svg {...common}><path d="M2 16l8-4 5 6 1-1-3-7 8-4-1-2-9 3-5-3-1 1 3 4-6 3z"/></svg>);
    case "downtown": return (<svg {...common}><rect x="3" y="9" width="7" height="12"/><rect x="10" y="3" width="7" height="18"/><rect x="17" y="13" width="4" height="8"/></svg>);
    default: return null;
  }
}

function CategoryStrip({ categories, active, onChange }) {
  return (
    <div className="mp-categories">
      {categories.map(c => (
        <button
          key={c.id}
          className={`mp-cat ${active === c.id ? "is-active" : ""}`}
          onClick={() => onChange && onChange(c.id)}
        >
          <CatIcon name={c.icon} />
          <span className="mp-cat-label">{c.label}</span>
        </button>
      ))}
    </div>
  );
}

window.CategoryStrip = CategoryStrip;
window.CatIcon = CatIcon;
