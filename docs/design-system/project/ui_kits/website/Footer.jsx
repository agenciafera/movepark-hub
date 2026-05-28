/* Footer.jsx — three-column link footer + legal band.
   Matches Airbnb's light-on-light footer style (no contrast band).
*/

function Footer() {
  const cols = [
    { title: "Suporte", links: ["Central de ajuda", "AirCover", "Acessibilidade", "Cancelamento", "Reportar um problema"] },
    { title: "Operadores", links: ["Anuncie sua vaga", "AirCover para operadores", "Recursos para hosts", "Fórum da comunidade", "Receba responsavelmente"] },
    { title: "Movepark", links: ["Sala de imprensa", "Novidades", "Carreiras", "Investidores", "Cartões-presente"] },
  ];
  return (
    <footer className="mp-footer" data-screen-label="Footer">
      <div className="mp-footer-cols">
        {cols.map(c => (
          <div key={c.title} className="mp-footer-col">
            <h4>{c.title}</h4>
            {c.links.map(l => <a key={l} href="#">{l}</a>)}
          </div>
        ))}
      </div>
      <div className="mp-legal">
        <div>© 2026 Movepark, Inc. · <a href="#" style={{color:"var(--colors-muted)"}}>Privacidade</a> · <a href="#" style={{color:"var(--colors-muted)"}}>Termos</a> · <a href="#" style={{color:"var(--colors-muted)"}}>Mapa do site</a></div>
        <div className="mp-legal-links">
          <a href="#"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20"/><path d="M12 2a15 15 0 0 0 0 20"/></svg> Português (BR)</a>
          <a href="#">R$ BRL</a>
          <a href="#">Instagram</a>
          <a href="#">LinkedIn</a>
        </div>
      </div>
    </footer>
  );
}

window.Footer = Footer;
