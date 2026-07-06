# 🩺 MEV Consulta

Assistente de consultas médicas com foco em **medicina do estilo de vida**. O aplicativo:

- 🎙️ **Capta o áudio ambiente** da consulta (médico + paciente) e transcreve em tempo real (pt-BR)
- 📋 **Resume a consulta** nos tópicos mais importantes (queixa principal, história, antecedentes, hábitos…)
- 🔬 **Separa os exames** conforme você dita ("vou solicitar hemograma…") e sugere exames complementares
- 💊 **Monta a prescrição** a partir do que você dita (medicamento, dose, via, frequência, duração)
- 🧩 **Diagnóstico diferencial** com IA (Claude): hipóteses ordenadas por probabilidade, fundamentação e próximos passos
- 🎯 **Metas SMART** de mudança de hábitos, **dieta personalizada** e **plano de exercícios** adequados ao paciente

> ⚠️ **Aviso:** ferramenta de apoio à decisão clínica. Todo o conteúdo gerado deve ser revisado e validado pelo(a) médico(a) responsável. Não substitui o julgamento clínico.

## Requisitos

- Node.js 18+ (recomendado 22)
- Chave da API da Anthropic ([platform.claude.com](https://platform.claude.com/))
- Navegador **Google Chrome** ou **Microsoft Edge** (a transcrição usa a Web Speech API)

## Como rodar

```bash
# 1. Instalar dependências
npm install

# 2. Configurar a chave da API
cp .env.example .env
# edite o .env e cole sua ANTHROPIC_API_KEY

# 3. Iniciar
npm start
```

Abra **http://localhost:3000** no Chrome/Edge e permita o acesso ao microfone.

## Fluxo de uso

1. **Paciente** — preencha nome/iniciais, idade, sexo, peso, altura e comorbidades/medicamentos.
2. **Consulta** — marque o consentimento do paciente, clique em *Iniciar gravação* e conduza a consulta normalmente. Dite exames e prescrição de forma natural:
   - *"Vou solicitar hemograma completo, perfil lipídico e TSH."*
   - *"Prescrevo metformina 500 mg, via oral, duas vezes ao dia, uso contínuo, tomar junto às refeições."*
3. **Analisar** — pare a gravação, revise/edite a transcrição e clique em *Analisar consulta*. O app gera as abas **Resumo**, **Exames**, **Prescrição** e **Dx diferencial**.
4. **Estilo de vida** — clique em *Gerar plano de estilo de vida* para as metas SMART, dieta e plano de exercícios personalizados.
5. **Imprimir/PDF** — imprime a aba ativa (útil para entregar o plano ao paciente).

## Arquitetura

| Camada | Tecnologia |
|---|---|
| Transcrição de voz | Web Speech API do navegador (pt-BR, contínua, com reinício automático) |
| Backend | Node.js + Express (`server.js`) |
| IA clínica | Claude API (`claude-opus-4-8`) com *structured outputs* (JSON garantido por schema) e *adaptive thinking* |
| Frontend | HTML/CSS/JS puro, sem build |

### Endpoints

- `POST /api/consulta/analisar` — `{ transcricao, paciente }` → resumo, exames, prescrição, diagnóstico diferencial, próximos passos e alertas
- `POST /api/plano-estilo-vida` — `{ transcricao, paciente, analise }` → metas SMART, dieta e plano de exercícios
- `GET /api/saude` — status do servidor e configuração

## Privacidade e boas práticas

- Obtenha **consentimento do paciente** antes de gravar (o app exige marcar essa confirmação).
- O áudio **não é armazenado**: apenas o texto transcrito é enviado à API da Anthropic para análise.
- Nenhum dado é persistido no servidor; cada análise é independente.
- Prefira identificar o paciente por **iniciais** para minimizar dados pessoais.

## Ideias de evolução

- Transcrição server-side com diarização (separar falas do médico e do paciente)
- Histórico de consultas com banco de dados e autenticação
- Modelos de prescrição/receituário no padrão do consultório
- Exportação estruturada para prontuário eletrônico
