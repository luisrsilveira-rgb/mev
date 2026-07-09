# 🩺 MEV Consulta

Assistente de consultas médicas com foco em **medicina do estilo de vida**. O aplicativo:

- 🎙️ **Escuta o áudio ambiente** da consulta (médico + paciente) discretamente — nada é exibido durante o atendimento
- 📋 **Ao finalizar, resume automaticamente** por tópicos: queixa principal, sintomas, doenças prévias, medicamentos em uso, hábitos de vida e metas acordadas na consulta
- 📄 **Gera a anamnese em formato clínico** (QP, HDA, antecedentes, exame físico, hipóteses, conduta), pronta para copiar no prontuário eletrônico
- 🔬 **Separa os exames** conforme você dita ("vou solicitar hemograma…") e sugere exames complementares
- 💊 **Monta a prescrição** a partir do que você dita (medicamento, dose, via, frequência, duração)
- 🧩 **Diagnóstico diferencial** com IA (Claude **ou** modelo local gratuito via Ollama): hipóteses ordenadas por probabilidade, fundamentação e próximos passos
- 🎯 **Metas SMART** de mudança de hábitos, **dieta personalizada** e **plano de exercícios** adequados ao paciente

> ⚠️ **Aviso:** ferramenta de apoio à decisão clínica. Todo o conteúdo gerado deve ser revisado e validado pelo(a) médico(a) responsável. Não substitui o julgamento clínico.

## Requisitos

- Node.js 18+ (recomendado 22)
- Navegador **Google Chrome** ou **Microsoft Edge** (a transcrição usa a Web Speech API)
- Uma IA para análise — escolha **uma** das opções:
  - **Claude API** (paga, melhor qualidade clínica) — chave em [platform.claude.com](https://platform.claude.com/)
  - **Ollama** (grátis, modelo local no seu computador) — [ollama.com](https://ollama.com/)

## Como rodar

```bash
# 1. Instalar dependências
npm install

# 2. Configurar a IA
cp .env.example .env
# edite o .env e escolha a opção A ou B abaixo

# 3. Iniciar
npm start
```

Abra **http://localhost:3000** no Chrome/Edge e permita o acesso ao microfone. O cabeçalho da seção "Análise da consulta" mostra qual IA está ativa.

### Opção A — Claude (paga, recomendada)

No `.env`:

```env
IA_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-sua-chave
```

### Opção B — Ollama (grátis, 100% local)

1. Instale o Ollama: [ollama.com/download](https://ollama.com/download) (Windows, Mac ou Linux)
2. Baixe um modelo (uma única vez, ~5 GB):
   ```bash
   ollama pull llama3.1:8b
   ```
3. No `.env`:
   ```env
   IA_PROVIDER=ollama
   # OLLAMA_MODEL=llama3.1:8b   (padrão)
   ```

### Transcrição profissional do áudio (recomendado)

Por padrão o app usa o reconhecimento de voz do navegador, que é gratuito mas erra termos médicos. Para qualidade profissional (como os serviços comerciais de transcrição de consultas), ative o **Whisper via Groq — gratuito**:

1. Crie uma chave gratuita em [console.groq.com/keys](https://console.groq.com/keys)
2. No `.env`:
   ```env
   TRANSCRIBER=groq
   GROQ_API_KEY=gsk_sua-chave
   ```

Com isso, o app grava o áudio da consulta e o transcreve com o modelo `whisper-large-v3-turbo` ao finalizar — muito mais preciso para nomes de medicamentos, exames e termos clínicos. (Alternativa paga: `TRANSCRIBER=openai` com `OPENAI_API_KEY`.)

> Nota de privacidade: no modo `groq`/`openai`, o áudio da consulta é enviado ao serviço de transcrição escolhido. No modo `browser`, o áudio é processado pelo serviço de voz do próprio navegador (Google).

Com o Ollama, **nenhum dado da análise sai do seu computador** — a transcrição da consulta é analisada localmente, o que é um ganho de privacidade. Em compensação:

- ⚠️ Modelos locais pequenos (7–8B) têm **qualidade clínica bem inferior** ao Claude: hipóteses diagnósticas mais rasas, maior chance de erros e de itens inventados. Revise com atenção redobrada.
- Se seu computador aguentar (16 GB+ de RAM), `ollama pull qwen2.5:14b` e `OLLAMA_MODEL=qwen2.5:14b` melhoram bastante o resultado.
- Sem placa de vídeo, a análise pode levar alguns minutos.

## Fluxo de uso

1. **Paciente** — preencha nome/iniciais, idade, sexo, peso, altura e comorbidades/medicamentos.
2. **Consulta** — marque o consentimento do paciente e clique em *Iniciar consulta*. O app fica **apenas escutando** (um cronômetro discreto indica que está ativo — nenhum texto aparece na tela). Conduza a consulta normalmente e dite exames, prescrição e combinados de forma natural:
   - *"Vou solicitar hemograma completo, perfil lipídico e TSH."*
   - *"Prescrevo metformina 500 mg, via oral, duas vezes ao dia, uso contínuo, tomar junto às refeições."*
   - *"Então combinamos: caminhada 3 vezes por semana e dormir até as 23h."*
3. **Finalizar** — clique em *Finalizar consulta e gerar resumo*. O app gera automaticamente as abas **Resumo** (sintomas, doenças prévias, medicamentos em uso, hábitos, metas acordadas), **Prontuário** (anamnese clínica pronta para copiar), **Exames**, **Prescrição** e **Dx diferencial**. A transcrição fica disponível para conferência em "Ver/editar transcrição".
4. **Estilo de vida** — clique em *Gerar plano de estilo de vida* para as metas SMART, dieta e plano de exercícios personalizados.
5. **Imprimir/PDF** — imprime a aba ativa (útil para entregar o plano ao paciente).

## Arquitetura

| Camada | Tecnologia |
|---|---|
| Transcrição de voz | Web Speech API do navegador (pt-BR, contínua, com reinício automático) |
| Backend | Node.js + Express (`server.js`) |
| IA clínica | Claude API (`claude-opus-4-8`, structured outputs + adaptive thinking) **ou** Ollama local (`/api/chat` com `format` por JSON schema) |
| Frontend | HTML/CSS/JS puro, sem build |

### Endpoints

- `POST /api/consulta/analisar` — `{ transcricao, paciente }` → resumo, exames, prescrição, diagnóstico diferencial, próximos passos e alertas
- `POST /api/plano-estilo-vida` — `{ transcricao, paciente, analise }` → metas SMART, dieta e plano de exercícios
- `GET /api/saude` — status do servidor e configuração

## Privacidade e boas práticas

- Obtenha **consentimento do paciente** antes de gravar (o app exige marcar essa confirmação).
- O áudio **não é armazenado**: apenas o texto transcrito é enviado para análise (à API da Anthropic, ou a lugar nenhum se você usar Ollama local).
- Nenhum dado é persistido no servidor; cada análise é independente.
- Prefira identificar o paciente por **iniciais** para minimizar dados pessoais.

## Ideias de evolução

- Transcrição server-side com diarização (separar falas do médico e do paciente)
- Histórico de consultas com banco de dados e autenticação
- Modelos de prescrição/receituário no padrão do consultório
- Exportação estruturada para prontuário eletrônico
