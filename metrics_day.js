var config = {
  // Coloque seu email aqui
  email: "alertascontingencia@gmail.com", 
  
  // Rótulo para identificar a conta no Assunto
  accountLabel: "E72",

  // Filtro 1: Orçamento diário mínimo (ex: 10)
  minBudget: 10,

  // Filtro 2: Texto que deve conter no nome da campanha (deixe vazio para todas)
  campaignNameContains: "" 
};

function main() {
  var accountName = AdsApp.currentAccount().getName();
  var timeZone = AdsApp.currentAccount().getTimeZone();
  
  // Define o intervalo para HOJE
  var dateCondition = "segments.date DURING TODAY";
  
  // 1. Pega dados Gerais e Detalhados (Diário)
  var fullData = getAccountAndCampaignData(dateCondition);
  var generalData = fullData.totals;
  var campaignsList = fullData.campaigns;
  
  var validCampaignIds = campaignsList.map(function(c) { return c.id; });
  
  // 2. Pega segmentações (Diário)
  var deviceData = getDeviceStats(dateCondition);
  var ageData = getAgeStats(validCampaignIds, dateCondition);
  
  // 3. Monta o HTML
  var dateString = Utilities.formatDate(new Date(), timeZone, 'dd/MM/yyyy');
  var subject = `[${config.accountLabel}] Resumo do Dia: ${accountName} - ${dateString}`;
  
  var body = buildHtmlReport(accountName, generalData, deviceData, ageData, campaignsList, dateString);
  
  // 4. Converte e Envia
  var pdfBlob = Utilities.newBlob(body, 'text/html', subject + ".html").getAs('application/pdf');
  pdfBlob.setName(`Relatorio_Diario_${config.accountLabel}_${dateString.replace(/\//g, '-')}.pdf`);
  
  MailApp.sendEmail({
    to: config.email,
    subject: subject,
    htmlBody: body,
    attachments: [pdfBlob]
  });
  
  Logger.log("Relatório Diário enviado para " + config.email);
}

// --- FUNÇÃO 1: GERAL E CAMPANHAS ---
function getAccountAndCampaignData(dateCondition) {
  var minMicros = config.minBudget * 1000000;
  var nameFilter = config.campaignNameContains ? `AND campaign.name LIKE '%${config.campaignNameContains}%'` : "";

  var query = `
    SELECT 
      campaign.id,
      campaign.name,
      campaign_budget.amount_micros,
      metrics.cost_micros, 
      metrics.conversions, 
      metrics.clicks,
      metrics.impressions,
      metrics.video_quartile_p25_rate,
      metrics.video_quartile_p50_rate,
      metrics.video_quartile_p75_rate,
      metrics.video_quartile_p100_rate
    FROM campaign
    WHERE ${dateCondition}
    AND campaign.status = 'ENABLED'
    AND campaign_budget.amount_micros > ${minMicros}
    ${nameFilter}
    ORDER BY metrics.cost_micros DESC
  `;
  
  var rows = AdsApp.search(query);
  
  var totals = {
    cost: 0, conversions: 0, clicks: 0, impressions: 0,
    v25: 0, v50: 0, v75: 0, v100: 0,
    cpm: 0, cpc: 0, ctr: 0, cpa: 0
  };
  
  var campaignList = [];
  var weighted25 = 0, weighted50 = 0, weighted75 = 0, weighted100 = 0;
  
  while (rows.hasNext()) {
    var row = rows.next();
    var m = row.metrics;
    
    var campStats = {
      id: row.campaign.id,
      name: row.campaign.name,
      budget: row.campaignBudget.amountMicros / 1000000,
      cost: m.costMicros / 1000000,
      conversions: m.conversions,
      clicks: m.clicks,
      impressions: m.impressions,
      ctr: m.ctr, 
      v25: m.videoQuartileP25Rate,
      v50: m.videoQuartileP50Rate,
      v75: m.videoQuartileP75Rate,
      v100: m.videoQuartileP100Rate,
      cpa: 0
    };
    campStats.cpa = campStats.conversions > 0 ? (campStats.cost / campStats.conversions) : 0;
    
    campaignList.push(campStats);

    // Acumula Totais
    totals.cost += parseInt(m.costMicros);
    totals.conversions += parseFloat(m.conversions);
    totals.clicks += parseInt(m.clicks);
    totals.impressions += parseInt(m.impressions);

    var imps = parseInt(m.impressions);
    if (imps > 0 && m.videoQuartileP25Rate !== undefined) {
      weighted25 += (m.videoQuartileP25Rate * imps);
      weighted50 += (m.videoQuartileP50Rate * imps);
      weighted75 += (m.videoQuartileP75Rate * imps);
      weighted100 += (m.videoQuartileP100Rate * imps);
    }
  }
  
  if (totals.impressions > 0) {
    totals.ctr = totals.clicks / totals.impressions;
    totals.cpm = (totals.cost / totals.impressions) * 1000;
    totals.v25 = weighted25 / totals.impressions;
    totals.v50 = weighted50 / totals.impressions;
    totals.v75 = weighted75 / totals.impressions;
    totals.v100 = weighted100 / totals.impressions;
  }
  
  if (totals.clicks > 0) totals.cpc = totals.cost / totals.clicks;
  totals.cost = totals.cost / 1000000;
  totals.cpm = totals.cpm / 1000000;
  totals.cpc = totals.cpc / 1000000;
  totals.cpa = totals.conversions > 0 ? (totals.cost / totals.conversions) : 0;
  
  return { totals: totals, campaigns: campaignList };
}

// --- FUNÇÃO 2: DISPOSITIVOS ---
function getDeviceStats(dateCondition) {
  var minMicros = config.minBudget * 1000000;
  var nameFilter = config.campaignNameContains ? `AND campaign.name LIKE '%${config.campaignNameContains}%'` : "";

  var query = `
    SELECT segments.device, metrics.cost_micros, metrics.conversions
    FROM campaign
    WHERE ${dateCondition}
    AND campaign.status = 'ENABLED'
    AND campaign_budget.amount_micros > ${minMicros}
    ${nameFilter}
  `;
  
  var rows = AdsApp.search(query);
  var aggregator = {}; 
  
  while (rows.hasNext()) {
    var row = rows.next();
    var dev = row.segments.device;
    var cost = parseInt(row.metrics.costMicros);
    var conv = parseFloat(row.metrics.conversions);

    if (!aggregator[dev]) { aggregator[dev] = { cost: 0, conversions: 0 }; }
    aggregator[dev].cost += cost;
    aggregator[dev].conversions += conv;
  }
  
  var data = [];
  for (var key in aggregator) {
    data.push({
      device: key,
      cost: aggregator[key].cost / 1000000,
      conversions: aggregator[key].conversions
    });
  }
  data.sort((a, b) => b.cost - a.cost);
  return data;
}

// --- FUNÇÃO 3: IDADE ---
function getAgeStats(validIds, dateCondition) {
  var query = `
     SELECT campaign.id, ad_group_criterion.age_range.type, metrics.conversions
     FROM age_range_view
     WHERE ${dateCondition}
     AND campaign.status = 'ENABLED'
     ORDER BY metrics.conversions DESC
  `;
  
  var rows = AdsApp.search(query);
  var dataMap = {};
  
  while (rows.hasNext()) {
    var row = rows.next();
    var campId = row.campaign.id;
    var isValid = validIds.indexOf(campId) > -1 || validIds.indexOf(String(campId)) > -1;
    
    if (isValid && row.adGroupCriterion && row.adGroupCriterion.ageRange) {
        var label = row.adGroupCriterion.ageRange.type.replace("AGE_RANGE_", "").replace("_", "-");
        if (!dataMap[label]) dataMap[label] = 0;
        dataMap[label] += row.metrics.conversions;
    }
  }
  
  var data = [];
  for (var key in dataMap) {
    data.push({ age: key, conversions: dataMap[key] });
  }
  data.sort((a, b) => b.conversions - a.conversions);
  return data;
}

// --- MONTADOR DE HTML ---
function buildHtmlReport(accountName, gen, devices, ages, campaigns, dateString) {
  var styleTh = 'background-color: #f1f3f4; padding: 8px; border: 1px solid #ddd; text-align: left;';
  var styleTd = 'padding: 8px; border: 1px solid #ddd;';
  var styleTable = 'width: 100%; border-collapse: collapse; margin-bottom: 20px; font-family: Arial, sans-serif; font-size: 13px;';
  
  var toMoney = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: AdsApp.currentAccount().getCurrencyCode() });
  var toPct = (val) => (val ? (val * 100).toFixed(2) + "%" : "-");

  var html = `<div style="font-family: Arial, sans-serif; color: #333;">
    <h2 style="font-family: Arial; border-bottom: 2px solid #4285f4; padding-bottom: 10px;">
      <span style="background-color: #4285f4; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; vertical-align: middle;">${config.accountLabel}</span>
      Relatório Diário: ${accountName}
    </h2>
    <p style="font-size:12px; color: #666;">
       <b>Data:</b> ${dateString}<br>
       Filtros: Status=Ativo, Orçamento > ${toMoney(config.minBudget)}
       ${config.campaignNameContains ? `, Nome contém "${config.campaignNameContains}"` : ""}
    </p>`;
  
  // 1. KPI CARDS
  html += `<h3>📊 Visão Geral (Hoje)</h3>
  <table style="${styleTable}">
    <tr style="background-color: #202124; color: white;">
      <th style="padding:10px;">Custo Total</th>
      <th style="padding:10px;">Conversões</th>
      <th style="padding:10px;">CPA Global</th>
      <th style="padding:10px;">CPC / CPM</th>
    </tr>
    <tr>
      <td style="${styleTd} font-size:16px;"><b>${toMoney(gen.cost)}</b></td>
      <td style="${styleTd} font-size:16px;"><b>${gen.conversions}</b></td>
      <td style="${styleTd} font-size:16px;"><b>${toMoney(gen.cpa)}</b></td>
      <td style="${styleTd}">CPC: ${toMoney(gen.cpc)}<br>CPM: ${toMoney(gen.cpm)}</td>
    </tr>
  </table>`;

  // 2. VIDEO
  html += `<h3>📹 Engajamento Médio (Hoje)</h3>
  <table style="${styleTable}">
    <tr><th style="${styleTh}">CTR</th><th style="${styleTh}">25%</th><th style="${styleTh}">50%</th><th style="${styleTh}">75%</th><th style="${styleTh}">100%</th></tr>
    <tr>
      <td style="${styleTd}"><b>${toPct(gen.ctr)}</b></td>
      <td style="${styleTd}">${toPct(gen.v25)}</td>
      <td style="${styleTd}">${toPct(gen.v50)}</td>
      <td style="${styleTd}">${toPct(gen.v75)}</td>
      <td style="${styleTd}">${toPct(gen.v100)}</td>
    </tr>
  </table>`;

  // 3. TABELA DETALHADA
  html += `<h3>🚀 Desempenho por Campanha (Hoje)</h3>
  <table style="${styleTable}">
    <tr style="background-color: #e8eaed;">
        <th style="${styleTh}">Campanha</th>
        <th style="${styleTh}">Custo</th>
        <th style="${styleTh}">Conv.</th>
        <th style="${styleTh}">CPA</th>
        <th style="${styleTh}">CTR</th>
    </tr>`;
    
  if (campaigns && campaigns.length > 0) {
      campaigns.forEach(c => {
          html += `<tr>
            <td style="${styleTd}"><b>${c.name}</b></td>
            <td style="${styleTd}">${toMoney(c.cost)}</td>
            <td style="${styleTd}">${c.conversions}</td>
            <td style="${styleTd}">${toMoney(c.cpa)}</td>
            <td style="${styleTd}">${toPct(c.ctr)}</td>
          </tr>`;
      });
  } else {
      html += `<tr><td colspan="5" style="${styleTd}">Nenhuma campanha encontrada com gastos hoje.</td></tr>`;
  }
  html += `</table>`;

  // 4. LATERAIS
  html += `<table style="width:100%; border:none;"><tr><td style="vertical-align:top; width:50%; padding-right:10px;">`;
  
  html += `<h3>📱 Dispositivos</h3>
  <table style="${styleTable}">
    <tr style="background-color: #e8eaed;"><th style="${styleTh}">Device</th><th style="${styleTh}">Custo</th><th style="${styleTh}">Conv.</th></tr>`;
  devices.forEach(d => {
    html += `<tr><td style="${styleTd}">${d.device}</td><td style="${styleTd}">${toMoney(d.cost)}</td><td style="${styleTd}">${d.conversions}</td></tr>`;
  });
  html += `</table>`;

  html += `</td><td style="vertical-align:top; width:50%; padding-left:10px;">`;

  html += `<h3>🎂 Idade (Conv.)</h3>
  <table style="${styleTable}">
    <tr style="background-color: #e8eaed;"><th style="${styleTh}">Idade</th><th style="${styleTh}">Conv.</th></tr>`;
  if (ages.length > 0) {
    ages.forEach(a => {
      html += `<tr><td style="${styleTd}">${a.age}</td><td style="${styleTd}">${a.conversions}</td></tr>`;
    });
  } else {
    html += `<tr><td colspan="2" style="${styleTd}">Sem dados.</td></tr>`;
  }
  html += `</table>`;
  
  html += `</td></tr></table></div>`;

  return html;
}
