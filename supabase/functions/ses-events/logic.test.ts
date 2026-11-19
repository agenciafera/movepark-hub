import { assert, assertEquals } from "jsr:@std/assert";
import { createSign, generateKeyPairSync } from "node:crypto";
import {
  isAwsSnsUrl,
  normalizeAddress,
  parseSnsMessage,
  sesEventRows,
  type SnsMessage,
  snsStringToSign,
  verifySnsSignature,
} from "./logic.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const outraChave = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }).toString();

function assinar(m: Omit<SnsMessage, "Signature">, algo = "RSA-SHA256"): SnsMessage {
  const s = createSign(algo);
  s.update(snsStringToSign(m as SnsMessage), "utf8");
  return { ...m, Signature: s.sign(privateKey, "base64") } as SnsMessage;
}

const TOPICO = "arn:aws:sns:sa-east-1:123456789012:movepark-ses-eventos";
const notificacao = (extra: Partial<SnsMessage> = {}) => ({
  Type: "Notification" as const,
  MessageId: "sns-abc",
  TopicArn: TOPICO,
  Message: '{"eventType":"Bounce"}',
  Timestamp: "2026-11-19T12:00:00.000Z",
  SignatureVersion: "2",
  SigningCertURL: "https://sns.sa-east-1.amazonaws.com/SimpleNotificationService-abc.pem",
  ...extra,
});

Deno.test("string assinada da notificação: ordem fixa, Subject só quando existe", () => {
  const sem = snsStringToSign({ ...notificacao(), Signature: "" });
  assertEquals(sem, `Message\n{"eventType":"Bounce"}\nMessageId\nsns-abc\nTimestamp\n2026-11-19T12:00:00.000Z\nTopicArn\n${TOPICO}\nType\nNotification\n`);
  const com = snsStringToSign({ ...notificacao({ Subject: "Oi" }), Signature: "" });
  assert(com.includes("MessageId\nsns-abc\nSubject\nOi\nTimestamp"));
});

Deno.test("string assinada da confirmação inclui SubscribeURL e Token", () => {
  const s = snsStringToSign({
    ...notificacao(), Type: "SubscriptionConfirmation", SubscribeURL: "https://sns.x/confirm", Token: "tok", Signature: "",
  });
  assertEquals(s.split("\n").filter((_, i) => i % 2 === 0).slice(0, 7), [
    "Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type",
  ]);
});

Deno.test("assinatura: confere com a chave certa (SHA256 e SHA1) e recusa adulteração", () => {
  const m = assinar(notificacao());
  assert(verifySnsSignature(m, pubPem));
  assert(!verifySnsSignature(m, outraChave), "outra chave");
  assert(!verifySnsSignature({ ...m, Message: '{"eventType":"Delivery"}' }, pubPem), "mensagem trocada");
  assert(!verifySnsSignature({ ...m, TopicArn: "arn:aws:sns:us-east-1:999:outro" }, pubPem), "tópico trocado");
  assert(!verifySnsSignature({ ...m, SignatureVersion: "3" }, pubPem), "versão desconhecida");
  const v1 = assinar({ ...notificacao(), SignatureVersion: "1" }, "RSA-SHA1");
  assert(verifySnsSignature(v1, pubPem));
  assert(!verifySnsSignature({ ...v1, SignatureVersion: "2" }, pubPem), "SHA1 lida como SHA256");
  assert(!verifySnsSignature({ ...m, Signature: "lixo" }, pubPem), "assinatura quebrada");
});

Deno.test("URL do SNS: só https em sns.<região>.amazonaws.com; certificado termina em .pem", () => {
  assert(isAwsSnsUrl("https://sns.sa-east-1.amazonaws.com/SimpleNotificationService-x.pem", "cert"));
  assert(isAwsSnsUrl("https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=x", "subscribe"));
  assert(!isAwsSnsUrl("http://sns.sa-east-1.amazonaws.com/x.pem", "cert"), "http");
  assert(!isAwsSnsUrl("https://sns.sa-east-1.amazonaws.com.evil.com/x.pem", "cert"), "sufixo");
  assert(!isAwsSnsUrl("https://evil.com/sns.sa-east-1.amazonaws.com/x.pem", "cert"), "caminho");
  assert(!isAwsSnsUrl("https://sns.sa-east-1.amazonaws.com/x.txt", "cert"), "sem .pem");
  assert(!isAwsSnsUrl("https://user:pw@sns.sa-east-1.amazonaws.com/x.pem", "cert"), "credencial");
  assert(!isAwsSnsUrl("https://sns.sa-east-1.amazonaws.com:8443/x.pem", "cert"), "porta");
  assert(!isAwsSnsUrl("não é url", "subscribe"));
  assert(!isAwsSnsUrl("https://sns.s3-us-west-2.amazonaws.com/x.pem", "cert"), "bucket do S3 chamado sns");
  assert(isAwsSnsUrl("https://sns.us-gov-west-1.amazonaws.com/x.pem", "cert"));
});

Deno.test("corpo do SNS: recusa faltando campo, tipo desconhecido e confirmação sem token", () => {
  assert(parseSnsMessage({ ...notificacao(), Signature: "x" }));
  assertEquals(parseSnsMessage({ ...notificacao(), Signature: "" }), null);
  assertEquals(parseSnsMessage({ ...notificacao(), Signature: "x", Type: "Outro" }), null);
  assertEquals(parseSnsMessage({ ...notificacao(), Signature: "x", Type: "SubscriptionConfirmation" }), null);
  assertEquals(parseSnsMessage(null), null);
  assertEquals(parseSnsMessage("texto"), null);
});

const mail = {
  timestamp: "2026-11-19T10:00:00.000Z",
  source: "Movepark <contato@movepark.co>",
  messageId: "0100abc",
  destination: ["Fulano <Parceiro@Ex.com>", "b@ex.com"],
  commonHeaders: { subject: "Movimento de hoje: Pare Seguro" },
};

Deno.test("devolução: uma linha por destinatário, com tipo, diagnóstico e evento inteiro", () => {
  const rows = sesEventRows("sns-1", {
    eventType: "Bounce",
    mail,
    bounce: {
      bounceType: "Permanent", bounceSubType: "General", timestamp: "2026-11-19T10:00:05.000Z",
      bouncedRecipients: [
        { emailAddress: "Parceiro@Ex.com", status: "5.7.1", diagnosticCode: "smtp; 550 5.7.1 rejected" },
        { emailAddress: "parceiro@ex.com" }, // repetido: uma linha só
      ],
    },
  });
  assertEquals(rows.length, 1);
  assertEquals(rows[0].recipient, "parceiro@ex.com");
  assertEquals(rows[0].event_type, "bounce");
  assertEquals(rows[0].bounce_type, "Permanent");
  assertEquals(rows[0].bounce_subtype, "General");
  assertEquals(rows[0].diagnostic, "smtp; 550 5.7.1 rejected");
  assertEquals(rows[0].subject, "Movimento de hoje: Pare Seguro");
  assertEquals(rows[0].ses_message_id, "0100abc");
  assertEquals(rows[0].occurred_at, "2026-11-19T10:00:05.000Z");
  assert(rows[0].raw);
});

Deno.test("reclamação, entrega, atraso, recusa e notificação por identidade", () => {
  const rec = sesEventRows("s", { eventType: "Complaint", mail, complaint: { complaintFeedbackType: "abuse", complainedRecipients: [{ emailAddress: "a@ex.com" }] } });
  assertEquals([rec[0].event_type, rec[0].bounce_type, rec[0].occurred_at], ["complaint", "abuse", mail.timestamp]);

  const ent = sesEventRows("s", { eventType: "Delivery", mail, delivery: { recipients: ["a@ex.com", "b@ex.com"], smtpResponse: "250 ok", timestamp: "t1" } });
  assertEquals(ent.map((r) => r.recipient), ["a@ex.com", "b@ex.com"]);
  assertEquals(ent[0].raw, null, "entrega não guarda o evento inteiro");
  assertEquals(ent[0].diagnostic, "250 ok");

  const atraso = sesEventRows("s", { eventType: "DeliveryDelay", mail, deliveryDelay: { delayType: "MailboxFull", delayedRecipients: [{ emailAddress: "c@ex.com", status: "4.2.2" }] } });
  assertEquals([atraso[0].event_type, atraso[0].bounce_type, atraso[0].diagnostic], ["delivery_delay", "MailboxFull", "4.2.2"]);

  const recusa = sesEventRows("s", { eventType: "Reject", mail, reject: { reason: "Bad content" } });
  assertEquals(recusa.map((r) => r.recipient), ["parceiro@ex.com", "b@ex.com"]);
  assertEquals(recusa[0].diagnostic, "Bad content");

  const render = sesEventRows("s", { eventType: "Rendering Failure", mail, failure: { errorMessage: "x" } });
  assertEquals(render[0].event_type, "rendering_failure");

  const identidade = sesEventRows("s", { notificationType: "Bounce", mail, bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: "d@ex.com" }] } });
  assertEquals([identidade[0].event_type, identidade[0].bounce_type], ["bounce", "Transient"]);
});

Deno.test("evento que não interessa ou malformado vira lista vazia", () => {
  assertEquals(sesEventRows("s", { eventType: "Send", mail }), []);
  assertEquals(sesEventRows("s", { eventType: "Open", mail }), []);
  assertEquals(sesEventRows("s", null), []);
  assertEquals(sesEventRows("s", { eventType: "Bounce", mail, bounce: {} }), []);
  assertEquals(sesEventRows("s", { eventType: "Bounce", mail, bounce: { bouncedRecipients: [{ emailAddress: "" }] } }), []);
});

Deno.test("endereço: tira o nome e põe em minúsculas", () => {
  assertEquals(normalizeAddress("Fulano <A@Ex.COM>"), "a@ex.com");
  assertEquals(normalizeAddress("  B@ex.com "), "b@ex.com");
  assertEquals(normalizeAddress(42), "");
});
