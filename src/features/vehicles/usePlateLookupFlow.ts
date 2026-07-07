import * as React from "react";
import { plateMask } from "@/lib/masks";
import { useLookupPlate } from "./api";
import {
  flowReducer,
  initialFlowState,
  isValidPlateBR,
  normalizePlate,
  shouldAutoLookup,
} from "./usePlateLookupFlow.logic";

/**
 * Dirige o fluxo de consulta de placa: mantém a placa (mascarada), dispara a consulta
 * automaticamente ao completar uma placa válida e expõe o estado da máquina + ações
 * (`retry` = "Consultar de novo", `manual` = cadastro à mão, `reset` = voltar a digitar).
 */
export function usePlateLookupFlow() {
  const [plate, setPlateRaw] = React.useState("");
  const [state, dispatch] = React.useReducer(flowReducer, initialFlowState);
  const lookup = useLookupPlate();

  const runLookup = React.useCallback(async () => {
    const norm = normalizePlate(plate);
    if (!isValidPlateBR(norm)) return;
    dispatch({ type: "LOOKUP_START" });
    try {
      const res = await lookup.mutateAsync(norm);
      if (res.found && res.vehicle) {
        dispatch({ type: "LOOKUP_FOUND", vehicle: res.vehicle });
      } else {
        dispatch({ type: "LOOKUP_NOT_FOUND" });
      }
    } catch (err) {
      dispatch({
        type: "LOOKUP_ERROR",
        message: err instanceof Error ? err.message : "Falha ao consultar a placa.",
      });
    }
  }, [plate, lookup]);

  const setPlate = React.useCallback(
    (value: string) => {
      setPlateRaw(plateMask(value));
      // Ao mexer na placa, volta a digitar (descarta o resultado anterior).
      if (state.status !== "idle") dispatch({ type: "RESET" });
    },
    [state.status],
  );

  // Consulta automática assim que a placa fica válida e completa.
  React.useEffect(() => {
    if (shouldAutoLookup(normalizePlate(plate), state.status)) {
      void runLookup();
    }
  }, [plate, state.status, runLookup]);

  return {
    plate,
    setPlate,
    status: state.status,
    vehicle: state.vehicle,
    error: state.error,
    retry: runLookup,
    manual: React.useCallback(() => dispatch({ type: "MANUAL" }), []),
    reset: React.useCallback(() => {
      setPlateRaw("");
      dispatch({ type: "RESET" });
    }, []),
  };
}
