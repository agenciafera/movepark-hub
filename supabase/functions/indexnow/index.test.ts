import { assertEquals } from "jsr:@std/assert";
import { hostDe, urlsDosCaminhos } from "./logic.ts";
import { INDEXNOW_KEY } from "../_shared/indexnow.ts";

const absoluta = (p: string) => `https://movepark.co/${p.replace(/^\/+/, "")}`;

Deno.test("hostDe tira o esquema, que é o que o protocolo recusa com 422", () => {
  assertEquals(hostDe("https://movepark.co"), "movepark.co");
  assertEquals(hostDe("https://movepark.co/"), "movepark.co");
  assertEquals(hostDe("http://localhost:5173"), "localhost:5173");
});

Deno.test("urlsDosCaminhos monta a URL absoluta preservando a barra final do blog", () => {
  const urls = urlsDosCaminhos(["/blog/estacionamento-confins/", "/destinos/aeroporto-de-confins"], absoluta);

  assertEquals(urls, [
    "https://movepark.co/blog/estacionamento-confins/",
    "https://movepark.co/destinos/aeroporto-de-confins",
  ]);
});

Deno.test("urlsDosCaminhos descarta repetido e caminho sem barra inicial", () => {
  const urls = urlsDosCaminhos(
    ["/blog/a/", "/blog/a/", "blog/b/", "", "/destinos/c"],
    absoluta,
  );

  assertEquals(urls, ["https://movepark.co/blog/a/", "https://movepark.co/destinos/c"]);
});

Deno.test("a chave do protocolo é hexadecimal, no formato que o IndexNow aceita", () => {
  assertEquals(/^[a-f0-9]{8,128}$/.test(INDEXNOW_KEY), true);
});
