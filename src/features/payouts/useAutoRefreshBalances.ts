import * as React from "react";
import { useRefreshGatewayBalances } from "./api";

/**
 * Saldos do gateway em tempo real nas telas do Manager (16/09/2026): ao abrir a tela, pede à
 * Edge `refresh-recipients` uma leitura forçada (relê o que tem mais de 30 s) e expõe o botão
 * "Atualizar saldos". O cron de 15 min continua por trás para quem não está olhando.
 */
export function useAutoRefreshBalances() {
  const refresh = useRefreshGatewayBalances();
  const disparou = React.useRef(false);
  const { mutate } = refresh;
  React.useEffect(() => {
    if (disparou.current) return;
    disparou.current = true;
    mutate();
  }, [mutate]);
  return refresh;
}
