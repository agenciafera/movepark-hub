import * as React from "react";
import type { FieldOption } from "./segmentBuilder.logic";

/** Opções que só se conhecem em tempo de execução, por chave de campo (os aeroportos). */
export const OpcoesDoSegmento = React.createContext<Record<string, FieldOption[]>>({});
