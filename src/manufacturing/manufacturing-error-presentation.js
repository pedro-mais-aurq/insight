const DEFAULT_PRESENTATION = Object.freeze({
  title: "Não conseguimos concluir automaticamente a estimativa",
  description: "Você ainda pode solicitar uma análise personalizada com as informações já obtidas.",
  action: "Consultar a Insight no WhatsApp",
  kind: "automatic_estimate"
});

const PRESENTATIONS = Object.freeze({
  SLICER_UNAVAILABLE: Object.freeze({
    title: "A estimativa automática está temporariamente indisponível",
    description: "Seu arquivo e a análise continuam disponíveis para uma avaliação personalizada.",
    action: "Consultar a Insight no WhatsApp",
    kind: "availability"
  }),
  SLICER_TIMEOUT: Object.freeze({
    title: "O cálculo automático demorou mais que o esperado",
    description: "Este modelo ainda pode ser avaliado diretamente pela Insight.",
    action: "Consultar a Insight no WhatsApp",
    kind: "availability"
  }),
  WORKER_BUSY: Object.freeze({
    title: "A estimativa automática está ocupada no momento",
    description: "Tente novamente ou envie os dados já analisados para a Insight.",
    action: "Consultar a Insight no WhatsApp",
    kind: "availability"
  }),
  MODEL_OUTSIDE_BUILD_VOLUME: Object.freeze({
    title: "Este modelo excede o limite suportado pela estimativa automática",
    description: "Isso não significa que a peça não possa ser produzida. Consulte a Insight para avaliar divisão, escala ou outra configuração.",
    action: "Solicitar análise personalizada",
    kind: "automatic_capacity"
  }),
  MODEL_TOO_COMPLEX: Object.freeze({
    title: "Este modelo precisa de uma avaliação personalizada",
    description: "A complexidade do arquivo ultrapassou o processamento automático disponível.",
    action: "Consultar a Insight no WhatsApp",
    kind: "automatic_capacity"
  }),
  MODEL_NOT_SLICEABLE: Object.freeze({
    title: "Não foi possível preparar este modelo automaticamente",
    description: "A Insight pode avaliar o arquivo e orientar os próximos ajustes.",
    action: "Consultar a Insight no WhatsApp",
    kind: "model"
  }),
  MANUFACTURING_PROFILE_UNAVAILABLE: Object.freeze({
    title: "A estimativa automática está temporariamente indisponível",
    description: "O perfil de cálculo não está disponível agora, mas o atendimento personalizado continua acessível.",
    action: "Consultar a Insight no WhatsApp",
    kind: "availability"
  }),
  ORCA_SLICING_ERROR: DEFAULT_PRESENTATION,
  ORCA_NO_SUITABLE_OBJECTS: DEFAULT_PRESENTATION,
  ORCA_PROCESS_CRASH: DEFAULT_PRESENTATION,
  ORCA_FILE_VERSION_UNSUPPORTED: Object.freeze({
    title: "Esta versão do arquivo precisa de uma avaliação personalizada",
    description: "Não conseguimos concluir o cálculo automático com a estrutura recebida.",
    action: "Consultar a Insight no WhatsApp",
    kind: "model"
  }),
  SLICER_PROFILE_MISMATCH: DEFAULT_PRESENTATION,
  SLICER_PROFILE_INVALID: DEFAULT_PRESENTATION,
  SLICER_OUTPUT_INVALID: DEFAULT_PRESENTATION,
  SLICER_DOWNLOAD_FAILED: Object.freeze({
    title: "Não conseguimos acessar o modelo para calcular a estimativa",
    description: "Tente novamente ou solicite uma avaliação personalizada.",
    action: "Consultar a Insight no WhatsApp",
    kind: "availability"
  }),
  RATE_LIMITED: Object.freeze({
    title: "Muitas estimativas foram solicitadas em pouco tempo",
    description: "Aguarde um momento antes de tentar novamente ou fale com a Insight.",
    action: "Consultar a Insight no WhatsApp",
    kind: "availability"
  })
});

export function getManufacturingErrorPresentation(code) {
  return PRESENTATIONS[code] ?? DEFAULT_PRESENTATION;
}

export { DEFAULT_PRESENTATION as MANUFACTURING_DEFAULT_PRESENTATION };
