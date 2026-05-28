import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        desktop: "1280px",
      },
    },
    screens: {
      tablet: "744px",
      desktop: "1128px",
    },
    extend: {
      colors: {
        // Brand
        "mp-navy": "hsl(var(--mp-navy))",
        "mp-indigo": "hsl(var(--mp-indigo))",
        "mp-violet": "hsl(var(--mp-violet))",
        "mp-pale": "hsl(var(--mp-pale))",
        "mp-teal": "hsl(var(--mp-teal))",
        "mp-red": "hsl(var(--mp-red))",
        "mp-red-deep": "hsl(var(--mp-red-deep))",

        // Primary semantic aliases (CTA red)
        "mp-primary": "hsl(var(--mp-primary))",
        "mp-primary-active": "hsl(var(--mp-primary-active))",
        "mp-primary-disabled": "hsl(var(--mp-primary-disabled))",

        // Surface
        canvas: "hsl(var(--canvas))",
        "surface-soft": "hsl(var(--surface-soft))",
        "surface-strong": "hsl(var(--surface-strong))",
        "surface-pale": "hsl(var(--surface-pale))",

        // Hairlines & borders
        hairline: "hsl(var(--hairline))",
        "hairline-soft": "hsl(var(--hairline-soft))",
        "border-strong": "hsl(var(--border-strong))",

        // Text (ink = navy)
        ink: "hsl(var(--ink))",
        body: "hsl(var(--body))",
        muted: "hsl(var(--muted))",
        "muted-soft": "hsl(var(--muted-soft))",
        "muted-steel": "hsl(var(--muted-steel))",
        "on-primary": "hsl(var(--on-primary))",

        // Semantic
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        error: "hsl(var(--error))",
        info: "hsl(var(--info))",

        // Status badge tokens
        "badge-confirmed-bg": "hsl(var(--badge-confirmed-bg))",
        "badge-confirmed-fg": "hsl(var(--badge-confirmed-fg))",
        "badge-active-bg": "hsl(var(--badge-active-bg))",
        "badge-active-fg": "hsl(var(--badge-active-fg))",
        "badge-pending-bg": "hsl(var(--badge-pending-bg))",
        "badge-pending-fg": "hsl(var(--badge-pending-fg))",
        "badge-completed-bg": "hsl(var(--badge-completed-bg))",
        "badge-completed-fg": "hsl(var(--badge-completed-fg))",
        "badge-cancelled-bg": "hsl(var(--badge-cancelled-bg))",
        "badge-cancelled-fg": "hsl(var(--badge-cancelled-fg))",

        // shadcn aliases mapped so primitives keep working
        border: "hsl(var(--hairline))",
        input: "hsl(var(--hairline))",
        ring: "hsl(var(--ink))",
        background: "hsl(var(--canvas))",
        foreground: "hsl(var(--ink))",
        primary: {
          DEFAULT: "hsl(var(--mp-primary))",
          foreground: "hsl(var(--on-primary))",
        },
        secondary: {
          DEFAULT: "hsl(var(--surface-soft))",
          foreground: "hsl(var(--ink))",
        },
        destructive: {
          DEFAULT: "hsl(var(--error))",
          foreground: "hsl(var(--on-primary))",
        },
        accent: {
          DEFAULT: "hsl(var(--surface-soft))",
          foreground: "hsl(var(--ink))",
        },
        popover: {
          DEFAULT: "hsl(var(--canvas))",
          foreground: "hsl(var(--ink))",
        },
        card: {
          DEFAULT: "hsl(var(--canvas))",
          foreground: "hsl(var(--ink))",
        },
      },
      fontFamily: {
        sans: [
          "Roboto",
          "-apple-system",
          "system-ui",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        xs: "4px",
        sm: "8px",
        md: "14px",
        lg: "20px",
        xl: "32px",
        full: "9999px",
      },
      boxShadow: {
        // Navy-tinted shadow — Movepark single elevation tier
        tier:
          "0 0 0 1px rgba(41,38,63,0.04), 0 2px 6px 0 rgba(41,38,63,0.06), 0 4px 12px 0 rgba(41,38,63,0.10)",
        "focus-ring": "0 0 0 2px hsl(var(--mp-navy))",
      },
      fontSize: {
        "rating-display": ["64px", { lineHeight: "1.05", fontWeight: "900", letterSpacing: "-1.5px" }],
        "display-xl": ["28px", { lineHeight: "1.32", fontWeight: "700", letterSpacing: "-0.2px" }],
        "display-lg": ["22px", { lineHeight: "1.20", fontWeight: "500", letterSpacing: "-0.3px" }],
        "display-md": ["21px", { lineHeight: "1.40", fontWeight: "700" }],
        "display-sm": ["20px", { lineHeight: "1.22", fontWeight: "600", letterSpacing: "-0.15px" }],
        "title-md": ["16px", { lineHeight: "1.25", fontWeight: "600" }],
        "title-sm": ["16px", { lineHeight: "1.25", fontWeight: "500" }],
        "body-md": ["16px", { lineHeight: "1.50", fontWeight: "400" }],
        "body-sm": ["14px", { lineHeight: "1.43", fontWeight: "400" }],
        caption: ["14px", { lineHeight: "1.29", fontWeight: "500" }],
        "caption-sm": ["13px", { lineHeight: "1.23", fontWeight: "400" }],
        badge: ["11px", { lineHeight: "1.18", fontWeight: "700", letterSpacing: "0.1px" }],
        "micro-label": ["12px", { lineHeight: "1.33", fontWeight: "700" }],
        "uppercase-tag": ["8px", { lineHeight: "1.25", fontWeight: "900", letterSpacing: "0.4px" }],
        "button-md": ["16px", { lineHeight: "1.25", fontWeight: "500" }],
        "button-sm": ["14px", { lineHeight: "1.29", fontWeight: "500" }],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0.2, 0, 0, 1)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "200ms",
        slow: "320ms",
      },
    },
  },
  plugins: [animate],
};

export default config;
