// Desativada. Era um diagnóstico temporário do template de OTP no WhatsApp (E0.10) e já cumpriu o
// papel. Mantida como stub inerte porque o MCP não remove funções; apagar pelo painel do Supabase.
//
// O fonte estava só em produção (versão 4) e voltou para o git em 14/08/2026, na varredura que
// comparou as funções publicadas com as pastas do repo. Não é código vivo: existe aqui para o
// repositório dizer a verdade sobre o que está no ar.
Deno.serve(() => new Response("gone", { status: 410 }));
