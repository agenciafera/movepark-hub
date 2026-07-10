#!/usr/bin/env node
// Driver para o MCP gemini-image (@houtini/gemini-mcp).
//
// Existe porque o servidor gemini-image nem sempre registra suas tools na sessão
// automaticamente (fica "connecting" e as tools não aparecem). Este script sobe o
// mesmo servidor via stdio, usando a MESMA config e chave do `.mcp.json` do projeto,
// e chama a tool desejada. Assim a geração de imagem nunca depende do auto-connect.
//
// A chave da API NUNCA é passada por linha de comando — ela é lida do `.mcp.json`
// (env do servidor "gemini-image"), mantendo o segredo fora do histórico do shell.
//
// Uso:
//   node gemini-image.mjs generate --out <arquivo.png> --prompt "<texto>" [opções]
//   node gemini-image.mjs edit     --out <arquivo.png> --prompt "<texto>" --image <in.png> [--image <in2.png>]
//   node gemini-image.mjs describe  --image <in.png> [--prompt "<pergunta>"]
//   node gemini-image.mjs list-tools
//
// Opções (generate/edit):
//   --aspect <ratio>   ex.: 1:1, 16:9, 9:16, 4:3, 3:4  (default: 16:9)
//   --size <tam>       ex.: 1K, 2K, 4K                  (default: 2K, só generate)
//   --model <id>       sobrescreve o modelo default do servidor
//   --image <path>     imagem de entrada (repetível; obrigatório em edit/describe)

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

// ---- localizar e ler o .mcp.json subindo a partir do cwd ----
function findMcpConfig(startDir) {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, ".mcp.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const cfgPath = findMcpConfig(process.cwd());
if (!cfgPath) {
  console.error("ERRO: .mcp.json não encontrado a partir de " + process.cwd());
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const server = cfg.mcpServers && cfg.mcpServers["gemini-image"];
if (!server) {
  console.error('ERRO: servidor "gemini-image" ausente em ' + cfgPath);
  process.exit(1);
}
const childEnv = { ...process.env, ...(server.env || {}) };

// ---- parse de argumentos ----
const argv = process.argv.slice(2);
const cmd = argv[0];
const opts = { images: [] };
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  if (a === "--out") opts.out = next();
  else if (a === "--prompt") opts.prompt = next();
  else if (a === "--aspect") opts.aspect = next();
  else if (a === "--size") opts.size = next();
  else if (a === "--model") opts.model = next();
  else if (a === "--image") opts.images.push(path.resolve(next()));
}

function loadImagesBase64(paths) {
  return paths.map((p) => {
    const b64 = fs.readFileSync(p).toString("base64");
    const ext = path.extname(p).slice(1).toLowerCase() || "png";
    const mime = ext === "jpg" ? "jpeg" : ext;
    return { data: b64, mimeType: `image/${mime}` };
  });
}

// monta a chamada tools/call conforme o comando
function buildCall() {
  if (cmd === "list-tools") return { method: "tools/list" };

  if (cmd === "generate") {
    if (!opts.out || !opts.prompt) fail("generate exige --out e --prompt");
    const args = {
      prompt: opts.prompt,
      aspectRatio: opts.aspect || "16:9",
      imageSize: opts.size || "2K",
      outputPath: path.resolve(opts.out),
    };
    if (opts.model) args.model = opts.model;
    if (opts.images.length) args.images = loadImagesBase64(opts.images);
    return { method: "tools/call", params: { name: "generate_image", arguments: args } };
  }

  if (cmd === "edit") {
    if (!opts.out || !opts.prompt || !opts.images.length)
      fail("edit exige --out, --prompt e ao menos um --image");
    const args = {
      prompt: opts.prompt,
      images: loadImagesBase64(opts.images),
      outputPath: path.resolve(opts.out),
    };
    if (opts.model) args.model = opts.model;
    return { method: "tools/call", params: { name: "edit_image", arguments: args } };
  }

  if (cmd === "describe") {
    if (!opts.images.length) fail("describe exige ao menos um --image");
    const args = { images: loadImagesBase64(opts.images) };
    if (opts.prompt) args.prompt = opts.prompt;
    if (opts.model) args.model = opts.model;
    return { method: "tools/call", params: { name: "describe_image", arguments: args } };
  }

  fail(`comando desconhecido: ${cmd || "(vazio)"}. Use generate | edit | describe | list-tools`);
}

function fail(msg) {
  console.error("ERRO: " + msg);
  process.exit(1);
}

const call = buildCall();

// ---- falar MCP por stdio ----
const p = spawn("npx", ["-y", "@houtini/gemini-mcp"], { env: childEnv, stdio: ["pipe", "pipe", "pipe"] });
let buf = "";
let stderr = "";
p.stderr.on("data", (d) => (stderr += d));

const send = (obj) => p.stdin.write(JSON.stringify(obj) + "\n");

p.stdout.on("data", (d) => {
  buf += d;
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    if (!line.trim()) continue;
    let m;
    try {
      m = JSON.parse(line);
    } catch {
      continue;
    }
    if (m.id === 1) {
      send({ jsonrpc: "2.0", id: 2, ...call });
    } else if (m.id === 2) {
      if (m.error) {
        console.error("ERRO da tool: " + JSON.stringify(m.error));
        p.kill();
        process.exit(1);
      }
      const texts = (m.result.content || [])
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      console.log(texts || JSON.stringify(m.result));
      p.kill();
      process.exit(0);
    }
  }
});

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "gemini-image-driver", version: "1" } },
});

setTimeout(() => {
  console.error("TIMEOUT (180s) sem resposta do servidor. stderr:\n" + stderr.slice(-2000));
  p.kill();
  process.exit(1);
}, 180000);
