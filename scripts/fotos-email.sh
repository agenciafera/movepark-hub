#!/usr/bin/env bash
# Gera a versão de e-mail (JPG de 560px) das fotos de unidade em public/Estacionamentos.
# Spec: docs/specs/logo-do-estacionamento.md (bloco foto + mapa do e-mail de confirmação).
#
# Por quê: as fotos do site são AVIF/WebP, que o Outlook e parte dos clientes de e-mail não
# mostram. O e-mail usa /Estacionamentos/<marca>/email/<arquivo>.jpg e, se o arquivo não existir,
# sai sem a foto (a Edge confere antes de enviar). Rode para a primeira foto de cada unidade que
# vende pelo Hub e commite os JPGs junto.
#
# Uso: scripts/fotos-email.sh public/Estacionamentos/pare-seguro/pare-seguro-2.avif [...]
# Precisa do `sips` (macOS).
set -euo pipefail
for src in "$@"; do
  dir="$(dirname "$src")/email"
  base="$(basename "${src%.*}")"
  mkdir -p "$dir"
  sips -s format jpeg -s formatOptions 70 --resampleWidth 560 "$src" --out "$dir/$base.jpg" >/dev/null
  echo "$dir/$base.jpg"
done
