import * as React from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Search, Copy, Check, KeyRound } from "lucide-react";
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
  type HttpMethod,
} from "@/features/docs/apiDocs";

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-[11px] font-bold tracking-wide",
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
    <div className="relative">
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

function EndpointCard({ e }: { e: Endpoint }) {
  return (
    <div className="rounded-md border border-hairline bg-canvas p-4">
      <div className="flex flex-wrap items-center gap-2">
        <MethodBadge method={e.method} />
        <code className="text-body-sm font-medium text-ink">{e.path}</code>
        {e.scope && (
          <span className="ml-auto rounded-full bg-surface-soft px-2 py-0.5 text-[11px] text-muted">
            escopo: <code>{e.scope}</code>
          </span>
        )}
      </div>
      <p className="mt-2 text-body-sm text-muted">{e.summary}</p>

      {e.params && e.params.length > 0 && (
        <table className="mt-3 w-full text-caption-sm">
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

      <div className="mt-3 grid grid-cols-1 gap-3 desktop:grid-cols-2">
        {e.body && <CodeBlock label="Request body" code={e.body} />}
        {e.response && <CodeBlock label="Response" code={e.response} />}
      </div>
      {e.notes && <p className="mt-2 text-caption-sm text-muted">{e.notes}</p>}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-display-sm text-ink">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export default function DocsPage() {
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();

  const groups = React.useMemo(() => {
    if (!q) return REST_GROUPS;
    return REST_GROUPS.map((g) => ({
      ...g,
      endpoints: g.endpoints.filter((e) =>
        `${e.method} ${e.path} ${e.summary} ${e.scope ?? ""}`.toLowerCase().includes(q),
      ),
    })).filter((g) => g.endpoints.length > 0);
  }, [q]);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-6 py-10 desktop:px-8">
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
        <h1 className="mt-1 text-display-xl text-ink">Documentação da API & MCP</h1>
        <p className="mt-2 max-w-2xl text-body-md text-muted">
          Integre o Movepark à sua operação: reservas, disponibilidade, preços, promoções e mais — via
          API REST ou via MCP (para agentes de IA). Autenticação por chave de API com escopos.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-caption-sm">
          <span className="rounded-full bg-surface-soft px-3 py-1">REST: <code>{API_BASE}</code></span>
          <span className="rounded-full bg-surface-soft px-3 py-1">MCP: <code>{MCP_BASE}</code></span>
          <a href="https://hub.movepark.co/openapi.yaml" className="rounded-full bg-surface-soft px-3 py-1 text-mp-primary hover:underline">
            OpenAPI 3.1 ↗
          </a>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-10 desktop:grid-cols-[240px_1fr]">
        {/* Sidebar */}
        <aside className="hidden desktop:block">
          <div className="sticky top-20 space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar endpoint…"
                className="pl-9"
              />
            </div>
            <nav className="space-y-1 text-body-sm">
              {[
                ["overview", "Visão geral"],
                ["auth", "Autenticação"],
                ["scopes", "Escopos"],
                ["conventions", "Convenções"],
                ["status", "Status codes"],
                ["ratelimit", "Limites"],
              ].map(([id, label]) => (
                <a key={id} href={`#${id}`} className="block rounded-sm px-2 py-1 text-muted hover:bg-surface-soft hover:text-ink">
                  {label}
                </a>
              ))}
              <p className="px-2 pt-3 text-caption-sm font-bold uppercase tracking-wide text-muted-steel">Endpoints REST</p>
              {groups.map((g) => (
                <a key={g.id} href={`#${g.id}`} className="block rounded-sm px-2 py-1 text-muted hover:bg-surface-soft hover:text-ink">
                  {g.title} <span className="text-muted-steel">({g.endpoints.length})</span>
                </a>
              ))}
              <a href="#mcp" className="mt-2 block rounded-sm px-2 py-1 font-medium text-muted hover:bg-surface-soft hover:text-ink">
                MCP (agentes)
              </a>
            </nav>
          </div>
        </aside>

        {/* Conteúdo */}
        <div className="min-w-0 space-y-12">
          <Section id="overview" title="Visão geral">
            <p className="text-body-sm text-muted">
              A API é <strong>tenant-scoped</strong>: cada chave pertence a uma empresa e só acessa os
              dados dela. Respostas seguem um envelope estável; toda resposta traz um{" "}
              <code>request_id</code> para suporte.
            </p>
            <CodeBlock label="Envelope de sucesso" code={`{ "data": { /* … */ }, "meta": { "request_id": "req_…" } }`} />
          </Section>

          <Section id="auth" title="Autenticação">
            <p className="text-body-sm text-muted">
              Envie sua chave no header <code>Authorization: Bearer mp_live_…</code> (ou{" "}
              <code>X-API-Key</code>). Crie e gerencie chaves no painel do operador em{" "}
              <Link to="/operator/api-keys" className="text-mp-primary hover:underline">/operator/api-keys</Link>.
              O segredo é exibido <strong>uma única vez</strong>. Use <code>mp_test_…</code> para testes.
            </p>
            <CodeBlock
              label="Exemplo (cURL)"
              code={`curl ${API_BASE}/v1/locations \\\n  -H "Authorization: Bearer mp_live_xxxxxxxx"`}
            />
            <p className="flex items-center gap-2 text-caption-sm text-muted">
              <KeyRound className="h-4 w-4" /> Cada endpoint exige um <strong>escopo</strong>; chaves sem o
              escopo recebem <code>403</code>.
            </p>
          </Section>

          <Section id="scopes" title="Escopos">
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
          </Section>

          <Section id="conventions" title="Convenções">
            <ul className="list-inside list-disc space-y-1 text-body-sm text-muted">
              <li><strong>Erros:</strong> <code>{`{ "error": { "code": "insufficient_scope", "message": "…", "request_id": "…" } }`}</code></li>
              <li><strong>Paginação:</strong> <code>limit</code> (máx 100) + <code>offset</code> nas listagens.</li>
              <li><strong>Idempotência:</strong> envie <code>Idempotency-Key</code> em <code>POST /v1/bookings</code> para evitar duplicidade em retry.</li>
              <li><strong>Datas:</strong> ISO-8601 em UTC (ex.: <code>2026-07-10T22:00:00Z</code>).</li>
              <li><strong>Versão:</strong> prefixo <code>/v1</code>; mudanças incompatíveis vão para <code>/v2</code>.</li>
            </ul>
          </Section>

          <Section id="status" title="Status codes">
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
          </Section>

          <Section id="ratelimit" title="Limites de uso">
            <p className="text-body-sm text-muted">
              Limite padrão de <strong>60 requisições por minuto</strong> por chave. Ao exceder, a API
              responde <code>429</code> com o header <code>Retry-After</code>. Todo uso autenticado é
              auditado (você pode consultar no painel).
            </p>
          </Section>

          {/* Endpoints REST */}
          {q && groups.length === 0 && (
            <p className="text-body-sm text-muted">Nenhum endpoint encontrado para “{query}”.</p>
          )}
          {groups.map((g) => (
            <Section key={g.id} id={g.id} title={g.title}>
              {g.description && <p className="text-body-sm text-muted">{g.description}</p>}
              {g.endpoints.map((e) => (
                <EndpointCard key={e.method + e.path} e={e} />
              ))}
            </Section>
          ))}

          {/* MCP */}
          <Section id="mcp" title="MCP — para agentes de IA">
            <p className="text-body-sm text-muted">
              O Movepark expõe um servidor <strong>MCP</strong> (Model Context Protocol, Streamable
              HTTP / JSON-RPC 2.0) com duas superfícies: <strong>consumidor</strong> (público, descoberta)
              e <strong>parceiro</strong> (autenticado por chave, igual à API REST). As tools visíveis no
              parceiro dependem dos escopos da chave.
            </p>
            <div className="grid grid-cols-1 gap-3 desktop:grid-cols-2">
              <CodeBlock label="Consumidor — tools/list" code={MCP_EXAMPLE_LIST} />
              <CodeBlock label="Parceiro — tools/call" code={MCP_EXAMPLE_CALL} />
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
          </Section>
        </div>
      </div>
    </div>
  );
}
