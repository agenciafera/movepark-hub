import * as React from "react";
import { DayPicker } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  components,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      locale={ptBR}
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col tablet:flex-row gap-4",
        month: "space-y-3",
        caption: "flex items-center justify-center pt-1 relative",
        caption_label: "text-title-md text-ink",
        nav: "flex items-center gap-1 absolute inset-x-0 justify-between px-1",
        nav_button: cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "h-8 w-8 p-0",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell: "w-10 h-8 text-caption text-muted",
        row: "flex w-full mt-1",
        cell: "w-10 h-10 text-center relative",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-10 w-10 p-0 rounded-full text-body-sm font-normal aria-selected:opacity-100",
        ),
        day_selected:
          "bg-ink text-white hover:bg-ink hover:!text-white focus:bg-ink focus:!text-white",
        day_today: "ring-1 ring-mp-navy",
        day_outside: "text-muted-soft",
        day_disabled: "text-muted-soft opacity-50",
        // Range (mode="range"): pontas em violeta (cor de seleção da marca), miolo em violeta
        // suave com texto ink. `!` vence o `day_selected` (bg-ink/text-white), que também incide
        // nos dias do intervalo — sem isso o texto ficava branco em fundo claro (dias "sumiam").
        day_range_start:
          "rounded-l-full !rounded-r-none !bg-mp-primary !text-white hover:!bg-mp-primary-active",
        day_range_end:
          "rounded-r-full !rounded-l-none !bg-mp-primary !text-white hover:!bg-mp-primary-active",
        day_range_middle:
          "!rounded-none !bg-mp-pale !text-ink hover:!bg-mp-pale",
        day_hidden: "invisible",
        ...classNames,
      }}
      // Mescla em vez de substituir: quem passa `components` (ex: DayContent, pra dar
      // rótulo acessível aos dias) não deve perder os ícones de navegação junto.
      components={{
        IconLeft: () => <ChevronLeft className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
        ...components,
      }}
      {...props}
    />
  );
}

export { Calendar };
