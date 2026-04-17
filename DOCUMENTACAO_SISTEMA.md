# TechSin - Documentação do Sistema

## Visão Geral

O **TechSin** é um sistema de gestão logística profissional para empresas de transporte e entregas. O sistema permite cadastrar motoristas, agendar entregas, acompanhar o status em tempo real e processar documentos fiscais automaticamente via OCR.

---

## Arquitetura do Sistema

### Componentes Principais

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     WEB         │────▶│      API        │────▶│       DB        │
│   (Frontend)    │     │   (Backend)     │     │  (PostgreSQL)   │
│    Nginx        │◀────│    Express      │◀────│                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │      OCR        │
                        │    (OpenAI)     │
                        │  GPT-4o Vision  │
                        └─────────────────┘
```

| Componente | Tecnologia | Função |
|------------|-----------|---------|
| **Web** | Nginx + React | Interface do usuário (painel admin + app motorista) |
| **API** | Express.js + TypeScript | Lógica de negócio, autenticação, processamento |
| **DB** | PostgreSQL 16 | Armazenamento de dados (motoristas, viagens, documentos) |
| **OCR** | OpenAI GPT-4o | Leitura automática de notas fiscais e comprovantes |

---

## Fluxo de Trabalho Completo

### 1. Cadastro Inicial

#### Administrador
1. Acesse o painel admin (`/admin/login`)
2. Faça login com credenciais de administrador
3. Cadastre os **motoristas** do sistema
4. Cadastre as **viagens** (rotas de entrega)
5. Associe motoristas às viagens

#### Motorista
1. Recebe link/código de acesso ao **App Motorista**
2. Faz login com telefone + senha
3. Visualiza suas viagens atribuídas

---

### 2. Fluxo de Entrega (App Motorista)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   VIAGEM    │───▶│  CHEGADA    │───▶│   FOTO      │───▶│   STATUS    │
│  INICIADA   │    │  DESTINO    │    │  DOCUMENTO  │    │  ATUALIZADO │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

#### Passo a Passo:

1. **Iniciar Viagem**
   - Motorista clica em "Iniciar Entrega"
   - Sistema registra hora de início
   - Status muda para: `EM_TRANSITO`

2. **Chegar ao Destino**
   - Motorista usa GPS para navegação
   - Ao chegar, clica em "Confirmar Chegada"
   - Sistema registra localização

3. **Capturar Documento**
   - Motorista tira foto da **Nota Fiscal** ou **Comprovante**
   - Sistema envia imagem para API
   - **OCR processa automaticamente**

4. **OCR - Leitura Automática**
   - API recebe imagem (base64)
   - OpenAI GPT-4o Vision analisa o documento
   - Extrai: Valor, CNPJ, Data, Endereço, Chave NF, Número NF
   - Status muda para: `ENTREGUE` (sucesso) ou `PENDENTE` (falha OCR)

5. **Finalização**
   - Se OCR funcionou: dados aparecem automaticamente no painel
   - Se OCR falhou: administrador insere dados manualmente

---

### 3. Fluxo do OCR (Detalhado)

```
┌─────────────────┐
│  Upload Imagem  │
│  /api/xmls/ocr  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Criar Registro │
│  (xmls table)   │
│  status=PENDING │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Extrair Dados  │
│  OpenAI GPT-4o  │
│  Vision API     │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│SUCESSO │ │  FALHA │
│        │ │        │
│status= │ │status= │
│ENTREGUE│ │PENDENTE│
│dados   │ │dados   │
│extraídos│ │manual  │
└────────┘ └────────┘
```

#### Como Funciona:

1. **Upload**: Motorista tira foto → App envia para `/api/xmls/ocr`
2. **Registro**: API crega registro na tabela `xmls` com status `PENDING`
3. **Processamento**: 
   - Imagem convertida para base64
   - Enviada para OpenAI GPT-4o Vision
   - Prompt especializado extrai dados fiscais
4. **Resposta**:
   - **Sucesso**: JSON com dados → Atualiza registro → Status `ENTREGUE`
   - **Falha**: Retorna erro → Mantém `PENDING` → Admin insere manual

#### Dados Extraídos:
- `valorTotal`: Valor da nota/comprovante
- `cnpj`: CNPJ do emitente/destinatário
- `dataDocumento`: Data de emissão
- `tipoDocumento`: nota_fiscal, canhoto, comprovante, outro
- `descricao`: Descrição do documento
- `enderecoEntrega`: Endereço completo
- `chaveAcesso`: Chave de acesso NF-e (44 dígitos)
- `numeroNF`: Número da nota fiscal

---

### 4. Painel Administrativo

#### Dashboard Principal
- **Resumo em tempo real**: Entregas hoje, pendentes, total
- **Atividade recente**: Últimas entregas processadas
- **Gráficos**: Desempenho por período

#### Gestão de Viagens
- Lista todas as viagens
- Filtros: Em trânsito, Entregues, Pendentes
- Visualiza documentos anexados
- Edita dados quando OCR falha

#### Gestão de Motoristas
- Cadastro de novos motoristas
- Histórico de entregas por motorista
- Status de atividade

---

## Status das Viagens

| Status | Descrição | Quando Ocorre |
|--------|-----------|---------------|
| `PENDENTE` | Aguardando início | Viagem criada, motorista não iniciou |
| `EM_TRANSITO` | Em andamento | Motorista clicou "Iniciar Entrega" |
| `ENTREGUE` | Concluída com sucesso | OCR funcionou ou dados inseridos manualmente |
| `PENDENTE_ANALISE` | Aguardando revisão | OCR falhou, dados incompletos |

---

## Dicas para Sucesso

### Para Administradores

1. **Cadastre viagens com antecedência**
   - Motoristas precisam ver as entregas no app

2. **Monitore o Dashboard**
   - Entregas "Pendentes de Análise" precisam atenção manual

3. **Verifique documentos**
   - Quando OCR falha, insira os dados corretos para fechar a viagem

4. **Configurações importantes** (arquivo `.env.docker`):
   ```
   RESEND_API_KEY=chave_email
   AI_INTEGRATIONS_OPENAI_API_KEY=chave_openai
   AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1
   ```

### Para Motoristas

1. **Fotos nítidas**
   - Evite sombras e reflexos
   - Capture todo o documento na tela
   - Certifique-se que o texto está legível

2. **Conexão estável**
   - Upload de imagens consome dados
   - Faça uploads em áreas com bom sinal

3. **Ordem correta**
   - Sempre: Iniciar → Chegar → Foto Documento

---

## Resolução de Problemas

### OCR Falhou (documento não lido automaticamente)

**Causas comuns:**
- Imagem borrada ou escura
- Documento dobrado/cortado
- API OpenAI indisponível
- Chave API expirada

**Solução:**
1. Administrador acessa painel
2. Encontra viagem com status "Pendente Análise"
3. Clica no documento
4. Insere manualmente: Valor, CNPJ, Data, etc.
5. Salva → Status muda para "Entregue"

### App não carrega viagens

**Verificar:**
- Motorista está logado corretamente?
- Viagem foi associada a este motorista?
- Data da viagem está correta?

### Sistema lento

**Verificar recursos:**
```bash
docker compose stats
```
- CPU/RAM do servidor
- Espaço em disco
- Conexão com internet

---

## Contato e Suporte

- **Documentação técnica**: `README.md`, `DIAGNOSTICO_OCR.md`
- **Deploy**: `README_DEPLOY.md`
- **Repositório**: GitHub

---

## Resumo do Fluxo em uma Linha

> **Admin cadastra** → **Motorista inicia** → **Chega ao destino** → **Tira foto** → **OCR lê automaticamente** → **Entrega registrada** → **Dashboard atualizado** ✅

---

*Sistema TechSin - Gestão Logística Profissional*
*Versão: 1.0 | Última atualização: 2026*
