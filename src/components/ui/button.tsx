import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-mp-primary !text-white hover:bg-mp-primary-active disabled:bg-mp-primary-disabled",
        secondary: "bg-surface-strong text-ink hover:brightness-95",
        ghost: "bg-transparent text-ink underline underline-offset-4 hover:text-mp-primary",
        danger: "bg-error !text-white hover:opacity-90",
        pill: "bg-mp-primary !text-white rounded-full px-4 h-9 text-button-sm hover:bg-mp-primary-active",
        outline: "border border-hairline bg-surface-strong text-ink hover:brightness-95",
        /*
          O outline de verdade, para faixa violeta e hero navy: só borda, sem
          preenchimento. O `outline` acima é o de superfície clara e tem fundo
          cinza, então não serve sobre cor.

          Existia copiado à mão em três lugares (`sobre`, `como-funciona` e a
          faixa do rodapé), sempre como `variant="secondary"` mais quatro
          classes, duas delas só para desligar o que o secondary trazia
          (`hover:brightness-95` e o sublinhado). Cada cópia tinha a sua opacidade
          de borda, e a faixa do rodapé nem chegou a ganhar uma: saiu com botão
          branco cheio, competindo com o violeta em vez de assentar nele.

          A borda é `white/50` e não branca cheia: cheia ela vira um segundo botão
          primário e rouba a leitura do texto ao lado. O `!text-white` acompanha o
          `!` do primary, senão o `text-ink` de um `asChild` vence na cascata.
        */
        outlineInverse:
          "border border-white/50 bg-transparent !text-white no-underline hover:bg-white/10",
      },
      size: {
        default: "h-12 px-6 text-button-md",
        sm: "h-9 px-4 text-button-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
