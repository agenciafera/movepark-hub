/* SearchBar.jsx — pill-shaped global search.
   Three segments (Onde / Quando / Duração) divided by hairlines,
   terminated by the red search orb. The expanded state with the
   "Buscar" label widens the orb to a pill (rare; only when a query
   has been entered).
*/

function SearchIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  );
}

function SearchBar({ where, when, duration, onSearch, expanded }) {
  return (
    <div className="mp-search-wrap">
      <div className="mp-search" role="search">
        <div className={`mp-search-seg ${where ? "has-val" : ""}`} role="button" tabIndex="0">
          <div className="mp-search-lab">Onde</div>
          <div className="mp-search-val">{where || "Buscar vagas"}</div>
        </div>
        <div className={`mp-search-seg ${when ? "has-val" : ""}`} role="button" tabIndex="0">
          <div className="mp-search-lab">Quando</div>
          <div className="mp-search-val">{when || "Adicionar data"}</div>
        </div>
        <div className={`mp-search-seg ${duration ? "has-val" : ""}`} role="button" tabIndex="0">
          <div className="mp-search-lab">Duração</div>
          <div className="mp-search-val">{duration || "Por quanto tempo"}</div>
        </div>
        <button className={`mp-search-orb ${expanded ? "is-wide" : ""}`} onClick={onSearch} aria-label="Buscar">
          <SearchIcon />
          {expanded ? <span>Buscar</span> : null}
        </button>
      </div>
    </div>
  );
}

window.SearchBar = SearchBar;
window.SearchIcon = SearchIcon;
