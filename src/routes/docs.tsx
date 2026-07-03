import * as React from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  Search,
  Copy,
  Check,
  KeyRound,
  ChevronRight,
  BookOpen,
  ShieldCheck,
  ListChecks,
  CircleAlert,
  Gauge,
  MapPin,
  CalendarCheck,
  Ticket,
  SquareParking,
  Tag,
  Percent,
  Sparkles,
  Star,
  BarChart3,
  HelpCircle,
  Bot,
  type LucideIcon,
} from "@/lib/icons";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  API_BASE,
  MCP_BASE,
  REST_GROUPS,
  SCOPES,
  STATUS_CODES,
  MCP_PUBLIC_TOOLS,
  MCP_PARTNER_TOOLS,
  MCP_EXAMPLE_LIST,
  MCP_EXAMPLE_CALL,
  type Endpoint,
  type Group,
  type HttpMethod,
} from "@/features/docs/apiDocs";

const GROUP_ICON: Record<string, LucideIcon> = {
  locations: MapPin,
  availability: CalendarCheck,
  bookings: Ticket,
  "parking-types": SquareParking,
  coupons: Tag,
  discounts: Percent,
  addons: Sparkles,
  reviews: Star,
  occupancy: BarChart3,
  faq: HelpCircle,
};

const TOP_SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Visão geral", icon: BookOpen },
  { id: "auth", label: "Autenticação", icon: KeyRound },
  { id: "scopes", label: "Escopos", icon: ShieldCheck },
  { id: "conventions", label: "Convenções", icon: ListChecks },
  { id: "status", label: "Status codes", icon: CircleAlert },
  { id: "ratelimit", label: "Limites", icon: Gauge },
];

const endpointId = (e: Endpoint) => `${e.method}-${e.path}`.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();

function MethodBadge({ method, size = "md" }: { method: HttpMethod; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-sm font-bold tracking-wide",
        size === "sm" ? "px-1 text-[9px]" : "px-2 py-0.5 text-[11px]",
        method === "GET" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700",
      )}
    >
      {method}
    </span>
  );
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  async function copy() {
    await navigator.clipboard.writeText(code).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="relative min-w-0">
      {label && <div className="mb-1 text-caption-sm font-medium text-muted">{label}</div>}
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 rounded-sm bg-canvas/80 p-1.5 text-muted hover:text-ink"
        title="Copiar"
        aria-label="Copiar"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre className="overflow-x-auto rounded-sm border border-hairline bg-surface-soft p-3 text-[12.5px] leading-relaxed text-ink">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function EndpointCard({ e, forceOpen }: { e: Endpoint; forceOpen: boolean }) {
  const [override, setOverride] = React.useState<boolean | null>(null);
  const open = override ?? forceOpen;
  return (
    <div id={endpointId(e)} className="scroll-mt-24 overflow-hidden rounded-md border border-hairline bg-canvas">
      <button
        type="button"
        onClick={() => setOverride(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-surface-soft/60"
        aria-expanded={open}
      >
        <MethodBadge method={e.method} />
        <code className="truncate text-body-sm font-medium text-ink">{e.path}</code>
        {e.scope && (
          <span className="ml-auto hidden shrink-0 rounded-full bg-surface-soft px-2 py-0.5 text-[11px] text-muted tablet:inline">
            {e.scope}
          </span>
        )}
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-90", !e.scope && "ml-auto")} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-hairline-soft px-4 py-4">
          <p className="text-body-sm text-muted">{e.summary}</p>

          {e.params && e.params.length > 0 && (
            <table className="w-full text-caption-sm">
              <thead>
                <tr className="text-left text-muted-steel">
                  <th className="py-1 pr-3 font-medium">Parâmetro</th>
                  <th className="py-1 pr-3 font-medium">Em</th>
                  <th className="py-1 font-medium">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {e.params.map((p) => (
                  <tr key={p.name + p.in} className="border-t border-hairline-soft align-top">
                    <td className="py-1 pr-3">
                      <code>{p.name}</code>
                      {p.required && <span className="text-mp-primary"> *</span>}
                    </td>
                    <td className="py-1 pr-3 text-muted">{p.in}</td>
                    <td className="py-1 text-muted">{p.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="grid grid-cols-1 gap-3 desktop:grid-cols-2">
            {e.body && <CodeBlock label="Request body" code={e.body} />}
            {e.response && <CodeBlock label="Response" code={e.response} />}
          </div>
          {e.notes && <p className="text-caption-sm text-muted">{e.notes}</p>}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ id, icon: Icon, title }: { id: string; icon: LucideIcon; title: string }) {
  return (
    <h2 id={id} className="flex scroll-mt-24 items-center gap-2 text-display-sm text-ink">
      <Icon className="h-5 w-5 text-mp-primary" />
      {title}
    </h2>
  );
}

export default function DocsPage() {
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const [openModules, setOpenModules] = React.useState<Record<string, boolean>>({});
  const [active, setActive] = React.useState<string>("overview");

  const groups = React.useMemo<Group[]>(() => {
    if (!q) return REST_GROUPS;
    return REST_GROUPS.map((g) => ({
      ...g,
      endpoints: g.endpoints.filter((e) =>
        `${e.method} ${e.path} ${e.summary} ${e.scope ?? ""}`.toLowerCase().includes(q),
      ),
    })).filter((g) => g.endpoints.length > 0);
  }, [q]);

  // Scrollspy: destaca a seção visível na navegação.
  React.useEffect(() => {
    const ids = [...TOP_SECTIONS.map((s) => s.id), ...REST_GROUPS.map((g) => g.id), "mcp"];
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-72px 0px -70% 0px", threshold: 0 },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  const navLink = (id: string, label: string, Icon: LucideIcon) => (
    <a
      href={`#${id}`}
      className={cn(
        "flex items-center gap-2 rounded-sm px-2 py-1.5 text-body-sm text-muted hover:bg-surface-soft hover:text-ink",
        active === id && "bg-surface-soft font-medium text-ink",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </a>
  );

  const Sidebar = (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar endpoint…" className="pl-9" />
      </div>

      <nav className="space-y-0.5">
        <p className="px-2 pb-1 pt-1 text-caption-sm font-bold uppercase tracking-wide text-muted-steel">Introdução</p>
        {TOP_SECTIONS.map((s) => navLink(s.id, s.label, s.icon))}

        <p className="px-2 pb-1 pt-3 text-caption-sm font-bold uppercase tracking-wide text-muted-steel">Endpoints REST</p>
        {groups.map((g) => {
          const Icon = GROUP_ICON[g.id] ?? BookOpen;
          const expanded = q ? true : !!openModules[g.id];
          return (
            <div key={g.id}>
              <div
                className={cn(
                  "flex items-center gap-2 rounded-sm pr-1 text-body-sm text-muted hover:bg-surface-soft hover:text-ink",
                  active === g.id && "text-ink",
                )}
              >
                <a href={`#${g.id}`} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{g.title}</span>
                  <span className="text-muted-steel">{g.endpoints.length}</span>
                </a>
                <button
                  type="button"
                  onClick={() => setOpenModules((m) => ({ ...m, [g.id]: !m[g.id] }))}
                  className="rounded-sm p-1 text-muted hover:text-ink"
                  aria-label={expanded ? "Recolher" : "Expandir"}
                  aria-expanded={expanded}
                >
                  <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
                </button>
              </div>
              {expanded && (
                <div className="ml-3 border-l border-hairline-soft pl-2">
                  {g.endpoints.map((e) => (
                    <a
                      key={endpointId(e)}
                      href={`#${endpointId(e)}`}
                      className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-caption-sm text-muted hover:bg-surface-soft hover:text-ink"
                    >
                      <MethodBadge method={e.method} size="sm" />
                      <code className="truncate">{e.path.replace("/v1/", "")}</code>
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <p className="px-2 pb-1 pt-3 text-caption-sm font-bold uppercase tracking-wide text-muted-steel">Agentes</p>
        {navLink("mcp", "MCP", Bot)}
      </nav>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1320px] px-6 py-10 desktop:px-8">
      <Helmet>
        <title>Documentação da API & MCP · Movepark</title>
        <meta
          name="description"
          content="Documentação pública da API REST e do servidor MCP do Movepark: autenticação por chave, escopos, endpoints com exemplos de request e response, status codes e integração para agentes."
        />
        <link rel="canonical" href="https://hub.movepark.co/docs" />
      </Helmet>

      <header className="mb-8">
        <p className="text-caption-sm font-bold uppercase tracking-[0.4px] text-muted-steel">Desenvolvedores</p>
        <h1 className="mt-1 text-display-xl text-ink">Documentação da API &amp; MCP</h1>
        <p className="mt-2 max-w-2xl text-body-md text-muted">
          Integre o Movepark à sua operação: reservas, disponibilidade, preços, promoções e mais,
          via API REST ou via MCP (para agentes de IA). Autenticação por chave de API com escopos.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-caption-sm">
          <span className="rounded-full bg-surface-soft px-3 py-1">REST: <code>{API_BASE}</code></span>
          <span className="rounded-full bg-surface-soft px-3 py-1">MCP: <code>{MCP_BASE}</code></span>
          <a href="https://hub.movepark.co/openapi.yaml" className="rounded-full bg-surface-soft px-3 py-1 text-mp-primary hover:underline">
            OpenAPI 3.1 ↗
          </a>
        </div>
      </header>

      {/* Navegação mobile (colapsável) */}
      <details className="mb-6 rounded-md border border-hairline desktop:hidden">
        <summary className="cursor-pointer px-4 py-3 text-body-sm font-medium text-ink">Nesta página</summary>
        <div className="border-t border-hairline-soft p-3">{Sidebar}</div>
      </details>

      <div className="grid grid-cols-1 gap-10 desktop:grid-cols-[260px_1fr]">
        <aside className="hidden desktop:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">{Sidebar}</div>
        </aside>

        <div className="min-w-0 space-y-12">
          <section className="space-y-4">
            <SectionTitle id="overview" icon={BookOpen} title="Visão geral" />
            <p className="text-body-sm text-muted">
              A API é <strong>tenant-scoped</strong>: cada chave pertence a uma empresa e só acessa os
              dados dela. Respostas seguem um envelope estável; toda resposta traz um{" "}
              <code>request_id</code> para suporte.
            </p>
            <CodeBlock label="Envelope de sucesso" code={`{ "data": { /* … */ }, "meta": { "request_id": "req_…" } }`} />
          </section>

          <section className="space-y-4">
            <SectionTitle id="auth" icon={KeyRound} title="Autenticação" />
            <p className="text-body-sm text-muted">
              Envie sua chave no header <code>Authorization: Bearer mp_live_…</code> (ou{" "}
              <code>X-API-Key</code>). Crie e gerencie chaves em{" "}
              <Link to="/operator/api-keys" className="text-mp-primary hover:underline">/operator/api-keys</Link>.
              O segredo é exibido <strong>uma única vez</strong>. Use <code>mp_test_…</code> para testes.
            </p>
            <CodeBlock label="Exemplo (cURL)" code={`curl ${API_BASE}/v1/locations \\\n  -H "Authorization: Bearer mp_live_xxxxxxxx"`} />
            <p className="flex items-center gap-2 text-caption-sm text-muted">
              <KeyRound className="h-4 w-4" /> Cada endpoint exige um <strong>escopo</strong>; chaves sem ele recebem <code>403</code>.
            </p>
          </section>

          <section className="space-y-4">
            <SectionTitle id="scopes" icon={ShieldCheck} title="Escopos" />
            <div className="overflow-x-auto rounded-md border border-hairline">
              <table className="w-full text-body-sm">
                <thead className="bg-surface-soft text-left text-muted-steel">
                  <tr>
                    <th className="px-3 py-2 font-medium">Escopo</th>
                    <th className="px-3 py-2 font-medium">Permite</th>
                  </tr>
                </thead>
                <tbody>
                  {SCOPES.map((s) => (
                    <tr key={s.scope} className="border-t border-hairline-soft">
                      <td className="px-3 py-1.5"><code>{s.scope}</code></td>
                      <td className="px-3 py-1.5 text-muted">{s.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-4">
            <SectionTitle id="conventions" icon={ListChecks} title="Convenções" />
            <ul className="list-inside list-disc space-y-1 text-body-sm text-muted">
              <li><strong>Erros:</strong> <code>{`{ "error": { "code": "insufficient_scope", "message": "…", "request_id": "…" } }`}</code></li>
              <li><strong>Paginação:</strong> <code>limit</code> (máx 100) + <code>offset</code> nas listagens.</li>
              <li><strong>Idempotência:</strong> envie <code>Idempotency-Key</code> em <code>POST /v1/bookings</code>.</li>
              <li><strong>Datas:</strong> ISO-8601 em UTC (ex.: <code>2026-07-10T22:00:00Z</code>).</li>
              <li><strong>Versão:</strong> prefixo <code>/v1</code>; mudanças incompatíveis vão para <code>/v2</code>.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <SectionTitle id="status" icon={CircleAlert} title="Status codes" />
            <div className="overflow-x-auto rounded-md border border-hairline">
              <table className="w-full text-body-sm">
                <thead className="bg-surface-soft text-left text-muted-steel">
                  <tr>
                    <th className="px-3 py-2 font-medium">Código</th>
                    <th className="px-3 py-2 font-medium">Nome</th>
                    <th className="px-3 py-2 font-medium">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {STATUS_CODES.map((s) => (
                    <tr key={s.code} className="border-t border-hairline-soft">
                      <td className="px-3 py-1.5"><code>{s.code}</code></td>
                      <td className="px-3 py-1.5">{s.name}</td>
                      <td className="px-3 py-1.5 text-muted">{s.when}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-4">
            <SectionTitle id="ratelimit" icon={Gauge} title="Limites de uso" />
            <p className="text-body-sm text-muted">
              Limite padrão de <strong>60 requisições por minuto</strong> por chave. Ao exceder, a API
              responde <code>429</code> com <code>Retry-After</code>. Todo uso autenticado é auditado.
            </p>
          </section>

          {q && groups.length === 0 && (
            <p className="text-body-sm text-muted">Nenhum endpoint encontrado para “{query}”.</p>
          )}
          {groups.map((g) => {
            const Icon = GROUP_ICON[g.id] ?? BookOpen;
            return (
              <section key={g.id} className="space-y-4">
                <SectionTitle id={g.id} icon={Icon} title={g.title} />
                {g.description && <p className="text-body-sm text-muted">{g.description}</p>}
                <div className="space-y-2">
                  {g.endpoints.map((e) => (
                    <EndpointCard key={endpointId(e)} e={e} forceOpen={!!q} />
                  ))}
                </div>
              </section>
            );
          })}

          <section className="space-y-4">
            <SectionTitle id="mcp" icon={Bot} title="MCP: para agentes de IA" />
            <p className="text-body-sm text-muted">
              Servidor <strong>MCP</strong> (Model Context Protocol, Streamable HTTP / JSON-RPC 2.0) com
              duas superfícies: <strong>consumidor</strong> (público, descoberta) e <strong>parceiro</strong>{" "}
              (autenticado por chave). As tools visíveis no parceiro dependem dos escopos da chave.
            </p>
            <div className="grid grid-cols-1 gap-3 desktop:grid-cols-2">
              <CodeBlock label="Consumidor: tools/list" code={MCP_EXAMPLE_LIST} />
              <CodeBlock label="Parceiro: tools/call" code={MCP_EXAMPLE_CALL} />
            </div>
            <div className="grid grid-cols-1 gap-4 desktop:grid-cols-2">
              <div className="rounded-md border border-hairline p-4">
                <h3 className="text-title-sm text-ink">Tools do consumidor</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {MCP_PUBLIC_TOOLS.map((t) => (
                    <code key={t} className="rounded-sm bg-surface-soft px-1.5 py-0.5 text-[12px]">{t}</code>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-hairline p-4">
                <h3 className="text-title-sm text-ink">Tools do parceiro (por escopo)</h3>
                <table className="mt-2 w-full text-caption-sm">
                  <tbody>
                    {MCP_PARTNER_TOOLS.map((t) => (
                      <tr key={t.name} className="border-t border-hairline-soft align-top">
                        <td className="py-1 pr-3"><code className="text-[11.5px]">{t.name}</code></td>
                        <td className="py-1 text-muted"><code>{t.scope}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-caption-sm text-muted">
              Cards: <a href="https://hub.movepark.co/.well-known/mcp/server-card.json" className="text-mp-primary hover:underline">server-card.json</a>{" "}
              · <a href="https://hub.movepark.co/.well-known/mcp/partner-card.json" className="text-mp-primary hover:underline">partner-card.json</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
