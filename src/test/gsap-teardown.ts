// O ScrollTrigger do GSAP liga um `setInterval(_sync, 250)` ao ser registrado, e o `_sync` chama
// `requestAnimationFrame` pelo nome global. Quando o arquivo de teste acaba, o happy-dom é
// desmontado e esse global some, mas o intervalo continua vivo até o worker morrer. Se ele dispara
// nessa janela, o Vitest registra "ReferenceError: requestAnimationFrame is not defined" como erro
// solto e reprova o job com todos os testes verdes. Era corrida, e por isso caía cada vez num
// arquivo diferente (`seja-parceiro`, `como-funciona`) e passava na reexecução.
//
// `gsapVersions` é o carimbo que o core do GSAP deixa no `window` ao carregar: só quem de fato
// importou o GSAP paga o import abaixo, que já está em cache no grafo do arquivo.
export async function disableScrollTriggerIfLoaded(): Promise<void> {
  if (!(globalThis as { gsapVersions?: string[] }).gsapVersions) return;
  const { ScrollTrigger } = await import("@/lib/gsap");
  ScrollTrigger.disable();
}
