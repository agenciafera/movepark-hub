#!/usr/bin/env bash
# PreToolUse (Write|Edit|MultiEdit) — Portão de revisão de texto do Movepark.
#
# Objetivo: garantir que TODO texto voltado ao usuário passe pela skill
# `revisar-texto` (portão anti-vícios de IA + copy-lp-queiroz) ANTES de ser
# gravado. Este hook não faz a revisão nem bloqueia a escrita — ele injeta um
# lembrete (additionalContext) no contexto do modelo sempre que um write pode
# introduzir texto legível por humano. A decisão fina "isto é copy ou é código?"
# fica com o Claude, que é bom nisso; o hook só garante que o lembrete apareça.
#
# Silencioso para o usuário (suppressOutput) — o lembrete vai só para o modelo.
# Faz skip de arquivos que nunca carregam texto de exibição (gerados, testes,
# configs, lockfiles, docs internos, binários), para não virar ruído.
set -euo pipefail

input="$(cat)"
fp="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.filePath // empty' 2>/dev/null || true)"

# Sem caminho de arquivo, não há o que revisar.
[ -z "$fp" ] && exit 0

# Arquivos que nunca contêm copy de exibição — sem lembrete.
case "$fp" in
  */src/types/database.ts) exit 0 ;;                                   # gerado
  *.test.*|*.spec.*|*/__tests__/*|*/supabase/tests/*) exit 0 ;;        # testes
  *.lock|*/bun.lock|*/package-lock.json|*/yarn.lock|*/pnpm-lock.yaml) exit 0 ;;
  */package.json|*tsconfig*.json|*.config.js|*.config.ts|*.config.mjs|*.config.cjs) exit 0 ;;
  *.eslintrc*|*.prettierrc*|*/wrangler.jsonc|*/supabase/config.toml) exit 0 ;;
  */.claude/*) exit 0 ;;                                               # config/skills do Claude
  *.d.ts|*.map|*.snap|*.lockb) exit 0 ;;
  *.md|*.mdx) exit 0 ;;                                                # docs internos (specs, README)
  *.png|*.jpg|*.jpeg|*.gif|*.svg|*.ico|*.webp|*.avif) exit 0 ;;        # imagens
  *.woff|*.woff2|*.ttf|*.otf|*.eot|*.pdf) exit 0 ;;                    # fontes/binários
esac

read -r -d '' ctx <<'EOF' || true
[Portão de conteúdo — política do projeto Movepark] Este write pode introduzir texto que um humano vai LER (headline, CTA, hero, microcopy de UI, label, placeholder, FAQ, e-mail, meta/OG/SEO, alt de imagem, seed de conteúdo). Se for esse o caso, use a skill `revisar-texto` ANTES de finalizar a gravação: (1) se for copy publicitária/de venda, eleve pela skill copy-lp-queiroz; (2) varra os vícios de escrita de IA — travessão em excesso, construção "não é X, é Y", regra de três decorativa, prolixidade/enchimento, palavra rebuscada (realizar/efetuar/utilizar), superlativo vazio, eyebrow em CAIXA ALTA/Title Case — e reescreva na voz da Movepark (direto, humano, sem gritar). Grave apenas a versão revisada. Se este write for só código, identificador, chave de i18n, comentário técnico ou config — sem prosa para humano — ignore este aviso e prossiga normalmente.
EOF

jq -cn --arg ctx "$ctx" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext: $ctx
  },
  suppressOutput: true
}'
