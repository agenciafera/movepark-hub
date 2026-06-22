/* ListingDetail.jsx — listing detail page.
   Photo gallery + scrollable left column with sections, sticky reservation
   card on the right rail. The rating-display moment uses the system's only
   loud type token (64px / 900).
*/

const { useState: useStateLD } = React;

function Laurel({ side }) {
  return (
    <svg width="16" height="44" viewBox="0 0 16 44" fill="none">
      <path
        d={side === "left"
          ? "M14 4 C 4 14, 4 30, 14 40"
          : "M2 4 C 12 14, 12 30, 2 40"}
        stroke="#29263F" strokeWidth="1.5" strokeLinecap="round" fill="none"
      />
    </svg>
  );
}

function AmenityIcon({ name }) {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "covered": return (<svg {...common}><path d="M3 11l9-7 9 7"/><path d="M5 11v9h14v-9"/></svg>);
    case "24h":     return (<svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>);
    case "cctv":    return (<svg {...common}><rect x="2" y="6" width="16" height="10" rx="2"/><path d="M18 11h4l-4-4z"/></svg>);
    case "ev":      return (<svg {...common}><rect x="3" y="6" width="13" height="13" rx="2"/><path d="M16 10h2l2 2v5a2 2 0 0 1-2 2"/><path d="M8 11l-2 3h4l-2 3"/></svg>);
    case "valet":   return (<svg {...common}><circle cx="12" cy="7" r="3"/><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/></svg>);
    case "wifi":    return (<svg {...common}><path d="M5 12.55a11 11 0 0 1 14 0"/><path d="M2 8.82a16 16 0 0 1 20 0"/><path d="M8.5 16.43a6 6 0 0 1 7 0"/><circle cx="12" cy="20" r="1"/></svg>);
    default: return null;
  }
}

function ListingDetail({ listing, onBack, onReserve }) {
  const reserved = () => onReserve && onReserve(listing);
  return (
    <main className="mp-detail" data-screen-label="Listing detail">
      <button className="mp-detail-back" onClick={onBack}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        Voltar
      </button>

      <h1 className="mp-detail-title">{listing.detailTitle || listing.title}</h1>
      <div className="mp-detail-sub">
        ★ {listing.rating} · <a href="#">{listing.reviews || 248} avaliações</a> · <span>{listing.neighborhood}</span>
      </div>

      <div className="mp-detail-gallery">
        <div className="a" style={listing.gradient ? { background: listing.gradient } : null}>
          {listing.photos && listing.photos[0] ? <img src={listing.photos[0]} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : null}
        </div>
        <div className="b" style={listing.gradient2 || { background: "linear-gradient(160deg,#818FAF 0%, #29263F 100%)"}}></div>
        <div className="c" style={{ background: "linear-gradient(140deg,#E0E5F2 0%,#818FAF 100%)"}}></div>
        <div className="d" style={{ background: "linear-gradient(135deg,#4041A3 0%, #5D5FEF 100%)"}}></div>
        <div className="e" style={{ background: "linear-gradient(140deg,#29263F 0%, #4041A3 100%)"}}></div>
      </div>

      <div className="mp-detail-grid">
        <div>
          <section className="mp-detail-section">
            <h3>Vaga {listing.spotType || "coberta"} · {listing.host}</h3>
            <div className="mp-amenity-row">
              <div><AmenityIcon name="covered" /> Coberta · seca em qualquer clima</div>
              <div><AmenityIcon name="24h" /> Acesso 24 horas</div>
              <div><AmenityIcon name="cctv" /> Câmeras de segurança</div>
              <div><AmenityIcon name="ev" /> Tomada para carregamento</div>
            </div>
          </section>

          <section className="mp-detail-section">
            <h3>Sobre esta vaga</h3>
            <p>
              {listing.description ||
                "Vaga privativa em garagem coberta, com acesso por controle remoto e portaria 24h. Espaço amplo, comporta SUV. Boa iluminação e câmera direcionada para a vaga. Localização tranquila, próxima ao metrô e ao centro comercial."}
            </p>
          </section>

          <section className="mp-detail-section">
            <h3>O que esta vaga oferece</h3>
            <div className="mp-amenity-row">
              <div><AmenityIcon name="valet" /> Manobrista opcional</div>
              <div><AmenityIcon name="wifi" /> Wi-Fi na portaria</div>
              <div><AmenityIcon name="covered" /> Pé direito 2,2m</div>
              <div><AmenityIcon name="ev" /> 220V disponível</div>
            </div>
          </section>

          <section className="mp-detail-section">
            <div className="mp-rating-display">
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                <div className="mp-rating-number">
                  <Laurel side="left" />
                  {listing.rating}
                  <Laurel side="right" />
                </div>
                <div className="mp-rating-tag">Destaque Movepark</div>
                <div className="mp-rating-sub">Entre os 5% mais bem avaliados</div>
              </div>
              <div className="mp-rating-stats">
                <div className="mp-rating-stat"><span className="mp-rating-stat-lab">Limpeza</span><span className="mp-rating-stat-val">4.9</span></div>
                <div className="mp-rating-stat"><span className="mp-rating-stat-lab">Segurança</span><span className="mp-rating-stat-val">5.0</span></div>
                <div className="mp-rating-stat"><span className="mp-rating-stat-lab">Localização</span><span className="mp-rating-stat-val">4.8</span></div>
              </div>
            </div>
          </section>
        </div>

        <div className="mp-rail">
          <aside className="mp-reservation" data-screen-label="Reservation card">
            <div className="mp-res-price-row">
              <span className="mp-res-price">R$ {listing.price}</span>
              <span className="mp-res-per">/ hora</span>
            </div>
            <div className="mp-res-picker">
              <div><div className="lab">Chegada</div><div className="val">27 mai · 14:00</div></div>
              <div><div className="lab">Saída</div><div className="val">27 mai · 18:00</div></div>
            </div>
            <div className="mp-res-stepper"><span>Veículos</span><span>1 carro ▾</span></div>
            <button className="mp-res-cta" onClick={reserved}>Reservar</button>
            <div style={{textAlign:"center", fontSize:13, color:"var(--colors-muted)"}}>Você ainda não será cobrado</div>
            <div className="mp-res-fee"><span>R$ {listing.price} × 4 horas</span><span>R$ {listing.price * 4}</span></div>
            <div className="mp-res-fee"><span>Taxa de serviço</span><span>R$ 8</span></div>
            <div className="mp-res-total"><span>Total</span><span>R$ {listing.price * 4 + 8}</span></div>
          </aside>
        </div>
      </div>
    </main>
  );
}

window.ListingDetail = ListingDetail;
window.Laurel = Laurel;
window.AmenityIcon = AmenityIcon;
