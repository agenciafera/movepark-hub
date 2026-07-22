import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { BottomNav } from "./BottomNav";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { OperatorJourneyBanner } from "./OperatorJourneyBanner";
import { CommandPalette } from "@/features/command-palette/CommandPalette";
import { useCommandPalette } from "@/features/command-palette/useCommandPalette";

type Props = {
  variant: "manager" | "operator";
  brandTitle?: string;
  topbarRightSlot?: React.ReactNode;
};

export function AppShell({ variant, brandTitle, topbarRightSlot }: Props) {
  const palette = useCommandPalette();

  return (
    <div className="flex h-screen w-full bg-canvas">
      <CommandPalette variant={variant} open={palette.open} onOpenChange={palette.setOpen} />
      <Sidebar variant={variant} brandTitle={brandTitle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar rightSlot={topbarRightSlot} onOpenSearch={() => palette.setOpen(true)} />
        {variant === "operator" && <ImpersonationBanner />}
        <main data-scroll-root className="flex-1 overflow-auto pb-[var(--bottom-nav-space)] tablet:pb-0">
          <div className="mx-auto w-full max-w-[1280px] px-4 py-6 desktop:px-8">
            {variant === "operator" && <OperatorJourneyBanner />}
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav variant={variant} />
    </div>
  );
}
