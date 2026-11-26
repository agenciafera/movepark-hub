import * as React from "react";
import { useMyPaymentMethods } from "@/features/payment-methods/api";
import { useProfile, useUpdateProfile } from "@/features/profile/api";
import { tokenizeCard } from "@/lib/pagarme-tokenize";
import { parseValidade } from "@/lib/card-expiry";
import { onlyDigits } from "@/lib/masks";
import { detectBrand, isCvvValid } from "@/lib/card-brand";
import {
  addressPartsFrom,
  buildBillingAddress,
  formatCep,
  normalizeCep,
  parseViaCep,
  viaCepUrl,
} from "./billingAddress.logic";
import type { CardChargeArgs } from "./api";

/** O que vai para a Edge `create-card-charge` além do código da reserva e das parcelas. */
export type CardPaymentFields = Pick<
  CardChargeArgs,
  | "payment_method_id"
  | "card_token"
  | "save_card"
  | "holder_name"
  | "brand"
  | "last4"
  | "exp_month"
  | "exp_year"
  | "billing_address"
>;

type AddressParts = {
  cep: string;
  number: string;
  complement: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
};

/** Cartão novo conferido e pronto para tokenizar. */
export type ValidatedNewCard = {
  validade: { mes: number; ano: number };
  parts: AddressParts;
  billingAddress: NonNullable<CardChargeArgs["billing_address"]>;
};

/**
 * Estado do cartão de qualquer cobrança da conta do cliente (26/11/2026): a compra no checkout, a
 * diferença de datas e o upgrade de tarifa. Antes cada tela tinha a sua cópia, e a da troca de datas
 * não oferecia salvar o cartão. Aqui mora o que é igual nas três: cartão salvo ou novo, endereço de
 * cobrança pelo CEP (o antifraude exige em cartão novo), salvar para a próxima e a tokenização no
 * navegador. O PAN nunca sai daqui sem virar token (ADR-004).
 */
export function useCardEntry(userId: string | undefined) {
  const savedCards = useMyPaymentMethods(userId);
  const profileQ = useProfile(userId);
  const updateProfile = useUpdateProfile();

  // Cartão salvo já vem selecionado: a lista chega ordenada (padrão primeiro, depois o mais recente),
  // e quem paga de novo quer um clique, não redigitar. Só na primeira carga: depois que a pessoa
  // escolhe "Usar outro cartão", a escolha é dela.
  const [cardChoice, setCardChoice] = React.useState<string>("new");
  const escolhaInicial = React.useRef(false);
  React.useEffect(() => {
    if (escolhaInicial.current) return;
    const first = savedCards.data?.[0];
    if (!first) return;
    setCardChoice(first.id);
    escolhaInicial.current = true;
  }, [savedCards.data]);

  const [cardNumber, setCardNumber] = React.useState("");
  const [cardName, setCardName] = React.useState("");
  const [cardExpiry, setCardExpiry] = React.useState("");
  const [cardCvv, setCardCvv] = React.useState("");
  const [saveCard, setSaveCard] = React.useState(false);

  // Endereço de cobrança (17/09/2026): só CEP e número são digitados; o resto vem do ViaCEP e fica
  // salvo no perfil para a próxima compra.
  const [cep, setCep] = React.useState("");
  const [addrNumber, setAddrNumber] = React.useState("");
  const [addrComplement, setAddrComplement] = React.useState("");
  const [addr, setAddr] = React.useState({ street: "", neighborhood: "", city: "", state: "" });
  const [cepStatus, setCepStatus] = React.useState<"idle" | "loading" | "ok" | "notfound">("idle");
  const enderecoInicial = React.useRef(false);
  React.useEffect(() => {
    if (enderecoInicial.current || !profileQ.data) return;
    const saved = addressPartsFrom(profileQ.data.preferences?.billing_address);
    if (saved) {
      setCep(formatCep(saved.cep));
      setAddrNumber(saved.number);
      setAddrComplement(saved.complement ?? "");
      setAddr({ street: saved.street, neighborhood: saved.neighborhood, city: saved.city, state: saved.state });
      setCepStatus(saved.city ? "ok" : "idle");
    }
    enderecoInicial.current = true;
  }, [profileQ.data]);
  const cepDigits = normalizeCep(cep);
  React.useEffect(() => {
    if (!cepDigits) {
      setCepStatus("idle");
      return;
    }
    let vivo = true;
    setCepStatus("loading");
    fetch(viaCepUrl(cepDigits))
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        const parsed = parseViaCep(j);
        if (!parsed) {
          setAddr({ street: "", neighborhood: "", city: "", state: "" });
          setCepStatus("notfound");
          return;
        }
        setAddr(parsed);
        setCepStatus("ok");
      })
      .catch(() => {
        if (vivo) setCepStatus("notfound");
      });
    return () => {
      vivo = false;
    };
  }, [cepDigits]);

  const isSaved = cardChoice !== "new";

  /** Confere o cartão novo antes de tokenizar: o token é de uso único e o antifraude exige o endereço. */
  function validateNew(): { error: string } | ValidatedNewCard {
    const validade = parseValidade(cardExpiry, new Date());
    if (!validade) return { error: "Validade inválida (use MM/AA)." };
    if (!isCvvValid(cardCvv, detectBrand(onlyDigits(cardNumber)))) {
      return { error: "Confira o CVV: são 3 dígitos no verso do cartão (4 na frente, no Amex)." };
    }
    const parts = { cep, number: addrNumber, complement: addrComplement, ...addr };
    const cobranca = buildBillingAddress(parts);
    if (cobranca.error || !cobranca.address) return { error: cobranca.error ?? "Confira o endereço do cartão." };
    return { validade, parts, billingAddress: cobranca.address };
  }

  /** Tokeniza no navegador (public key da Pagar.me) e devolve o corpo do cartão novo para a Edge. */
  async function tokenizeNew(publicKey: string, v: ValidatedNewCard): Promise<CardPaymentFields> {
    const tok = await tokenizeCard(publicKey, {
      number: cardNumber,
      holder_name: cardName,
      exp_month: v.validade.mes,
      exp_year: v.validade.ano,
      cvv: cardCvv,
    });
    return {
      card_token: tok.token,
      save_card: saveCard,
      holder_name: cardName,
      brand: tok.brand,
      last4: tok.last4,
      exp_month: v.validade.mes,
      exp_year: v.validade.ano,
      billing_address: v.billingAddress,
    };
  }

  /** Guarda o endereço para a próxima compra (best-effort: não atrapalha o pagamento que já passou). */
  function rememberAddress(parts: AddressParts) {
    if (!userId) return;
    updateProfile
      .mutateAsync({ id: userId, preferences: { ...(profileQ.data?.preferences ?? {}), billing_address: parts } })
      .catch(() => {});
  }

  return {
    savedCards: savedCards.data ?? [],
    cardChoice,
    setCardChoice,
    isSaved,
    cardNumber,
    setCardNumber,
    cardName,
    setCardName,
    cardExpiry,
    setCardExpiry,
    cardCvv,
    setCardCvv,
    saveCard,
    setSaveCard,
    cep,
    setCep,
    addrNumber,
    setAddrNumber,
    addrComplement,
    setAddrComplement,
    addr,
    cepStatus,
    validateNew,
    tokenizeNew,
    rememberAddress,
  };
}

export type CardEntry = ReturnType<typeof useCardEntry>;
