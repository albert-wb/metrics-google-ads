# 📊 Google Ads Combo Report Script (Daily + Lifetime)

Este script para Google Ads automatiza o envio de relatórios de desempenho, gerando dois panoramas essenciais em uma única execução: **Resultados do Dia** e **Resultados Vitalícios (Lifetime)**.

O relatório é enviado diretamente para o e-mail configurado, contendo um resumo visual no corpo da mensagem e dois arquivos PDF anexados para fácil compartilhamento.

## 🚀 Funcionalidades

- **Relatório Combo:** Gera métricas de "Hoje" e "Todo o Período" separadamente.
- **Foco em Vídeo:** Inclui métricas de engajamento (CTR, Visualizações 25%, 50%, 75%, 100%).
- **Segmentação Detalhada:**
  - Desempenho por Campanha (Custo, Conversões, CPA, CTR).
  - Quebra por Dispositivos (Celular, Desktop, TV, Tablet).
  - Dados Demográficos (Conversões por Idade).
- **Filtros Inteligentes:**
  - Define um orçamento mínimo diário (ignora campanhas de teste/desativadas).
  - Filtra por texto no nome da campanha.
- **Entrega Premium:** Envia HTML formatado no corpo do e-mail + PDFs anexados.

## ⚙️ Configuração

No início do arquivo `script.js`, você encontrará o objeto de configuração. Ajuste conforme sua necessidade:

```javascript
var config = {
  // E-mails que receberão o relatório (separe por vírgula)
  email: "seuemail@exemplo.com", 
  
  // Rótulo para identificar a conta no Assunto (Ex: Cliente A, E72)
  accountLabel: "NOME_DA_CONTA",

  // Filtro: Orçamento diário mínimo para a campanha aparecer no relatório
  minBudget: 10,

  // Filtro: Texto obrigatório no nome da campanha (deixe vazio "" para pegar todas)
  campaignNameContains: "" 
};
