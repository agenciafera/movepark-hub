import * as React from "react";
import { toast } from "sonner";
import { Copy, Key, LockKey, Warning } from "@phosphor-icons/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MODALIDADES,
  MOTIVO_SEM_MCP_MANAGER,
  ROTAS_INTERNAS,
  SUPERFICIES_MCP,
} from "@/features/manager-docs/catalog";
import {
  useCreatePlatformKey,
  usePlatformKeys,
  usePlatformScopes,
  useRevokePlatformKey,
} from "@/features/manager-docs/api";
import { formatDate } from "@/lib/format";

const API_BASE = "https://api.movepark.co";

function Bloco({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-sm border border-hairline bg-surface-soft p-4 font-mono text-body-sm text-ink">
      {children}
    </pre>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-display-sm text-ink">{titulo}</h2>
      {children}
    </section>
  );
}

export default function ManagerApiInterna() {
  const chaves = usePlatformKeys();
  const escopos = usePlatformScopes();
  const criar = useCreatePlatformKey();
  const revogar = useRevokePlatformKey();

  const [nome, setNome] = React.useState("");
  const [ambiente, setAmbiente] = React.useState<"live" | "test">("test");
  const [selecionados, setSelecionados] = React.useState<string[]>([]);
  const [segredo, setSegredo] = React.useState<string | null>(null);

  async function emitir(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await criar.mutateAsync({ name: nome.trim(), environment: ambiente, scopes: selecionados });
      setSegredo(r.key);
      setNome("");
      setSelecionados([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao emitir a chave");
    }
  }

  async function copiar(texto: string) {
    await navigator.clipboard.writeText(texto);
    toast.success("Copiado");
  }

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Uso interno"
        title="API e MCP da Movepark"
        description="O que existe só para a equipe, como autenticar e como emitir a chave. Nada desta página está no site nem em card de MCP."
      />

      <div className="flex gap-3 rounded-sm border border-hairline bg-surface-soft p-4">
        <LockKey className="mt-0.5 h-5 w-5 shrink-0 text-mp-indigo" aria-hidden />
        <p className="text-body-sm text-body">
          Esta rota é restrita ao papel <strong>hub_admin</strong>. As rotas descritas aqui não
          aparecem no contrato público, e o <code>lint:openapi</code> reprova o build se alguém
          publicá-las por engano.
        </p>
      </div>

      <Secao titulo="As três modalidades">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Modalidade</TableHead>
              <TableHead>Quem usa</TableHead>
              <TableHead>Credencial</TableHead>
              <TableHead>Onde se documenta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MODALIDADES.map((m) => (
              <TableRow key={m.nome}>
                <TableCell className="text-title-sm text-ink">{m.nome}</TableCell>
                <TableCell className="text-body-sm text-body">{m.quem}</TableCell>
                <TableCell className="text-body-sm text-body">{m.credencial}</TableCell>
                <TableCell className="text-body-sm text-body">{m.ondeSeDocumenta}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Secao>

      <Secao titulo="Como autenticar">
        <p className="text-body-md text-body">
          Mesma chamada da API pública, com uma chave de plataforma no lugar da chave de parceiro.
          A chave vai no cabeçalho <code>Authorization</code>.
        </p>
        <Bloco>{`curl -X POST "${API_BASE}/v1/blog/posts" \\
  -H "Authorization: Bearer mp_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "slug": "guia-viracopos",
    "title": "Guia de Viracopos",
    "body_md": "## Como escolher\\n\\nTexto do post.",
    "category": "guias",
    "author": "diego",
    "destination": "aeroporto-de-viracopos",
    "tags": ["traslado", "economia"],
    "is_published": false
  }'`}</Bloco>
        <p className="text-body-sm text-body">
          A chave de plataforma não pertence a nenhuma empresa, então não aparece na tela de chaves
          de nenhum parceiro e ninguém de fora consegue revogá-la. Ela também não aceita escopo de
          empresa: o banco recusa a mistura.
        </p>
      </Secao>

      <Secao titulo="Rotas internas">
        <div className="flex flex-col gap-6">
          {ROTAS_INTERNAS.map((r) => (
            <article key={`${r.metodo} ${r.caminho}`} className="rounded-sm border border-hairline p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="active">{r.metodo}</Badge>
                <code className="text-title-sm text-ink">{r.caminho}</code>
                <Badge tone="neutral">{r.escopo}</Badge>
              </div>
              <p className="mt-2 text-body-md text-body">{r.resumo}</p>

              {r.corpo && (
                <Table className="mt-3">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campo</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Observação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.corpo.map((c) => (
                      <TableRow key={c.campo}>
                        <TableCell className="font-mono text-body-sm text-ink">
                          {c.campo}
                          {c.obrigatorio && <span className="ml-1 text-error">*</span>}
                        </TableCell>
                        <TableCell className="text-body-sm text-body">{c.tipo}</TableCell>
                        <TableCell className="text-body-sm text-muted">{c.nota ?? ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {r.respostas && <p className="mt-3 text-body-sm text-muted">{r.respostas}</p>}
            </article>
          ))}
        </div>
      </Secao>

      <Secao titulo="Superfícies de MCP">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Superfície</TableHead>
              <TableHead>Endpoint</TableHead>
              <TableHead>Autenticação</TableHead>
              <TableHead>O que expõe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SUPERFICIES_MCP.map((s) => (
              <TableRow key={s.nome}>
                <TableCell className="text-title-sm text-ink">{s.nome}</TableCell>
                <TableCell className="font-mono text-caption-sm text-body">{s.endpoint}</TableCell>
                <TableCell className="text-body-sm text-body">{s.autenticacao}</TableCell>
                <TableCell className="text-body-sm text-body">
                  {s.tools}
                  {s.observacao && (
                    <span className="mt-1 block text-caption-sm text-muted">{s.observacao}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex gap-3 rounded-sm border border-hairline p-4">
          <Warning className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
          <p className="text-body-sm text-body">
            <strong>Não existe MCP de Manager.</strong> {MOTIVO_SEM_MCP_MANAGER}
          </p>
        </div>
      </Secao>

      <Secao titulo="Chaves de plataforma">
        {segredo && (
          <div className="flex flex-col gap-2 rounded-sm border border-mp-primary bg-surface-soft p-4">
            <p className="text-title-sm text-ink">Copie agora: esta chave não aparece de novo.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto font-mono text-body-sm text-ink">{segredo}</code>
              <Button size="sm" onClick={() => copiar(segredo)}>
                <Copy className="h-4 w-4" /> Copiar
              </Button>
            </div>
            <Button variant="outline" size="sm" className="self-start" onClick={() => setSegredo(null)}>
              Já copiei
            </Button>
          </div>
        )}

        <form onSubmit={emitir} className="flex flex-col gap-4 rounded-sm border border-hairline p-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pk-nome">Nome da chave</Label>
            <Input
              id="pk-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Bot de conteúdo, n8n do blog..."
              required
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-title-sm text-ink">Ambiente</legend>
            <div className="flex gap-3">
              {(["test", "live"] as const).map((a) => (
                <label key={a} className="flex items-center gap-2 text-body-sm text-body">
                  <input
                    type="radio"
                    name="ambiente"
                    checked={ambiente === a}
                    onChange={() => setAmbiente(a)}
                  />
                  {a}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-title-sm text-ink">Escopos</legend>
            <p className="text-caption-sm text-muted">
              Só escopo de plataforma. Escopo de parceiro fica na tela de chaves do operador.
            </p>
            <div className="flex flex-col gap-2">
              {(escopos.data ?? []).map((s) => (
                <label key={s.scope} className="flex items-start gap-2 text-body-sm text-body">
                  <Checkbox
                    checked={selecionados.includes(s.scope)}
                    onCheckedChange={(marcado) =>
                      setSelecionados((atual) =>
                        marcado ? [...atual, s.scope] : atual.filter((x) => x !== s.scope),
                      )
                    }
                  />
                  <span>
                    <code className="text-ink">{s.scope}</code>
                    {s.description && (
                      <span className="block text-caption-sm text-muted">{s.description}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Button
            type="submit"
            className="self-start"
            disabled={!nome.trim() || !selecionados.length || criar.isPending}
          >
            <Key className="h-4 w-4" /> {criar.isPending ? "Emitindo..." : "Emitir chave"}
          </Button>
        </form>

        {chaves.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : chaves.data?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Prefixo</TableHead>
                <TableHead>Escopos</TableHead>
                <TableHead>Último uso</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chaves.data.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="text-title-sm text-ink">
                    {k.name}
                    <span className="block text-caption-sm text-muted">{k.environment}</span>
                  </TableCell>
                  <TableCell className="font-mono text-caption-sm text-body">{k.key_prefix}</TableCell>
                  <TableCell className="text-body-sm text-body">{k.scopes.join(", ")}</TableCell>
                  <TableCell className="text-body-sm text-body">
                    {k.last_used_at ? formatDate(k.last_used_at) : "nunca"}
                  </TableCell>
                  <TableCell>
                    <Badge tone={k.status === "active" ? "confirmed" : "neutral"}>
                      {k.status === "active" ? "Ativa" : k.status === "revoked" ? "Revogada" : "Expirada"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {k.status === "active" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (!confirm(`Revogar a chave "${k.name}"? Quem usa ela para de funcionar.`)) return;
                          try {
                            await revogar.mutateAsync(k.id);
                            toast.success("Chave revogada");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Erro ao revogar");
                          }
                        }}
                      >
                        Revogar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-body-sm text-muted">Nenhuma chave de plataforma emitida.</p>
        )}
      </Secao>
    </div>
  );
}
