#!/usr/bin/env bash
# Roda o vitest e GARANTE que nenhum worker (fork) fique órfão consumindo memória.
#
# Histórico: a combinação macOS + happy-dom às vezes crasha no teardown do runtime
# (assertion libuv `uv__stream_destroy` / "Channel closed"). Quando o processo principal do
# vitest aborta, os forks (pool) são reparentados pro init (PPID 1) e ficam presos segurando
# RAM — rodar os testes várias vezes acumulava processos e estourava a memória da máquina.
# O `pool: forks` do vitest.config.ts encerra limpo no caminho feliz, mas NÃO cobre o crash.
#
# Aqui rodamos o vitest no SEU próprio process group (set -m) e, na saída — inclusive quando
# ele morre por sinal — matamos o grupo inteiro. Mesmo já reparentados, os workers mantêm o
# PGID original, então `kill -- -PGID` os alcança. O exit code do vitest é preservado pro CI.
set -m

vitest run "$@" &
pid=$!

cleanup() {
  # Mata o process group do job (líder + workers), silencioso se já não existir.
  kill -- "-$pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait "$pid"
status=$?

trap - EXIT
cleanup
exit "$status"
