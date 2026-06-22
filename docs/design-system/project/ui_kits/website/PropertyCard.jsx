/* PropertyCard.jsx — card foto-first com dots de carrossel,
   badge "Destaque", estado salvo com coração e 4 linhas de meta.
   Descreve vagas de estacionamento.
*/

const { useState: useStatePC } = React;

function HeartIcon({ filled }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24"
         fill={filled ? "var(--colors-primary)" : "rgba(0,0,0,0.4)"}
         stroke="#fff" strokeWidth="2">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"></path>
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  );
}

function PropertyCard({ listing, onOpen, saved, onToggleSave }) {
  const [photoIdx, setPhotoIdx] = useStatePC(0);
  const photos = listing.photos || [listing.photo];
  return (
    <article className="mp-card" onClick={() => onOpen && onOpen(listing)}>
      <div
        className="mp-card-photo"
        style={listing.gradient ? { background: listing.gradient } : null}
      >
        {photos[photoIdx] ? <img src={photos[photoIdx]} alt={listing.title} /> : null}
        {listing.favorite ? <div className="mp-card-fav">Destaque</div> : null}
        <button
          className={`mp-card-heart ${saved ? "is-saved" : ""}`}
          onClick={e => { e.stopPropagation(); onToggleSave && onToggleSave(listing.id); }}
          aria-label="Salvar"
        >
          <HeartIcon filled={saved} />
        </button>
        {photos.length > 1 ? (
          <div className="mp-card-dots">
            {photos.map((_, i) => (
              <span key={i} className={`mp-card-dot ${i === photoIdx ? "is-active" : ""}`}></span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mp-card-meta">
        <div className="mp-card-title-row">
          <div className="mp-card-title">{listing.title}</div>
          <div className="mp-card-rating"><StarIcon /> {listing.rating}</div>
        </div>
        <div className="mp-card-sub">{listing.host}</div>
        <div className="mp-card-sub">{listing.meta}</div>
        <div className="mp-card-price"><b>R$ {listing.price}</b> / hora</div>
      </div>
    </article>
  );
}

window.PropertyCard = PropertyCard;
window.HeartIcon = HeartIcon;
window.StarIcon = StarIcon;
