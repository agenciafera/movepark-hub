import { Outlet } from "react-router-dom";
import { ConsumerTopbar } from "./ConsumerTopbar";
import { ConsumerBottomNav } from "./ConsumerBottomNav";
import { ConsumerFooter } from "./ConsumerFooter";

export function ConsumerAppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <ConsumerTopbar />
      <main className="flex-1 pb-16 tablet:pb-0">
        <Outlet />
      </main>
      <ConsumerFooter />
      <ConsumerBottomNav />
    </div>
  );
}
