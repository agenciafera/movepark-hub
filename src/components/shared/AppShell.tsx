import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { BottomNav } from "./BottomNav";
import { OperatorJourneyBanner } from "./OperatorJourneyBanner";
import { CommandPalette } from "@/features/command-palette/CommandPalette";
import { useCommandPalette } from "@/features/command-palette/useCommandPalette";

type Props = {
  variant: "manager" | "operator";
  brandTitle?: string;
  topbarRightSlot?: React.ReactNode;
};

/**
 * Shell dos painéis (Dashboard Manager/Operador v2): a página ganha fundo próprio
 * e respiro de 20px, e a sidebar flutua como card navy arredondado em vez de colar
 * na borda. A topbar perde a régua e vira uma fila de pílulas soltas.
 *
 * O `main` continua sendo o container de rolagem, e não a janela: a sidebar
 * `sticky` do arquivo de design exigiria scroll no documento, e é o scroll no
 * documento que trouxe o bug do segundo scroll (ver o comentário do `relative`
 * abaixo). Com a coluna em `h-screen` o efeito visual é o mesmo.
 *
 * O aviso de impersonation saiu daqui: virou card no rodapé da sidebar, que é
 * onde o design põe o "Modo operador".
 */
export function AppShell({ variant, brandTitle, topbarRightSlot }: Props) {
  const palette = useCommandPalette();

  return (
    <div className="bg-panel flex h-screen w-full gap-5 tablet:p-5">
      <CommandPalette variant={variant} open={palette.open} onOpenChange={palette.setOpen} />
      <Sidebar variant={variant} brandTitle={brandTitle} />
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <Topbar rightSlot={topbarRightSlot} onOpenSearch={() => palette.setOpen(true)} />
        {/* `relative`: o main é o scroll container. Sem posição, descendentes
            `position: absolute` (o input escondido do Radix Checkbox/Switch, spans
            sr-only) ancoram no viewport em vez do main, e a posição estática deles
            no fim de um form longo estende o scroll do documento além da viewport.
            Efeito: a janela ganha um segundo scroll e o layout sobe deixando um
            vão branco. Com `relative`, esses absolutos ficam contidos no main. */}
        <main
          data-scroll-root
          className="relative flex-1 overflow-auto pb-[var(--bottom-nav-space)] tablet:pb-0"
        >
          <div className="mx-auto w-full max-w-[1280px] px-4 pb-6 tablet:px-1">
            {variant === "operator" && <OperatorJourneyBanner />}
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav variant={variant} />
    </div>
  );
}
