import * as React from "react";
import {
  Bell,
  Calendar,
  Car,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Globe,
  Heart,
  Home,
  Info,
  MapPin,
  QrCode,
  Search,
  Shield,
  Star,
  TriangleAlert,
  X,
} from "@/lib/icons";
import { Wordmark, Monogram } from "@/components/shared/Brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ColorChip = {
  name: string;
  hex: string;
  token?: string;
  role?: string;
};

const brandColors: ColorChip[] = [
  { name: "Navy", hex: "#29263F", token: "--mp-navy", role: "Ink, headlines" },
  { name: "Indigo", hex: "#4041A3", token: "--mp-indigo", role: "Secondary brand" },
  { name: "Violet", hex: "#5D5FEF", token: "--mp-violet", role: "Primary CTA" },
  { name: "Pale", hex: "#E4F2FF", token: "--mp-pale", role: "Brand surface" },
  { name: "Red", hex: "#DA455E", token: "--mp-red", role: "Brand accent" },
  { name: "Red Deep", hex: "#AE374B", token: "--mp-red-deep", role: "Monogram shadow" },
  { name: "Teal", hex: "#A6DBDF", token: "--mp-teal", role: "Monogram stripe" },
];

const neutralColors: ColorChip[] = [
  { name: "White", hex: "#FFFFFF", role: "Canvas" },
  { name: "Surface soft", hex: "#F7F7F8", role: "Page background" },
  { name: "Gray 200", hex: "#E0E0E0", role: "Hairline" },
  { name: "Steel 100", hex: "#E0E5F2", role: "Subtle surface" },
  { name: "Steel 500", hex: "#818FAF", role: "Strong stroke" },
  { name: "Gray 800", hex: "#424242", role: "Body text" },
];

const textColors: ColorChip[] = [
  { name: "Ink", hex: "#29263F", role: "Headlines · body" },
  { name: "Body", hex: "#424242", role: "Long-form copy" },
  { name: "Muted", hex: "#6A6A6A", role: "Sub-labels" },
  { name: "Steel", hex: "#818FAF", role: "Muted brand" },
];

const semanticColors: ColorChip[] = [
  { name: "Error", hex: "#C13515" },
  { name: "Warning", hex: "#B96A00" },
  { name: "Success", hex: "#1F7A4D" },
  { name: "Info", hex: "#4041A3" },
];

const sections = [
  { id: "brand", label: "Marca" },
  { id: "colors", label: "Cores" },
  { id: "typography", label: "Tipografia" },
  { id: "spacing", label: "Espaçamento" },
  { id: "radii", label: "Raios" },
  { id: "elevation", label: "Elevação" },
  { id: "components", label: "Componentes" },
  { id: "iconography", label: "Iconografia" },
  { id: "rules", label: "Regras de marca" },
];

function Token({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-surface-soft px-1.5 py-0.5 font-mono text-[11px] text-muted">
      {children}
    </code>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-1">
      {eyebrow && (
        <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-muted-steel">
          {eyebrow}
        </span>
      )}
      <h2 className="text-display-md text-ink">{title}</h2>
      {description && (
        <p className="max-w-2xl text-body-sm text-muted">{description}</p>
      )}
    </div>
  );
}

function Specimen({
  title,
  children,
  caption,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  caption?: string;
  className?: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-hairline bg-canvas">
      {title && (
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <span className="text-caption text-ink">{title}</span>
          {caption && (
            <span className="font-mono text-[11px] text-muted">{caption}</span>
          )}
        </div>
      )}
      <div className={"p-6 " + className}>{children}</div>
    </div>
  );
}

function Swatch({ chip, square = false }: { chip: ColorChip; square?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        style={{ background: chip.hex }}
        className={
          "h-[76px] w-full " +
          (square ? "rounded-sm" : "rounded-md") +
          " ring-1 ring-inset ring-black/[0.06]"
        }
      />
      <div className="flex flex-col gap-0.5">
        <span className="text-caption text-ink">{chip.name}</span>
        <span className="font-mono text-[11px] text-muted">{chip.hex}</span>
        {chip.token && (
          <span className="font-mono text-[10px] text-muted-soft">
            {chip.token}
          </span>
        )}
        {chip.role && (
          <span className="text-[11px] text-muted-steel">{chip.role}</span>
        )}
      </div>
    </div>
  );
}

function TextSwatch({ chip }: { chip: ColorChip }) {
  return (
    <div className="flex items-center gap-3">
      <div
        style={{ background: chip.hex }}
        className="h-12 w-12 shrink-0 rounded-sm ring-1 ring-inset ring-black/[0.08]"
      />
      <div className="flex flex-col gap-0.5">
        <span className="text-caption text-ink">{chip.name}</span>
        <span className="font-mono text-[11px] text-muted">{chip.hex}</span>
        {chip.role && (
          <span className="text-[11px] text-muted-steel">{chip.role}</span>
        )}
      </div>
    </div>
  );
}

function PillSwatch({ chip }: { chip: ColorChip }) {
  return (
    <div className="flex items-center gap-3">
      <div
        style={{ background: chip.hex }}
        className="h-11 w-11 shrink-0 rounded-full ring-1 ring-inset ring-black/[0.1]"
      />
      <div className="flex flex-col gap-0.5">
        <span className="text-caption text-ink">{chip.name}</span>
        <span className="font-mono text-[11px] text-muted">{chip.hex}</span>
      </div>
    </div>
  );
}

function NavStub() {
  return (
    <div className="overflow-hidden rounded-md border border-hairline bg-canvas">
      <div className="flex h-20 items-center justify-between border-b border-hairline px-8">
        <Wordmark height={28} />
        <div className="flex gap-8">
          <NavTab active label="Vagas" icon={<Home className="h-5 w-5" />} />
          <NavTab
            label="Mensal"
            icon={<Calendar className="h-5 w-5" />}
            badge="NEW"
          />
          <NavTab label="Serviços" icon={<Globe className="h-5 w-5" />} badge="NEW" />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-caption text-ink">Seja um operador</span>
          <Globe className="h-5 w-5 text-ink" />
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-mp-navy text-[13px] font-semibold text-on-primary">
            A
          </div>
        </div>
      </div>
    </div>
  );
}

function NavTab({
  label,
  icon,
  active = false,
  badge,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  badge?: string;
}) {
  return (
    <div className="relative flex flex-col items-center gap-1 px-1 py-2">
      <span className={active ? "text-ink" : "text-muted"}>{icon}</span>
      <span
        className={
          "text-caption " + (active ? "text-ink" : "text-muted")
        }
      >
        {label}
      </span>
      {active && (
        <span className="absolute -bottom-1 left-2 right-2 h-0.5 rounded bg-ink" />
      )}
      {badge && (
        <span className="absolute -right-3 top-0 rounded-full bg-mp-primary px-1.5 py-[2px] text-[8px] font-black uppercase tracking-[0.4px] text-on-primary">
          {badge}
        </span>
      )}
    </div>
  );
}

function PropertyCard({
  background,
  title,
  host,
  meta,
  price,
  rating,
  favorite,
  saved = false,
}: {
  background: string;
  title: string;
  host: string;
  meta: string;
  price: string;
  rating: string;
  favorite?: boolean;
  saved?: boolean;
}) {
  return (
    <div className="w-[220px]">
      <div
        className="relative aspect-square overflow-hidden rounded-md"
        style={{ background }}
      >
        {favorite && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-canvas px-2.5 py-1 text-[11px] font-bold text-ink shadow-tier">
            Destaque
          </span>
        )}
        <div className="absolute right-2.5 top-2.5">
          <Heart
            className="h-5 w-5"
            stroke="#fff"
            strokeWidth={2}
            fill={saved ? "hsl(var(--mp-primary))" : "rgba(0,0,0,0.4)"}
          />
        </div>
      </div>
      <div className="flex flex-col gap-0.5 pt-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-semibold text-ink">{title}</span>
          <span className="flex items-center gap-0.5 text-[13px] text-ink">
            <Star className="h-3 w-3 fill-ink stroke-none" /> {rating}
          </span>
        </div>
        <span className="text-body-sm text-muted">{host}</span>
        <span className="text-body-sm text-muted">{meta}</span>
        <span className="mt-1 text-body-sm text-ink">
          <strong className="font-semibold">{price}</strong> / hora
        </span>
      </div>
    </div>
  );
}

function ReservationCard() {
  return (
    <div className="w-[360px] rounded-md bg-canvas p-6 shadow-tier">
      <div className="mb-4 flex items-baseline gap-2">
        <span className="text-display-lg text-ink">R$ 24</span>
        <span className="text-body-md text-muted">/ hora</span>
      </div>
      <div className="overflow-hidden rounded-sm ring-1 ring-inset ring-hairline">
        <div className="grid grid-cols-2">
          <div className="border-r border-hairline px-3 py-2.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.3px] text-ink">
              Chegada
            </div>
            <div className="mt-0.5 text-[13px] text-muted">27 mai · 14:00</div>
          </div>
          <div className="px-3 py-2.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.3px] text-ink">
              Saída
            </div>
            <div className="mt-0.5 text-[13px] text-muted">27 mai · 18:00</div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-sm px-3 py-2.5 ring-1 ring-inset ring-hairline">
        <span className="text-[13px] text-ink">Veículos</span>
        <span className="text-[13px] text-ink">1 carro</span>
      </div>
      <Button className="mt-4 w-full">Reservar</Button>
      <div className="mt-4 flex justify-between text-body-sm text-body">
        <span>R$ 24 × 4 horas</span>
        <span>R$ 96</span>
      </div>
      <div className="mt-2 flex justify-between text-body-sm text-body">
        <span>Taxa de serviço</span>
        <span>R$ 8</span>
      </div>
      <div className="mt-3 flex justify-between border-t border-hairline pt-3 text-[15px] font-semibold text-ink">
        <span>Total</span>
        <span>R$ 104</span>
      </div>
    </div>
  );
}

function DatePickerStub() {
  const days = [
    "26·m",
    "27·m",
    "28·m",
    "29·m",
    "30·m",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13·s",
    "14·r",
    "15·r",
    "16·s",
    "17",
    "18",
    "19",
    "20",
    "21",
    "22",
    "23",
    "24",
    "25",
    "26",
    "27",
    "28",
    "29",
    "30",
  ];
  return (
    <div className="w-[320px]">
      <div className="mb-3 flex items-center justify-between">
        <button className="flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-inset ring-hairline">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <div className="text-[15px] font-semibold text-ink">Maio 2026</div>
        <button className="flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-inset ring-hairline">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <div
            key={i}
            className="py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.2px] text-muted"
          >
            {d}
          </div>
        ))}
        {days.map((d, i) => {
          const [label, kind] = d.split("·");
          const muted = kind === "m";
          const selected = kind === "s";
          const range = kind === "r";
          return (
            <div
              key={i}
              className={
                "flex h-9 w-9 items-center justify-center text-[13px] " +
                (selected
                  ? "rounded-full bg-mp-navy text-on-primary"
                  : range
                    ? "bg-surface-soft text-ink"
                    : muted
                      ? "rounded-full text-muted-soft"
                      : "rounded-full text-ink")
              }
            >
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SearchPill() {
  return (
    <div className="inline-flex h-16 items-center rounded-full bg-canvas p-1 shadow-tier">
      <div className="flex flex-col justify-center border-r border-hairline px-5 py-2">
        <span className="text-[12px] font-bold tracking-[0.1px] text-ink">Onde</span>
        <span className="mt-0.5 text-body-sm text-muted">Buscar vagas</span>
      </div>
      <div className="flex flex-col justify-center border-r border-hairline px-5 py-2">
        <span className="text-[12px] font-bold tracking-[0.1px] text-ink">Quando</span>
        <span className="mt-0.5 text-body-sm text-muted">Adicionar data</span>
      </div>
      <div className="flex flex-col justify-center px-5 py-2">
        <span className="text-[12px] font-bold tracking-[0.1px] text-ink">Duração</span>
        <span className="mt-0.5 text-body-sm text-muted">Por quanto tempo</span>
      </div>
      <button className="ml-2 flex h-12 w-12 items-center justify-center rounded-full bg-mp-primary text-on-primary">
        <Search className="h-5 w-5" />
      </button>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* HERO */}
      <div className="bg-soft-gradient">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-6 py-12 desktop:px-10 desktop:py-16">
          <div className="flex items-center justify-between">
            <Wordmark height={28} />
            <a
              href="/login"
              className="rounded-full bg-canvas px-4 py-2 text-button-sm font-medium text-ink shadow-tier no-underline transition-colors hover:bg-surface-soft"
            >
              Voltar para o Hub
            </a>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-muted-steel">
              Movepark Design System · v1.0
            </span>
            <h1 className="max-w-3xl text-display-2xl text-ink desktop:text-display-3xl">
              Estacione com confiança. <br />A linguagem visual do Movepark.
            </h1>
            <p className="max-w-2xl text-body-md text-body">
              A identidade Movepark — navy{" "}
              <span className="font-mono text-ink">#29263F</span>, violet{" "}
              <span className="font-mono text-mp-primary">#5D5FEF</span> (CTA), indigo{" "}
              <span className="font-mono text-ink">#4041A3</span>, pale —
              sobre a linguagem estrutural de marketplaces de consumo (cards
              foto-first, busca em pílula, elevação suave, tipografia Inter em
              pesos moderados).
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Button>Reservar agora</Button>
              <Button variant="secondary">Salvar</Button>
              <Button variant="ghost">Ver mais</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1280px] gap-10 px-6 py-12 desktop:px-10">
        {/* SIDE NAV */}
        <aside className="sticky top-12 hidden h-fit w-48 shrink-0 tablet:block">
          <nav className="flex flex-col gap-1">
            {sections.map((s) => (
              <a
                key={s.id}
                href={"#" + s.id}
                className="rounded-sm px-3 py-2 text-body-sm text-muted no-underline transition-colors hover:bg-surface-soft hover:text-ink"
              >
                {s.label}
              </a>
            ))}
          </nav>
          <div className="mt-6 rounded-md border border-hairline bg-surface-soft p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.3px] text-muted-steel">
              Voz
            </p>
            <p className="mt-2 text-body-sm text-body">
              PT-BR, sentence case, verbos diretos. "Reservar agora", não "Reserve
              Now!".
            </p>
          </div>
        </aside>

        {/* CONTENT */}
        <div className="flex min-w-0 flex-1 flex-col gap-16">
          {/* BRAND */}
          <section id="brand">
            <SectionHeader
              eyebrow="Marca"
              title="Logo e monograma"
              description="O wordmark e o monograma do Movepark sobre superfícies claras, pale e navy. Nunca aplicar sobre fotos sem máscara."
            />
            <div className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
              <Specimen caption="white">
                <div className="flex h-32 items-center justify-center">
                  <Monogram size={84} />
                </div>
              </Specimen>
              <Specimen caption="pale">
                <div className="flex h-32 items-center justify-center bg-mp-pale">
                  <Monogram size={84} />
                </div>
              </Specimen>
              <Specimen caption="navy">
                <div className="flex h-32 items-center justify-center bg-mp-navy">
                  <Monogram size={84} />
                </div>
              </Specimen>
              <Specimen caption="wordmark · 28px" className="col-span-1 tablet:col-span-3">
                <div className="flex h-32 items-center justify-center">
                  <Wordmark height={56} />
                </div>
              </Specimen>
            </div>
          </section>

          {/* COLORS */}
          <section id="colors">
            <SectionHeader
              eyebrow="Foundations"
              title="Cores"
              description="A paleta Movepark parte do navy: violet (#5D5FEF) é o CTA principal, vermelho (#DA455E) é acento de marca. Tudo o mais é estrutural."
            />

            <h3 className="mb-3 text-display-sm text-ink">Marca</h3>
            <Specimen className="!p-6">
              <div className="grid grid-cols-2 gap-5 tablet:grid-cols-4 desktop:grid-cols-7">
                {brandColors.map((c) => (
                  <Swatch key={c.name} chip={c} />
                ))}
              </div>
            </Specimen>

            <h3 className="mb-3 mt-8 text-display-sm text-ink">Neutros</h3>
            <Specimen className="!p-6">
              <div className="grid grid-cols-2 gap-5 tablet:grid-cols-3 desktop:grid-cols-6">
                {neutralColors.map((c) => (
                  <Swatch key={c.name} chip={c} square />
                ))}
              </div>
            </Specimen>

            <div className="mt-8 grid grid-cols-1 gap-5 tablet:grid-cols-2">
              <div>
                <h3 className="mb-3 text-display-sm text-ink">Texto</h3>
                <Specimen className="!p-6">
                  <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
                    {textColors.map((c) => (
                      <TextSwatch key={c.name} chip={c} />
                    ))}
                  </div>
                </Specimen>
              </div>
              <div>
                <h3 className="mb-3 text-display-sm text-ink">Semânticas</h3>
                <Specimen className="!p-6">
                  <div className="grid grid-cols-2 gap-4">
                    {semanticColors.map((c) => (
                      <PillSwatch key={c.name} chip={c} />
                    ))}
                  </div>
                </Specimen>
              </div>
            </div>

            <h3 className="mb-3 mt-8 text-display-sm text-ink">Gradiente de marca</h3>
            <Specimen caption="editorial only · não usar em CTA">
              <div className="grid grid-cols-1 items-center gap-6 tablet:grid-cols-[1.4fr_1fr]">
                <div className="h-32 rounded-md bg-brand-gradient" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-caption text-ink">Brand gradient</span>
                  <pre className="font-mono text-[11px] leading-relaxed text-muted">
{`linear-gradient(135deg,
  #4041A3 0%,
  #5D5FEF 60%,
  #4041A3 100%)`}
                  </pre>
                  <span className="text-[12px] text-muted-steel">
                    Uso editorial — nunca em botões.
                  </span>
                </div>
              </div>
            </Specimen>
          </section>

          {/* TYPOGRAPHY */}
          <section id="typography">
            <SectionHeader
              eyebrow="Foundations"
              title="Tipografia"
              description="Inter em pesos moderados. O único momento alto da tipografia é o display de rating (64 / 900)."
            />

            <h3 className="mb-3 text-display-sm text-ink">Display</h3>
            <Specimen>
              <div className="flex flex-col gap-6">
                <TypeRow size="text-display-3xl" spec="display-3xl · 56 / 700 · -0.8px">
                  Estacione com confiança
                </TypeRow>
                <TypeRow size="text-display-2xl" spec="display-2xl · 44 / 700 · -0.5px">
                  Vagas perto de você, agora
                </TypeRow>
                <TypeRow size="text-display-xl" spec="display-xl · 28 / 700 · -0.2px">
                  KPI · R$ 84.210
                </TypeRow>
                <TypeRow size="text-display-lg" spec="display-lg · 22 / 500 · -0.3px">
                  Título de página
                </TypeRow>
                <TypeRow size="text-display-md" spec="display-md · 21 / 700">
                  O que esta vaga oferece
                </TypeRow>
                <TypeRow size="text-display-sm" spec="display-sm · 20 / 600 · -0.15px">
                  Coisas pra saber antes
                </TypeRow>
              </div>
            </Specimen>

            <h3 className="mb-3 mt-8 text-display-sm text-ink">Corpo</h3>
            <Specimen>
              <div className="flex flex-col gap-3">
                <TypeRow size="text-title-md text-ink" spec="title-md · 16 / 600">
                  Garagem coberta · Centro
                </TypeRow>
                <TypeRow size="text-title-sm text-ink" spec="title-sm · 16 / 500">
                  Suporte
                </TypeRow>
                <TypeRow size="text-body-md text-body" spec="body-md · 16 / 400">
                  Estacionamento privado em garagem coberta, com acesso 24h e câmeras
                  de segurança.
                </TypeRow>
                <TypeRow size="text-body-sm text-body" spec="body-sm · 14 / 400">
                  Hosted by Ana · 0.8 km · 24h disponível
                </TypeRow>
                <TypeRow size="text-caption text-muted" spec="caption · 14 / 500">
                  Nome · CPF · Data de entrada
                </TypeRow>
                <TypeRow size="text-caption-sm text-muted" spec="caption-sm · 13 / 400">
                  © 2026 Movepark, Inc.
                </TypeRow>
              </div>
            </Specimen>

            <div className="mt-8 grid grid-cols-1 gap-5 tablet:grid-cols-2">
              <div>
                <h3 className="mb-3 text-display-sm text-ink">Pesos disponíveis</h3>
                <Specimen>
                  <div className="flex items-end justify-around gap-4">
                    {[
                      { w: 100, label: "Thin" },
                      { w: 300, label: "Light" },
                      { w: 400, label: "Regular" },
                      { w: 500, label: "Medium" },
                      { w: 700, label: "Bold" },
                      { w: 900, label: "Black" },
                    ].map((g) => (
                      <div key={g.w} className="flex flex-col items-center gap-2">
                        <div
                          style={{ fontWeight: g.w as 100 }}
                          className="text-[48px] leading-none text-ink"
                        >
                          Mp
                        </div>
                        <Token>{g.label} · {g.w}</Token>
                      </div>
                    ))}
                  </div>
                </Specimen>
              </div>
              <div>
                <h3 className="mb-3 text-display-sm text-ink">Rating display</h3>
                <Specimen caption="único momento ‘alto’ do sistema">
                  <div className="grid grid-cols-[auto_1fr] items-center gap-8">
                    <div className="flex items-center gap-2 text-[64px] font-black leading-[1.05] tracking-[-1.5px] text-ink">
                      <svg width="14" height="40" viewBox="0 0 14 40" fill="none">
                        <path
                          d="M13 2 C 3 12, 3 28, 13 38"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                      4.81
                      <svg width="14" height="40" viewBox="0 0 14 40" fill="none">
                        <path
                          d="M1 2 C 11 12, 11 28, 1 38"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-[0.3px] text-muted">
                        rating-display
                      </span>
                      <Token>64px · 900 · -1.5px · 1.05</Token>
                      <span className="text-[13px] text-ink">
                        Apenas na página de detalhe da vaga.
                      </span>
                    </div>
                  </div>
                </Specimen>
              </div>
            </div>

            <h3 className="mb-3 mt-8 text-display-sm text-ink">Utilitárias</h3>
            <Specimen>
              <div className="grid grid-cols-1 items-center gap-6 tablet:grid-cols-3">
                <div className="flex flex-col items-start gap-2">
                  <Button>Reservar agora</Button>
                  <Token>button-md · 16 / 500</Token>
                </div>
                <div className="flex flex-col items-start gap-2">
                  <span className="rounded-full bg-canvas px-3 py-1 text-badge font-bold text-ink shadow-tier">
                    Destaque
                  </span>
                  <Token>badge · 11 / 700</Token>
                </div>
                <div className="flex flex-col items-start gap-2">
                  <span className="rounded-full bg-mp-primary px-2 py-[3px] text-uppercase-tag font-black uppercase tracking-[0.4px] text-on-primary">
                    NEW
                  </span>
                  <Token>uppercase-tag · 8 / 900</Token>
                </div>
                <div className="flex flex-col items-start gap-2">
                  <span className="text-micro-label font-bold uppercase tracking-[0.3px] text-muted-steel">
                    Chegada
                  </span>
                  <Token>micro-label · 12 / 700</Token>
                </div>
                <div className="flex flex-col items-start gap-2">
                  <a href="#typography" className="text-link text-mp-indigo underline underline-offset-2 no-underline hover:underline">
                    Ver todos os destinos
                  </a>
                  <Token>link · 14 / 400</Token>
                </div>
                <div className="flex flex-col items-start gap-2">
                  <span className="text-nav-link text-ink">
                    Vagas
                  </span>
                  <Token>nav-link · 16 / 600</Token>
                </div>
              </div>
            </Specimen>
          </section>

          {/* SPACING */}
          <section id="spacing">
            <SectionHeader
              eyebrow="Foundations"
              title="Espaçamento"
              description="Base de 4px. Layout respira em xl (32) e section (64)."
            />
            <Specimen>
              <div className="flex items-end justify-around gap-4">
                {[
                  { tok: "xxs", v: 2 },
                  { tok: "xs", v: 4 },
                  { tok: "sm", v: 8 },
                  { tok: "md", v: 12 },
                  { tok: "base", v: 16 },
                  { tok: "lg", v: 24 },
                  { tok: "xl", v: 32 },
                  { tok: "xxl", v: 48 },
                  { tok: "section", v: 64 },
                ].map((s) => (
                  <div key={s.tok} className="flex flex-col items-center gap-2">
                    <div
                      style={{ height: s.v, width: 36 }}
                      className="rounded-sm bg-mp-pale ring-1 ring-inset ring-mp-indigo/15"
                    />
                    <span className="text-[11px] font-bold text-ink">{s.tok}</span>
                    <span className="font-mono text-[10px] text-muted">{s.v}</span>
                  </div>
                ))}
              </div>
            </Specimen>
          </section>

          {/* RADII */}
          <section id="radii">
            <SectionHeader
              eyebrow="Foundations"
              title="Raios"
              description="Botões 8px, cards 14px, pílulas 32px ou full."
            />
            <Specimen>
              <div className="flex items-center justify-around gap-4">
                {[
                  { tok: "xs", v: "4px", rad: "rounded-xs" },
                  { tok: "sm", v: "8px · button", rad: "rounded-sm" },
                  { tok: "md", v: "14px · card", rad: "rounded-md" },
                  { tok: "lg", v: "20px", rad: "rounded-lg" },
                  { tok: "xl", v: "32px · strip", rad: "rounded-xl" },
                  { tok: "full", v: "pill", rad: "rounded-full" },
                ].map((r) => (
                  <div key={r.tok} className="flex flex-col items-center gap-2">
                    <div
                      className={`${r.rad} h-[72px] w-[72px] bg-mp-pale ring-1 ring-inset ring-mp-indigo/25`}
                    />
                    <span className="text-[12px] font-semibold text-ink">{r.tok}</span>
                    <span className="font-mono text-[10px] text-muted">{r.v}</span>
                  </div>
                ))}
              </div>
            </Specimen>
          </section>

          {/* ELEVATION */}
          <section id="elevation">
            <SectionHeader
              eyebrow="Foundations"
              title="Elevação"
              description="Um único tier de sombra, tingido em navy. Tudo o mais é flat com hairline 1px."
            />
            <Specimen>
              <div className="grid grid-cols-1 items-center gap-8 bg-surface-soft p-6 tablet:grid-cols-2">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-24 w-full max-w-sm items-center justify-center rounded-md bg-canvas text-caption text-ink ring-1 ring-inset ring-hairline">
                    Flat (95% das superfícies)
                  </div>
                  <span className="font-mono text-[11px] text-muted">
                    no shadow · 1px hairline
                  </span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-24 w-full max-w-sm items-center justify-center rounded-md bg-canvas text-caption text-ink shadow-tier">
                    Card hover / dropdown
                  </div>
                  <span className="font-mono text-[11px] text-muted">
                    shadow-tier
                  </span>
                </div>
              </div>
            </Specimen>
          </section>

          {/* COMPONENTS */}
          <section id="components">
            <SectionHeader
              eyebrow="Patterns"
              title="Componentes"
              description="Os elementos canônicos da interface. Os shadcn primitives da pasta src/components/ui já compõem com estes mesmos tokens."
            />

            <h3 className="mb-3 text-display-sm text-ink">Botões</h3>
            <Specimen caption="primary · secondary · ghost · pill · outline">
              <div className="flex flex-wrap items-center gap-4">
                <Button>Reservar</Button>
                <Button className="!bg-mp-primary-active">Pressed</Button>
                <Button disabled>Indisponível</Button>
                <Button variant="secondary">Salvar</Button>
                <Button variant="ghost">Ver mais</Button>
                <Button variant="pill">Seja um operador</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="danger">Excluir</Button>
              </div>
            </Specimen>

            <h3 className="mb-3 mt-8 text-display-sm text-ink">Badges & chips</h3>
            <Specimen>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-bold text-ink shadow-tier">
                  Destaque
                </span>
                <span className="rounded-full bg-mp-primary px-2 py-[3px] text-[8px] font-black uppercase tracking-[0.4px] text-on-primary">
                  NEW
                </span>
                <span className="rounded-full bg-canvas px-3.5 py-2 text-body-sm font-medium text-ink ring-1 ring-inset ring-hairline">
                  Cobertas
                </span>
                <span className="rounded-full bg-canvas px-3.5 py-2 text-body-sm font-medium text-ink ring-[1.5px] ring-inset ring-ink">
                  Próximas
                </span>
                <Badge tone="active">
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />
                  Reserva ativa
                </Badge>
                <Badge tone="confirmed">✓ Operador verificado</Badge>
                <Badge tone="cancelled">Cancelada</Badge>
                <Badge tone="pending">Pendente</Badge>
                <Badge tone="completed">Concluída</Badge>
              </div>
            </Specimen>

            <h3 className="mb-3 mt-8 text-display-sm text-ink">Inputs</h3>
            <Specimen caption="default · focused · error">
              <div className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
                <div>
                  <Label htmlFor="ds-name">Nome</Label>
                  <Input id="ds-name" defaultValue="Ana Souza" />
                </div>
                <div>
                  <Label htmlFor="ds-email">E-mail</Label>
                  <Input
                    id="ds-email"
                    defaultValue="ana@"
                    className="border-2 border-ink"
                  />
                </div>
                <div>
                  <Label htmlFor="ds-doc">CPF</Label>
                  <Input
                    id="ds-doc"
                    placeholder="000.000.000-00"
                    className="border-2 border-error"
                  />
                  <span className="mt-1 block text-[12px] text-error">
                    CPF inválido
                  </span>
                </div>
              </div>
            </Specimen>

            <h3 className="mb-3 mt-8 text-display-sm text-ink">Pílula de busca</h3>
            <Specimen>
              <div className="flex justify-center">
                <SearchPill />
              </div>
            </Specimen>

            <h3 className="mb-3 mt-8 text-display-sm text-ink">Top navigation</h3>
            <NavStub />

            <h3 className="mb-3 mt-8 text-display-sm text-ink">Property cards</h3>
            <Specimen>
              <div className="flex flex-wrap gap-6">
                <PropertyCard
                  background="linear-gradient(135deg,#4041A3 0%,#5D5FEF 60%,#29263F 100%)"
                  title="Garagem · Centro"
                  host="Por Ana"
                  meta="0.8 km · 24h"
                  price="R$ 12"
                  rating="4.92"
                  favorite
                />
                <PropertyCard
                  background="linear-gradient(160deg,#818FAF 0%,#29263F 100%)"
                  title="Vaga aberta · Jardins"
                  host="Por Marco"
                  meta="1.4 km · Seg–Sex"
                  price="R$ 8"
                  rating="4.74"
                  saved
                />
                <PropertyCard
                  background="linear-gradient(140deg,#E0E5F2 0%,#818FAF 100%)"
                  title="Edifício · Pinheiros"
                  host="Por Bia"
                  meta="0.3 km · 24h"
                  price="R$ 18"
                  rating="4.88"
                  favorite
                />
              </div>
            </Specimen>

            <h3 className="mb-3 mt-8 text-display-sm text-ink">Reservation card</h3>
            <Specimen>
              <div className="flex justify-center">
                <ReservationCard />
              </div>
            </Specimen>

            <h3 className="mb-3 mt-8 text-display-sm text-ink">Date picker</h3>
            <Specimen>
              <div className="flex justify-center">
                <DatePickerStub />
              </div>
            </Specimen>

            <h3 className="mb-3 mt-8 text-display-sm text-ink">KPI / Stat card</h3>
            <Specimen>
              <div className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
                <Card>
                  <CardContent className="flex flex-col gap-2 p-6">
                    <span className="text-caption text-muted">Reservas hoje</span>
                    <span className="text-display-xl text-ink">128</span>
                    <div className="flex items-center gap-2 text-body-sm">
                      <span className="text-muted">vs. ontem</span>
                      <span className="text-caption text-success">+12.5%</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex flex-col gap-2 p-6">
                    <span className="text-caption text-muted">Receita do mês</span>
                    <span className="text-display-xl text-ink">R$ 84.210</span>
                    <div className="flex items-center gap-2 text-body-sm">
                      <span className="text-muted">vs. mês anterior</span>
                      <span className="text-caption text-success">+8.1%</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex flex-col gap-2 p-6">
                    <span className="text-caption text-muted">Ticket médio</span>
                    <span className="text-display-xl text-ink">R$ 24,90</span>
                    <div className="flex items-center gap-2 text-body-sm">
                      <span className="text-muted">mês atual</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </Specimen>

            <h3 className="mb-3 mt-8 text-display-sm text-ink">Card pattern</h3>
            <Specimen>
              <Card>
                <CardHeader>
                  <CardTitle>Garagem coberta · Centro</CardTitle>
                  <CardDescription>
                    Estacionamento privado em garagem coberta, com acesso 24h e
                    câmeras de segurança.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-muted" />
                    <span className="text-body-sm text-muted">
                      Você receberá uma confirmação por e-mail.
                    </span>
                  </div>
                  <Button size="sm">Confirmar</Button>
                </CardContent>
              </Card>
            </Specimen>
          </section>

          {/* ICONOGRAPHY */}
          <section id="iconography">
            <SectionHeader
              eyebrow="Foundations"
              title="Iconografia"
              description="Lucide Icons — linha 2px, ends arredondados, 24 × 24. Cor padrão: ink (navy). Nunca preencher com cor sólida exceto nos estados de destaque (heart salvo = violet)."
            />

            <h3 className="mb-3 text-display-sm text-ink">Navegação & ações</h3>
            <Specimen>
              <div className="grid grid-cols-3 gap-4 tablet:grid-cols-6 desktop:grid-cols-8">
                {[
                  { icon: <Home />, label: "Home" },
                  { icon: <Search />, label: "Search" },
                  { icon: <MapPin />, label: "MapPin" },
                  { icon: <Calendar />, label: "Calendar" },
                  { icon: <Clock />, label: "Clock" },
                  { icon: <Globe />, label: "Globe" },
                  { icon: <Bell />, label: "Bell" },
                  { icon: <QrCode />, label: "QrCode" },
                ].map(({ icon, label }) => (
                  <IconChip key={label} icon={icon} label={label} />
                ))}
              </div>
            </Specimen>

            <h3 className="mb-3 mt-8 text-display-sm text-ink">Domínio de estacionamento</h3>
            <Specimen>
              <div className="grid grid-cols-3 gap-4 tablet:grid-cols-6 desktop:grid-cols-8">
                {[
                  { icon: <Car />, label: "Car" },
                  { icon: <Shield />, label: "Shield" },
                  { icon: <Star />, label: "Star" },
                  { icon: <Heart />, label: "Heart" },
                ].map(({ icon, label }) => (
                  <IconChip key={label} icon={icon} label={label} />
                ))}
              </div>
            </Specimen>

            <h3 className="mb-3 mt-8 text-display-sm text-ink">Feedback & estado</h3>
            <Specimen>
              <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
                <div className="flex items-center gap-3">
                  <CircleCheck className="h-5 w-5 text-success" />
                  <div>
                    <span className="text-caption text-ink">CircleCheck</span>
                    <span className="ml-2 font-mono text-[11px] text-muted">text-success</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <TriangleAlert className="h-5 w-5 text-warning" />
                  <div>
                    <span className="text-caption text-ink">TriangleAlert</span>
                    <span className="ml-2 font-mono text-[11px] text-muted">text-warning</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <X className="h-5 w-5 text-error" />
                  <div>
                    <span className="text-caption text-ink">X</span>
                    <span className="ml-2 font-mono text-[11px] text-muted">text-error</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Info className="h-5 w-5 text-info" />
                  <div>
                    <span className="text-caption text-ink">Info</span>
                    <span className="ml-2 font-mono text-[11px] text-muted">text-info</span>
                  </div>
                </div>
              </div>
            </Specimen>

            <h3 className="mb-3 mt-8 text-display-sm text-ink">Estados especiais</h3>
            <Specimen>
              <div className="flex flex-wrap items-center gap-8">
                <div className="flex flex-col items-center gap-2">
                  <Heart className="h-6 w-6" stroke="#fff" strokeWidth={2} fill="rgba(0,0,0,0.4)" />
                  <Token>não salvo</Token>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Heart className="h-6 w-6" stroke="#fff" strokeWidth={2} fill="hsl(var(--mp-primary))" />
                  <Token>salvo · mp-primary</Token>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Star className="h-5 w-5 fill-ink stroke-none" />
                  <Token>estrela de rating</Token>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Search className="h-5 w-5 text-on-primary" style={{ background: "hsl(var(--mp-primary))", borderRadius: 9999, padding: 10, boxSizing: "content-box" }} />
                  <Token>orb de busca · mp-primary</Token>
                </div>
              </div>
            </Specimen>

            <div className="mt-6 rounded-md border border-hairline bg-surface-soft p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.3px] text-muted-steel">Regra de uso</p>
              <ul className="mt-2 flex flex-col gap-1 text-body-sm text-body">
                <li>Tamanho padrão: <code className="font-mono text-[12px]">h-5 w-5</code> (20 px); headings e CTAs: <code className="font-mono text-[12px]">h-6 w-6</code> (24 px).</li>
                <li>Cor padrão: <code className="font-mono text-[12px]">text-ink</code> (navy). Nunca usar cor pura de marca (#5D5FEF) inline em ícones genéricos.</li>
                <li>Ícones de estado usam as cores semânticas (<code className="font-mono text-[12px]">text-success</code>, <code className="font-mono text-[12px]">text-error</code>, etc.).</li>
                <li>Coração salvo e orb de busca são os únicos ícones com <code className="font-mono text-[12px]">fill mp-primary</code>.</li>
              </ul>
            </div>
          </section>

          {/* RULES */}
          <section id="rules" className="pb-16">
            <SectionHeader
              eyebrow="Princípios"
              title="Regras de marca em 1 minuto"
            />
            <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
              <Rule
                title="Um acento"
                body={
                  <>
                    Apenas o violet <span className="text-mp-primary">#5D5FEF</span>{" "}
                    Movepark — CTA principal, orb de busca e coração salvo. Usado
                    com parcimônia.
                  </>
                }
              />
              <Rule
                title="Tinta navy"
                body="Headlines e ink são navy #29263F, nunca preto puro."
              />
              <Rule
                title="Inter moderna"
                body="500–700 para display, 400 para corpo. O único momento ‘alto’ é o rating em 64 / 900."
              />
              <Rule
                title="Cantos suaves"
                body="8 px botões, 14 px cards, 32 px pílulas de categoria, full para busca / orb / coração / NEW."
              />
              <Rule
                title="Uma sombra só"
                body="Single tier de elevação, tingido em navy. Flat em tudo o mais."
              />
              <Rule
                title="Gradiente é editorial"
                body="Indigo → Violet → Indigo. Nunca em CTAs."
              />
              <Rule
                title="Sem ruído"
                body="Sem emoji. Sem textura. Sem ilustração desenhada à mão. Canvas branco, conduzido por fotografia."
              />
              <Rule
                title="Voz"
                body='PT-BR, sentence case, verbos diretos. "Reservar agora", não "Reserve Now!".'
              />
            </div>
          </section>
        </div>
      </div>

      {/* FOOTER */}
      <div className="border-t border-hairline bg-surface-soft">
        <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-3 px-6 py-8 tablet:flex-row desktop:px-10">
          <div className="flex items-center gap-3">
            <Monogram size={24} />
            <span className="text-body-sm text-muted">
              © 2026 Movepark · Design System v1.0
            </span>
          </div>
          <span className="font-mono text-[11px] text-muted-steel">
            tokens em <Token>src/index.css</Token> · <Token>tailwind.config.ts</Token>
          </span>
        </div>
      </div>
    </div>
  );
}

function TypeRow({
  children,
  size,
  spec,
}: {
  children: React.ReactNode;
  size: string;
  spec: string;
}) {
  return (
    <div className="grid grid-cols-1 items-baseline gap-3 tablet:grid-cols-[1fr_220px]">
      <div className={"text-ink " + size}>{children}</div>
      <span className="font-mono text-[12px] text-muted tablet:text-right">
        {spec}
      </span>
    </div>
  );
}

function Rule({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="rounded-md border border-hairline bg-canvas p-5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-mp-primary" />
        <span className="text-title-md text-ink">{title}</span>
      </div>
      <p className="text-body-sm text-body">{body}</p>
    </div>
  );
}

function IconChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-surface-soft text-ink">
        {React.cloneElement(icon as React.ReactElement, { className: "h-5 w-5" })}
      </div>
      <span className="font-mono text-[10px] text-muted">{label}</span>
    </div>
  );
}
