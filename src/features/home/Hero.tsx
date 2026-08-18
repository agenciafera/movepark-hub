import { useRef, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { gsap } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import { SearchBarPill } from "@/features/search/SearchBarPill";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { formatCompactCount } from "@/lib/format";
import { CLIPES, clipesPara, deveCarregarVideo, deveCruzar, proximoClipe } from "./heroVideo.logic";
import { useContagemAnimada } from "@/hooks/useContagemAnimada";
import { useClientesAtendidos } from "./api";

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function StarIcon() {
  return (
    <svg className="h-3 w-3 fill-yellow-400" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 text-mp-teal" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const trustPills = ["Cancelamento grátis", "Preço travado", "Estacionamentos verificados"];
const heroAvatars = [
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=64&q=80",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=64&q=80",
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=64&q=80",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=64&q=80",
];

export function Hero() {
  const [params] = useSearchParams();
  const sectionRef = useRef<HTMLElement>(null);
  const clientesAtendidos = useClientesAtendidos();
  /* O número sobe de zero na abertura. Parado, ele lê como enfeite; subindo, o
     olho para nele e a prova social é a primeira coisa que a página entrega. */
  const contagem = useContagemAnimada(clientesAtendidos);

  /*
    O vídeo só monta depois do primeiro efeito, e é esse atraso que protege o
    LCP: enquanto o navegador pinta o topo da home, o que existe na árvore é a
    foto, com a mesma prioridade de sempre. O vídeo entra por cima depois.
  */
  const [carregarVideo, setCarregarVideo] = useState(false);
  const [videoVisivel, setVideoVisivel] = useState(false);

  /*
    Qual clipe da sequência está no ar.

    O índice mora num ref além do estado porque `timeupdate` dispara umas quatro
    vezes por segundo: sem uma trava lida na hora, os disparos que chegam entre a
    troca e o re-render passariam todos pela mesma condição e pulariam clipe. É a
    mesma armadilha do `useHeaderOculto`, e a saída é a mesma: decidir sobre o
    ref, e deixar o estado só para pintar.
  */
  const [clipeAtivo, setClipeAtivo] = useState(0);
  const indiceRef = useRef(0);
  const clipesRef = useRef<(HTMLVideoElement | null)[]>([]);

  /*
    Os clipes 2 e 3 só entram na árvore depois que o primeiro consegue tocar.

    Montar os três de uma vez colocaria três downloads competindo entre si logo
    na abertura da home, e o que o usuário precisa ver primeiro é justamente o
    primeiro. Como cada clipe dura 5s, sobra tempo de sobra para os outros
    chegarem antes da vez deles.
  */
  const [carregarResto, setCarregarResto] = useState(false);

  /* Deitado no desktop, em pé no celular. Escolhido junto com o portão, na
     montagem, porque é a mesma decisão: o que vale a pena baixar aqui. */
  const [clipes, setClipes] = useState<readonly string[]>(CLIPES);

  useEffect(() => {
    const rede = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;

    // 1128 é o breakpoint `desktop` do Tailwind deste projeto.
    setClipes(clipesPara(window.matchMedia?.("(min-width: 1128px)").matches ?? true));

    setCarregarVideo(
      deveCarregarVideo({
        movimentoReduzido: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
        economiaDeDados: rede?.saveData,
        tipoDeRede: rede?.effectiveType,
      }),
    );
  }, []);

  useEffect(() => {
    /*
      Lido direto do `matchMedia`, e não pelo `usePrefersReducedMotion`.

      O hook começa em `false` para casar com o HTML do SSG, então na primeira
      passada a timeline já teria zerado a opacidade do H1 antes de o estado
      virar. Quem pediu menos movimento veria o texto piscar, que é exatamente
      o que a preferência existe para evitar. É o mesmo padrão da
      `DestinationsGallery`.
    */
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay: 0.1 });
      tl.fromTo('[data-hero="badge"]', { opacity: 0, y: -14 },
          { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" })
        .fromTo('[data-hero="h1"]', { opacity: 0, y: 38 },
          { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, "-=0.3")
        .fromTo('[data-hero="sub"]', { opacity: 0, y: 22 },
          { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, "-=0.5")
        .fromTo('[data-hero="search"]', { opacity: 0, y: 22, scale: 0.98 },
          { opacity: 1, y: 0, scale: 1, duration: 0.65, ease: "power2.out" }, "-=0.45")
        .fromTo('[data-hero="trust"] > *', { opacity: 0 },
          { opacity: 1, duration: 0.45, stagger: 0.1, ease: "power1.out" }, "-=0.35");
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  /*
    Acende o próximo clipe por cima do atual.

    `exigirPronto` separa os dois gatilhos. No `timeupdate` a troca é adiantada
    para o cruzamento acontecer, e aí o próximo precisa ter quadro na mão, senão
    o crossfade revelaria um retângulo vazio. No `ended` não dá para exigir nada:
    é a última chance, e travar ali deixaria o banner parado no último quadro
    para sempre.
  */
  const avancar = (de: number, exigirPronto: boolean) => {
    if (indiceRef.current !== de) return;

    const proximo = proximoClipe(de, clipes.length);
    const alvo = clipesRef.current[proximo];
    if (exigirPronto && (alvo?.readyState ?? 0) < 2) return;

    indiceRef.current = proximo;
    if (alvo) {
      alvo.currentTime = 0;
      void alvo.play().catch(() => {});
    }
    setClipeAtivo(proximo);
  };

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden"
      style={{ minHeight: "640px" }}
    >
      {/*
        Foto de fundo: estacionamento coberto na luz do fim da tarde.

        Ela é o LCP da home e fica na página o tempo todo, mesmo quando o vídeo
        entra por cima. É o que segura o banner quando o vídeo não carrega, seja
        por rede ruim, por economia de dados ou por erro no arquivo.

        O enquadramento muda abaixo do desktop, e o motivo é geometria. O quadro
        é 2,3:1 e a seção no celular fica mais alta que larga, então o
        `object-cover` corta 41% de cada lado e sobram 17% da largura. Centrado,
        essa fatia cai na lataria escura do carro e o banner vira um borrão sem
        leitura. Em 75% ela cai na pessoa e no vão do estacionamento, que é o que
        a foto precisa dizer. O mesmo valor vale para o vídeo, senão a troca de
        um para o outro daria um salto de enquadramento.
      */}
      <img
        src="/images/hero-image.webp"
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-[75%_center] desktop:object-center"
      />

      {/*
        O mesmo banner em movimento, por cima da foto.

        `muted` e `playsInline` não são preferência: sem os dois o iOS recusa o
        autoplay e o banner congela no primeiro quadro. Aparece só depois do
        `canPlay` para não trocar a foto por um retângulo preto enquanto baixa.

        Sem controle nenhum e fora da ordem de tabulação: é papel de parede, e um
        vídeo focável no topo da home colocaria um pouso morto antes da busca.

        O `brightness` está medido, não é gosto. O movimento da câmera traz a
        janela clara do fundo para trás do selo de prova social, e ali o vídeo
        fica mais claro que a foto: o selo é branco sobre branco e some. Os dois
        gradientes seguram o H1, mas não aquele bloco, que é pequeno e mora na
        parte mais fraca do gradiente. Corrigir no vídeo, e não no overlay, deixa
        o banner intacto para quem cai na foto.
      */}
      {carregarVideo &&
        clipes.map((src, i) => {
          // O primeiro abre a sequência; os outros esperam a vez.
          const primeiro = i === 0;
          if (!primeiro && !carregarResto) return null;

          return (
            <video
              key={src}
              ref={(el) => {
                clipesRef.current[i] = el;
              }}
              src={src}
              autoPlay={primeiro}
              muted
              playsInline
              preload={primeiro ? "auto" : "metadata"}
              aria-hidden="true"
              tabIndex={-1}
              onCanPlay={
                primeiro
                  ? () => {
                      setVideoVisivel(true);
                      setCarregarResto(true);
                    }
                  : undefined
              }
              onTimeUpdate={(e) => {
                const el = e.currentTarget;
                if (deveCruzar(el.currentTime, el.duration)) avancar(i, true);
              }}
              onEnded={() => avancar(i, false)}
              /* Centrado nos dois: no celular o clipe já é vertical e o corte é
                 pequeno, e no desktop o quadro deitado aparece quase inteiro.
                 O deslocamento de 75% que existia aqui era muleta de quando o
                 quadro deitado tinha que caber na tela em pé, e a foto ainda
                 precisa dele porque continua deitada. */
              className={cn(
                "absolute inset-0 h-full w-full object-cover object-center brightness-[0.82] saturate-[1.05] transition-opacity duration-700 motion-reduce:transition-none",
                videoVisivel && clipeAtivo === i ? "opacity-100" : "opacity-0",
              )}
            />
          );
        })}

      {/* Overlay em camadas: gradiente direcional + vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(ellipse 110% 100% at 50% 50%, transparent 35%, rgba(8,10,28,0.50) 100%)",
            "linear-gradient(to bottom, rgba(8,10,28,0.60) 0%, rgba(8,10,28,0.50) 30%, rgba(8,10,28,0.62) 65%, rgba(8,10,28,0.82) 100%)",
          ].join(", "),
        }}
        aria-hidden="true"
      />

      {/* Acento violeta suave — identidade de marca */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 20%, hsla(239, 70%, 60%, 0.14) 0%, transparent 65%)",
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center justify-center px-6 pb-20 pt-32 text-center desktop:px-8 desktop:pb-24">
        {/*
          Prova social.

          Sem a pílula de vidro que existia aqui. Ela parecia proteger a leitura
          sobre o vídeo, e media o contrário: o véu branco clareia o fundo atrás
          de texto branco e derrubava o contraste de 14,4:1 para 7:1. Quem segura
          a legibilidade são os dois gradientes da seção, que já estão no lugar.
          Tirada a pílula, o número também deixa de ser um chip e pode crescer.

          `display-xl` (28px) contra o `display-3xl` do H1, que vai a 56px: o
          número ganha peso sem disputar a manchete.
        */}
        <div
          data-hero="badge"
          /* Empilhado e centrado no celular, em linha no desktop. Em linha numa
             tela de 375 o número era espremido até quebrar em "+300 / mil", e as
             estrelas iam parar longe dele, na outra ponta. */
          className="mb-8 flex flex-col items-center gap-3 desktop:flex-row desktop:justify-center desktop:gap-4"
        >
          <div className="flex -space-x-2">
            {heroAvatars.map((src) => (
              <Avatar key={src} className="h-9 w-9 ring-2 ring-white/25">
                <AvatarImage src={src} alt="Viajante" />
                <AvatarFallback>?</AvatarFallback>
              </Avatar>
            ))}
          </div>

          <div className="text-center desktop:text-left">
            <div className="flex items-center justify-center gap-2 desktop:justify-start">
              {/* O "+" existe porque a contagem arredonda para baixo. */}
              <span className="whitespace-nowrap text-display-xl tabular-nums text-white">
                +{formatCompactCount(contagem)}
              </span>
              <div className="flex gap-0.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <StarIcon key={i} />
                ))}
              </div>
            </div>
            <p className="text-body-sm text-white/75">clientes já reservaram com a Movepark</p>
          </div>
        </div>

        <h1
          data-hero="h1"
          className="mx-auto mb-5 max-w-3xl text-display-3xl text-white"
          style={{ textWrap: "balance" } as React.CSSProperties}
        >
          Estacione em qualquer aeroporto do Brasil
        </h1>

        {/* `mb-6` no celular: sem a barra de busca no meio, os 40px do desktop
            viravam um vão de 64px entre a linha de apoio e os selos. */}
        <p
          data-hero="sub"
          className="mx-auto mb-6 max-w-xl text-pretty text-[17px] leading-relaxed text-white/65 desktop:mb-10"
        >
          Compare vários estacionamentos num só lugar e reserve agora.
        </p>

        {/*
          A barra grande é do desktop, onde ela é uma linha de 72px sobre um
          banner deitado e sobra vídeo dos dois lados.

          Abaixo de 1128 os campos empilham e ela vira um cartão de quatro
          linhas: eram uns 300px de branco no meio do banner, e o vídeo que
          justifica o topo da home aparecia em tiras. A busca de lá é o atalho do
          header, que é fixo, nasce visível na home e abre a mesma busca por cima
          da página. Uma busca por tela, e o banner de volta ao vídeo.
        */}
        <div data-hero="search" className="mx-auto hidden w-full desktop:block">
          <SearchBarPill
            initialDest={params.get("dest")}
            initialFrom={parseDate(params.get("from"))}
            initialTo={parseDate(params.get("to"))}
            className="mx-auto w-full"
          />
        </div>

        {/* Trust pills */}
        <div
          data-hero="trust"
          className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
        >
          {trustPills.map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 text-[13px] text-white/70"
            >
              <CheckIcon />
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
