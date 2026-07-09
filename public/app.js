/* MEV Consulta — frontend */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const el = {
    consentimento: $("consentimento"),
    btnGravar: $("btn-gravar"),
    statusGravacao: $("status-gravacao"),
    indicadorEscuta: $("indicador-escuta"),
    tempoConsulta: $("tempo-consulta"),
    transcricao: $("transcricao"),
    btnAnalisar: $("btn-analisar"),
    btnPlano: $("btn-plano"),
    btnImprimir: $("btn-imprimir"),
    statusAnalise: $("status-analise"),
    resultados: $("resultados"),
    abas: $("abas"),
    conteudoAbas: $("conteudo-abas"),
  };

  let gravando = false;
  let reconhecimento = null;
  let ultimaAnalise = null;
  let ultimoPlano = null;
  let timerConsulta = null;
  let inicioConsulta = null;

  // -------------------------------------------------------------------------
  // Reconhecimento de voz (Web Speech API)
  // -------------------------------------------------------------------------

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function criarReconhecimento() {
    const rec = new SpeechRecognition();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;

    // A transcrição é acumulada em segundo plano — nada é exibido durante a consulta
    rec.onresult = (evento) => {
      for (let i = evento.resultIndex; i < evento.results.length; i++) {
        const resultado = evento.results[i];
        if (resultado.isFinal) {
          const texto = resultado[0].transcript.trim();
          const atual = el.transcricao.value;
          el.transcricao.value = atual + (atual && !atual.endsWith("\n") ? " " : "") + texto;
        }
      }
    };

    rec.onerror = (evento) => {
      if (evento.error === "not-allowed" || evento.error === "service-not-allowed") {
        pararGravacao();
        el.statusGravacao.textContent = "⛔ Acesso ao microfone negado. Verifique as permissões do navegador.";
      }
      // "no-speech" e "network" são recuperados pelo reinício automático em onend
    };

    // O navegador encerra sessões longas sozinho; reiniciamos enquanto o médico não parar
    rec.onend = () => {
      if (gravando) {
        try { rec.start(); } catch (_) { /* já reiniciando */ }
      }
    };

    return rec;
  }

  function atualizarTempo() {
    const s = Math.floor((Date.now() - inicioConsulta) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    el.tempoConsulta.textContent = `${mm}:${ss}`;
  }

  function iniciarGravacao() {
    if (!SpeechRecognition) {
      el.statusGravacao.textContent =
        "⛔ Este navegador não suporta reconhecimento de voz. Use Google Chrome ou Microsoft Edge.";
      return;
    }
    reconhecimento = criarReconhecimento();
    try {
      reconhecimento.start();
    } catch (e) {
      el.statusGravacao.textContent = "Erro ao iniciar o microfone: " + e.message;
      return;
    }
    gravando = true;
    inicioConsulta = Date.now();
    atualizarTempo();
    timerConsulta = setInterval(atualizarTempo, 1000);
    el.indicadorEscuta.hidden = false;
    el.btnGravar.textContent = "⏹️ Finalizar consulta e gerar resumo";
    el.btnGravar.classList.add("gravando");
    el.statusGravacao.textContent = "";
  }

  function pararGravacao() {
    gravando = false;
    if (reconhecimento) {
      reconhecimento.onend = null;
      try { reconhecimento.stop(); } catch (_) {}
      reconhecimento = null;
    }
    clearInterval(timerConsulta);
    timerConsulta = null;
    el.indicadorEscuta.hidden = true;
    el.btnGravar.textContent = "▶️ Iniciar consulta";
    el.btnGravar.classList.remove("gravando");
    el.statusGravacao.textContent = "Consulta finalizada.";
  }

  el.consentimento.addEventListener("change", () => {
    el.btnGravar.disabled = !el.consentimento.checked;
    if (el.consentimento.checked) {
      el.statusGravacao.textContent = "Pronto para iniciar a consulta.";
    } else {
      if (gravando) pararGravacao();
      el.statusGravacao.textContent = "Marque o consentimento para habilitar a escuta.";
      el.btnGravar.disabled = true;
    }
  });

  el.btnGravar.addEventListener("click", () => {
    if (gravando) {
      pararGravacao();
      // Pequena espera para o reconhecimento entregar o último trecho de fala,
      // então o resumo é gerado automaticamente
      el.statusAnalise.textContent = "Finalizando transcrição…";
      setTimeout(() => el.btnAnalisar.click(), 800);
    } else {
      iniciarGravacao();
    }
  });

  // -------------------------------------------------------------------------
  // Chamadas à API
  // -------------------------------------------------------------------------

  function coletarPaciente() {
    return {
      nome: $("pac-nome").value,
      idade: $("pac-idade").value,
      sexo: $("pac-sexo").value,
      "peso (kg)": $("pac-peso").value,
      "altura (cm)": $("pac-altura").value,
      "comorbidades/medicamentos/observações": $("pac-obs").value,
    };
  }

  async function postJson(url, corpo) {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.erro || `Erro ${resposta.status}`);
    return dados;
  }

  el.btnAnalisar.addEventListener("click", async () => {
    const transcricao = el.transcricao.value.trim();
    if (!transcricao) {
      el.statusAnalise.textContent = "⚠️ Grave ou digite a transcrição da consulta primeiro.";
      return;
    }
    if (gravando) pararGravacao();

    setOcupado(el.btnAnalisar, true, "Gerando resumo…");
    el.statusAnalise.textContent = "🧠 Gerando o resumo da consulta (pode levar até um minuto)…";
    try {
      ultimaAnalise = await postJson("/api/consulta/analisar", {
        transcricao,
        paciente: coletarPaciente(),
      });
      ultimoPlano = null;
      renderizarResultados();
      el.btnPlano.disabled = false;
      el.btnImprimir.hidden = false;
      el.statusAnalise.textContent = "✅ Resumo pronto. Revise cada aba antes de usar.";
    } catch (e) {
      el.statusAnalise.textContent = "⛔ " + e.message;
    } finally {
      setOcupado(el.btnAnalisar, false, "🧠 Gerar resumo da consulta");
    }
  });

  el.btnPlano.addEventListener("click", async () => {
    setOcupado(el.btnPlano, true, "Gerando plano…");
    el.statusAnalise.textContent = "🥗 Gerando plano de estilo de vida personalizado…";
    try {
      ultimoPlano = await postJson("/api/plano-estilo-vida", {
        transcricao: el.transcricao.value.trim(),
        paciente: coletarPaciente(),
        analise: ultimaAnalise,
      });
      renderizarResultados("plano");
      el.statusAnalise.textContent = "✅ Plano gerado. Revise e ajuste com o paciente.";
    } catch (e) {
      el.statusAnalise.textContent = "⛔ " + e.message;
    } finally {
      setOcupado(el.btnPlano, false, "🥗 Gerar plano de estilo de vida");
    }
  });

  el.btnImprimir.addEventListener("click", () => window.print());

  // Mostra qual IA está configurada (Claude ou modelo local via Ollama)
  fetch("/api/saude")
    .then((r) => r.json())
    .then((s) => {
      const badge = $("badge-ia");
      if (!badge) return;
      badge.hidden = false;
      if (s.provedor === "ollama") {
        badge.textContent = `IA local (Ollama · ${s.modelo})`;
      } else if (s.apiKeyConfigurada) {
        badge.textContent = `Claude (${s.modelo})`;
      } else {
        badge.textContent = "⚠️ IA não configurada — veja o README";
      }
    })
    .catch(() => {});

  function setOcupado(botao, ocupado, rotulo) {
    botao.disabled = ocupado;
    botao.textContent = rotulo;
  }

  // -------------------------------------------------------------------------
  // Renderização
  // -------------------------------------------------------------------------

  const esc = (t) =>
    String(t ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function lista(itens, vazio = "Nada registrado.") {
    if (!itens || !itens.length) return `<p class="vazio">${vazio}</p>`;
    return `<ul>${itens.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
  }

  const rotuloPrioridade = { rotina: "Rotina", prioritario: "Prioritário", urgente: "URGENTE" };
  const rotuloProb = { alta: "Alta", media: "Média", baixa: "Baixa" };

  function renderResumo(a) {
    const r = a.resumo || {};
    const bloco = (titulo, corpo) => `<div class="bloco"><h3>${titulo}</h3>${corpo}</div>`;
    return `
      ${bloco("Queixa principal", `<p>${esc(r.queixaPrincipal) || "—"}</p>`)}
      ${bloco("🤒 Sintomas", lista(r.sintomas, "Nenhum sintoma registrado."))}
      ${bloco("📜 Doenças prévias", lista(r.doencasPrevias, "Nenhuma doença prévia mencionada."))}
      ${bloco("💊 Medicamentos em uso", lista(r.medicamentosEmUso, "Nenhum medicamento em uso mencionado."))}
      ${bloco("🏠 Hábitos de vida", lista(r.habitosDeVida, "Não abordado."))}
      ${bloco("🤝 Metas acordadas na consulta", lista(r.metasAcordadas, "Nenhuma meta acordada registrada."))}
      ${(r.outrosTopicos || [])
        .map((t) => bloco(esc(t.titulo), `<p>${esc(t.conteudo)}</p>`))
        .join("")}
      ${a.alertas?.length ? `<div class="bloco alerta"><h3>⚠️ Alertas</h3>${lista(a.alertas)}</div>` : ""}
    `;
  }

  function renderExames(a) {
    const exames = a.exames || [];
    if (!exames.length) return `<p class="vazio">Nenhum exame identificado na consulta.</p>`;
    const linha = (e) => `
      <tr class="${e.prioridade === "urgente" ? "linha-urgente" : ""}">
        <td>${esc(e.nome)}${e.origem === "sugerido" ? ' <span class="tag tag-sugerido">sugerido pela IA</span>' : ""}</td>
        <td>${rotuloPrioridade[e.prioridade] || esc(e.prioridade)}</td>
        <td>${esc(e.justificativa)}</td>
      </tr>`;
    return `
      <table>
        <thead><tr><th>Exame</th><th>Prioridade</th><th>Justificativa</th></tr></thead>
        <tbody>${exames.map(linha).join("")}</tbody>
      </table>`;
  }

  function renderPrescricao(a) {
    const itens = a.prescricao || [];
    if (!itens.length) return `<p class="vazio">Nenhum item de prescrição ditado na consulta.</p>`;
    return `
      <div class="prescricao-doc">
        ${itens
          .map(
            (p, i) => `
          <div class="item-prescricao">
            <strong>${i + 1}. ${esc(p.medicamento)}</strong> — ${esc(p.dose)}, ${esc(p.via)}, ${esc(p.frequencia)}, ${esc(p.duracao)}.
            ${p.orientacoes ? `<div class="orientacao">↳ ${esc(p.orientacoes)}</div>` : ""}
          </div>`
          )
          .join("")}
      </div>
      <p class="dica">Confira dose, via e duração de cada item antes de assinar.</p>`;
  }

  function renderDiferencial(a) {
    const hipoteses = a.diagnosticoDiferencial || [];
    return `
      ${hipoteses
        .map(
          (h) => `
        <div class="bloco hipotese prob-${esc(h.probabilidade)}">
          <h3>${esc(h.hipotese)} <span class="tag">probabilidade ${rotuloProb[h.probabilidade] || esc(h.probabilidade)}</span></h3>
          <p>${esc(h.fundamentacao)}</p>
          ${h.examesConfirmatorios?.length ? `<p class="mini-titulo">Exames para confirmar/excluir:</p>${lista(h.examesConfirmatorios)}` : ""}
        </div>`
        )
        .join("") || `<p class="vazio">Sem hipóteses geradas.</p>`}
      <div class="bloco">
        <h3>Próximos passos sugeridos</h3>
        ${lista(a.proximosPassos)}
      </div>`;
  }

  function renderPlano(p) {
    if (!p) return `<p class="vazio">Clique em “Gerar plano de estilo de vida”.</p>`;
    const metas = (p.metasSmart || [])
      .map(
        (m, i) => `
      <div class="bloco meta">
        <h3>Meta ${i + 1}: ${esc(m.titulo)} <span class="tag">${m.prazoSemanas} semanas</span></h3>
        <dl class="smart">
          <dt>S — Específica</dt><dd>${esc(m.especifica)}</dd>
          <dt>M — Mensurável</dt><dd>${esc(m.mensuravel)}</dd>
          <dt>A — Atingível</dt><dd>${esc(m.atingivel)}</dd>
          <dt>R — Relevante</dt><dd>${esc(m.relevante)}</dd>
          <dt>T — Temporal</dt><dd>${esc(m.temporal)}</dd>
        </dl>
      </div>`
      )
      .join("");

    const cardapio = (p.dieta?.cardapioExemplo || [])
      .map((r) => `<tr><td>${esc(r.refeicao)}</td><td>${esc(r.horario)}</td><td>${esc(r.sugestao)}</td></tr>`)
      .join("");

    const semana = (p.exercicios?.planoSemanal || [])
      .map(
        (d) =>
          `<tr><td>${esc(d.dia)}</td><td>${esc(d.atividade)}</td><td>${d.duracaoMin} min</td><td>${esc(d.intensidade)}</td></tr>`
      )
      .join("");

    return `
      <h2 class="secao-plano">🎯 Metas SMART</h2>
      ${metas || '<p class="vazio">Sem metas geradas.</p>'}

      <h2 class="secao-plano">🥗 Dieta personalizada</h2>
      <div class="bloco"><h3>Orientações gerais</h3>${lista(p.dieta?.orientacoesGerais)}</div>
      <div class="bloco">
        <h3>Exemplo de cardápio</h3>
        <table><thead><tr><th>Refeição</th><th>Horário</th><th>Sugestão</th></tr></thead><tbody>${cardapio}</tbody></table>
      </div>
      <div class="duas-colunas">
        <div class="bloco ok"><h3>✅ Priorizar</h3>${lista(p.dieta?.alimentosPriorizar)}</div>
        <div class="bloco alerta"><h3>🚫 Evitar / reduzir</h3>${lista(p.dieta?.alimentosEvitar)}</div>
      </div>

      <h2 class="secao-plano">🏃 Plano de exercícios</h2>
      <div class="bloco"><h3>Orientações gerais</h3>${lista(p.exercicios?.orientacoesGerais)}</div>
      <div class="bloco">
        <h3>Plano semanal</h3>
        <table><thead><tr><th>Dia</th><th>Atividade</th><th>Duração</th><th>Intensidade</th></tr></thead><tbody>${semana}</tbody></table>
      </div>
      <div class="bloco alerta"><h3>⚠️ Precauções</h3>${lista(p.exercicios?.precaucoes)}</div>`;
  }

  function renderizarResultados(abaInicial) {
    const abas = [
      { id: "resumo", rotulo: "📋 Resumo", render: () => renderResumo(ultimaAnalise) },
      { id: "exames", rotulo: "🔬 Exames", render: () => renderExames(ultimaAnalise) },
      { id: "prescricao", rotulo: "💊 Prescrição", render: () => renderPrescricao(ultimaAnalise) },
      { id: "diferencial", rotulo: "🧩 Dx diferencial", render: () => renderDiferencial(ultimaAnalise) },
      { id: "plano", rotulo: "🎯 Estilo de vida", render: () => renderPlano(ultimoPlano) },
    ];

    el.resultados.hidden = false;
    el.abas.innerHTML = abas
      .map((a) => `<button type="button" class="aba" data-aba="${a.id}">${a.rotulo}</button>`)
      .join("");

    const abrir = (id) => {
      const aba = abas.find((a) => a.id === id) || abas[0];
      el.conteudoAbas.innerHTML = `<div class="painel" data-painel="${aba.id}">${aba.render()}</div>`;
      el.abas.querySelectorAll(".aba").forEach((b) =>
        b.classList.toggle("ativa", b.dataset.aba === aba.id)
      );
    };

    el.abas.querySelectorAll(".aba").forEach((b) =>
      b.addEventListener("click", () => abrir(b.dataset.aba))
    );
    abrir(abaInicial || "resumo");
    el.resultados.scrollIntoView({ behavior: "smooth", block: "start" });
  }
})();
