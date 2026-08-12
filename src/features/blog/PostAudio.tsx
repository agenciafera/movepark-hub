import * as React from "react";
import { Pause, Play, Stop } from "@phosphor-icons/react";
import { falasDe } from "./audio.logic";

/**
 * Ouvir o post, com a voz do próprio navegador (Web Speech API).
 *
 * Sem serviço de TTS e sem arquivo de áudio: nada é gerado, armazenado nem
 * cobrado por post, e funciona no acervo inteiro no dia em que sobe. O custo é a
 * voz, que é a do sistema e varia de aparelho para aparelho.
 *
 * Três armadilhas da API, todas tratadas aqui:
 *
 * 1. O Chrome corta a fala perto dos 15 segundos. Por isso o texto vai em falas
 *    curtas, quebradas em fim de frase, e um pulso chama `resume()` enquanto
 *    está falando.
 * 2. A lista de vozes carrega assíncrona, e no primeiro acesso costuma vir
 *    vazia. Daí o `voiceschanged`.
 * 3. A fala não morre com a página: sair do post sem `cancel()` deixa a voz
 *    lendo por cima da tela seguinte.
 *
 * O botão só aparece depois de o efeito confirmar suporte. Decidir isso na
 * renderização faria a árvore divergir do HTML assado no build.
 */
export function PostAudio({ texto }: { texto: string }) {
  const [suportado, setSuportado] = React.useState(false);
  const [estado, setEstado] = React.useState<"parado" | "falando" | "pausado">("parado");
  const vozRef = React.useRef<SpeechSynthesisVoice | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSuportado(true);

    const escolherVoz = () => {
      const vozes = window.speechSynthesis.getVoices();
      vozRef.current =
        vozes.find((v) => v.lang === "pt-BR") ?? vozes.find((v) => v.lang.startsWith("pt")) ?? null;
    };
    escolherVoz();
    window.speechSynthesis.addEventListener("voiceschanged", escolherVoz);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", escolherVoz);
      window.speechSynthesis.cancel();
    };
  }, []);

  // Pulso contra o corte do Chrome. Só roda enquanto está falando.
  React.useEffect(() => {
    if (estado !== "falando") return;
    const t = window.setInterval(() => {
      const s = window.speechSynthesis;
      if (s.speaking && !s.paused) s.resume();
    }, 10_000);
    return () => window.clearInterval(t);
  }, [estado]);

  if (!suportado) return null;

  const tocar = () => {
    const s = window.speechSynthesis;
    s.cancel();

    const falas = falasDe(texto);
    falas.forEach((trecho, i) => {
      const u = new SpeechSynthesisUtterance(trecho);
      u.lang = "pt-BR";
      if (vozRef.current) u.voice = vozRef.current;
      u.rate = 1;
      // Só a última avisa que terminou, senão o botão volta a "ouvir" no meio.
      if (i === falas.length - 1) u.onend = () => setEstado("parado");
      s.speak(u);
    });
    setEstado("falando");
  };

  const alternar = () => {
    const s = window.speechSynthesis;
    if (estado === "falando") {
      s.pause();
      setEstado("pausado");
      return;
    }
    if (estado === "pausado") {
      s.resume();
      setEstado("falando");
      return;
    }
    tocar();
  };

  const parar = () => {
    window.speechSynthesis.cancel();
    setEstado("parado");
  };

  const rotulo =
    estado === "falando" ? "Pausar a leitura" : estado === "pausado" ? "Continuar" : "Ouvir o post";

  return (
    <div className="flex items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={alternar}
        aria-label={rotulo}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-hairline px-4 text-caption-sm font-semibold text-ink transition-colors hover:border-mp-navy hover:bg-surface-soft"
      >
        {estado === "falando" ? (
          <Pause className="h-4 w-4" weight="fill" aria-hidden />
        ) : (
          <Play className="h-4 w-4" weight="fill" aria-hidden />
        )}
        {rotulo}
      </button>

      {estado !== "parado" && (
        <button
          type="button"
          onClick={parar}
          aria-label="Parar a leitura"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-muted transition-colors hover:border-mp-navy hover:text-ink"
        >
          <Stop className="h-4 w-4" weight="fill" aria-hidden />
        </button>
      )}
    </div>
  );
}
