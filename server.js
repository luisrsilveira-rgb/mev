import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      const err = new Error(
        "ANTHROPIC_API_KEY não configurada. Crie um arquivo .env a partir do .env.example."
      );
      err.status = 500;
      throw err;
    }
    client = new Anthropic();
  }
  return client;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SYSTEM_BASE = `Você é um assistente clínico que apoia um(a) médico(a) durante e após consultas, com foco em medicina do estilo de vida.

Regras gerais:
- Todo o conteúdo é material de APOIO À DECISÃO CLÍNICA. A responsabilidade final é sempre do(a) médico(a), que revisará e validará tudo antes de usar.
- Escreva sempre em português do Brasil, com terminologia médica adequada.
- Baseie-se EXCLUSIVAMENTE no que consta na transcrição e nos dados do paciente fornecidos. Não invente achados, exames ou medicamentos que não foram mencionados ou que não decorram logicamente do quadro.
- A transcrição vem de reconhecimento de voz do áudio ambiente da consulta: pode conter erros de reconhecimento, trechos truncados e mistura das falas do médico e do paciente. Interprete com esse contexto e normalize nomes de medicamentos/exames óbvios (ex.: "raio xis de tórax" → "Radiografia de tórax").
- Se uma informação essencial estiver ausente ou ambígua, sinalize isso nos alertas em vez de presumir.`;

const SYSTEM_ANALISE = `${SYSTEM_BASE}

Sua tarefa agora: analisar a transcrição de uma consulta e produzir, no formato JSON solicitado:

1. RESUMO ESTRUTURADO — os tópicos mais importantes da consulta (queixa principal, história da doença atual, antecedentes relevantes, hábitos de vida, exame físico se citado, etc.). Só inclua tópicos que tenham conteúdo real na transcrição.

2. EXAMES — separe TODOS os exames que o(a) médico(a) ditou/solicitou durante a consulta (frases como "vou solicitar", "solicito", "pedir um", "vamos fazer um"). Se o quadro clínico sugerir exames adicionais úteis que NÃO foram ditados, inclua-os marcados com origem "sugerido".

3. PRESCRIÇÃO — monte os itens de prescrição a partir do que o(a) médico(a) ditou (medicamento, dose, via, frequência, duração, orientações). Não adicione medicamentos que não foram ditados. Se uma posologia ditada parecer incompleta ou atípica, preencha o que foi dito e registre a dúvida nos alertas.

4. DIAGNÓSTICO DIFERENCIAL — hipóteses diagnósticas compatíveis com o quadro, ordenadas da mais para a menos provável, cada uma com fundamentação clínica curta e exames que ajudariam a confirmar/excluir.

5. PRÓXIMOS PASSOS — condutas sugeridas (seguimento, encaminhamentos, orientações, reavaliação).

6. ALERTAS — red flags do quadro, interações medicamentosas potenciais, lacunas de informação importantes ou possíveis erros de transcrição que mereçam confirmação.`;

const SYSTEM_PLANO = `${SYSTEM_BASE}

Sua tarefa agora: com base na consulta e nos dados do paciente, criar um plano personalizado de mudança de estilo de vida, no formato JSON solicitado:

1. METAS SMART — 3 a 6 metas de mudança de hábito, cada uma decomposta em Específica, Mensurável, Atingível, Relevante e Temporal. As metas devem partir dos hábitos e problemas REAIS relatados na consulta (sono, alimentação, sedentarismo, tabagismo, álcool, estresse, etc.), começar em nível realista para o paciente e ter prazo definido em semanas.

2. DIETA PERSONALIZADA — orientações alimentares adequadas ao quadro clínico, comorbidades e preferências/restrições mencionadas; um exemplo de cardápio diário (refeições com horário e sugestões acessíveis à realidade brasileira); alimentos a priorizar e a evitar/reduzir.

3. PLANO DE EXERCÍCIOS — plano semanal progressivo compatível com condição física, idade e limitações do paciente, com dias, atividades, duração e intensidade; inclua precauções e critérios para interromper (ex.: dor torácica) e, quando pertinente, a recomendação de avaliação médica/liberação prévia.

Considere sempre o nível de prontidão para mudança que a conversa sugerir: metas pequenas e progressivas aderem melhor que planos ambiciosos.`;

// ---------------------------------------------------------------------------
// JSON Schemas (structured outputs)
// ---------------------------------------------------------------------------

const s = {
  str: { type: "string" },
  arrStr: { type: "array", items: { type: "string" } },
  obj(properties) {
    return {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    };
  },
  arr(item) {
    return { type: "array", items: item };
  },
};

const SCHEMA_ANALISE = s.obj({
  resumo: s.obj({
    queixaPrincipal: s.str,
    topicos: s.arr(s.obj({ titulo: s.str, conteudo: s.str })),
  }),
  exames: s.arr(
    s.obj({
      nome: s.str,
      origem: { type: "string", enum: ["ditado", "sugerido"] },
      justificativa: s.str,
      prioridade: { type: "string", enum: ["rotina", "prioritario", "urgente"] },
    })
  ),
  prescricao: s.arr(
    s.obj({
      medicamento: s.str,
      dose: s.str,
      via: s.str,
      frequencia: s.str,
      duracao: s.str,
      orientacoes: s.str,
    })
  ),
  diagnosticoDiferencial: s.arr(
    s.obj({
      hipotese: s.str,
      probabilidade: { type: "string", enum: ["alta", "media", "baixa"] },
      fundamentacao: s.str,
      examesConfirmatorios: s.arrStr,
    })
  ),
  proximosPassos: s.arrStr,
  alertas: s.arrStr,
});

const SCHEMA_PLANO = s.obj({
  metasSmart: s.arr(
    s.obj({
      titulo: s.str,
      especifica: s.str,
      mensuravel: s.str,
      atingivel: s.str,
      relevante: s.str,
      temporal: s.str,
      prazoSemanas: { type: "integer" },
    })
  ),
  dieta: s.obj({
    orientacoesGerais: s.arrStr,
    cardapioExemplo: s.arr(
      s.obj({ refeicao: s.str, horario: s.str, sugestao: s.str })
    ),
    alimentosPriorizar: s.arrStr,
    alimentosEvitar: s.arrStr,
  }),
  exercicios: s.obj({
    orientacoesGerais: s.arrStr,
    planoSemanal: s.arr(
      s.obj({
        dia: s.str,
        atividade: s.str,
        duracaoMin: { type: "integer" },
        intensidade: { type: "string", enum: ["leve", "moderada", "vigorosa"] },
      })
    ),
    precaucoes: s.arrStr,
  }),
});

// ---------------------------------------------------------------------------
// Claude helper
// ---------------------------------------------------------------------------

function montarContexto({ paciente = {}, transcricao = "", analiseAnterior = null }) {
  const partes = [];
  const dados = Object.entries(paciente)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  if (dados) partes.push(`## Dados do paciente\n${dados}`);
  if (transcricao.trim()) {
    partes.push(`## Transcrição da consulta (áudio ambiente, pode conter erros)\n${transcricao.trim()}`);
  }
  if (analiseAnterior) {
    partes.push(`## Análise clínica já realizada desta consulta\n${JSON.stringify(analiseAnterior, null, 2)}`);
  }
  return partes.join("\n\n");
}

async function chamarClaude({ system, schema, userContent }) {
  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema },
    },
    system,
    messages: [{ role: "user", content: userContent }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    const err = new Error("A análise foi recusada pelo modelo. Revise o conteúdo enviado.");
    err.status = 422;
    throw err;
  }
  if (message.stop_reason === "max_tokens") {
    const err = new Error("A resposta excedeu o limite de tokens. Tente uma transcrição menor.");
    err.status = 422;
    throw err;
  }

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock) {
    const err = new Error("O modelo não retornou conteúdo.");
    err.status = 502;
    throw err;
  }
  return JSON.parse(textBlock.text);
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

app.post("/api/consulta/analisar", async (req, res) => {
  try {
    const { transcricao, paciente } = req.body || {};
    if (!transcricao || !transcricao.trim()) {
      return res.status(400).json({ erro: "Transcrição vazia. Grave ou digite a consulta antes de analisar." });
    }
    const resultado = await chamarClaude({
      system: SYSTEM_ANALISE,
      schema: SCHEMA_ANALISE,
      userContent: montarContexto({ paciente, transcricao }),
    });
    res.json(resultado);
  } catch (e) {
    console.error("Erro em /api/consulta/analisar:", e);
    res.status(e.status || 500).json({ erro: e.message || "Erro interno ao analisar a consulta." });
  }
});

app.post("/api/plano-estilo-vida", async (req, res) => {
  try {
    const { transcricao, paciente, analise } = req.body || {};
    if ((!transcricao || !transcricao.trim()) && !analise) {
      return res.status(400).json({ erro: "É necessário enviar a transcrição ou a análise da consulta." });
    }
    const resultado = await chamarClaude({
      system: SYSTEM_PLANO,
      schema: SCHEMA_PLANO,
      userContent: montarContexto({ paciente, transcricao, analiseAnterior: analise }),
    });
    res.json(resultado);
  } catch (e) {
    console.error("Erro em /api/plano-estilo-vida:", e);
    res.status(e.status || 500).json({ erro: e.message || "Erro interno ao gerar o plano." });
  }
});

app.get("/api/saude", (req, res) => {
  res.json({ ok: true, modelo: MODEL, apiKeyConfigurada: Boolean(process.env.ANTHROPIC_API_KEY) });
});

app.listen(PORT, () => {
  console.log(`MEV Consulta rodando em http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("⚠️  ANTHROPIC_API_KEY não configurada — as análises de IA não funcionarão até configurá-la (veja .env.example).");
  }
});
