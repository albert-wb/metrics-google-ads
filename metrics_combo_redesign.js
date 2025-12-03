var config = {
  email: "alertascontingencia@gmail.com", 
  accountLabel: "E2A06",
  minBudget: 10,
  campaignNameContains: "" 
};

function main() {
  var accountName = AdsApp.currentAccount().getName();
  var timeZone = AdsApp.currentAccount().getTimeZone();
  var dateString = Utilities.formatDate(new Date(), timeZone, 'dd/MM/yyyy');
  var todayYMD = Utilities.formatDate(new Date(), timeZone, 'yyyy-MM-dd');

  // --- PARTE 1: GERAR RELATÓRIO DIÁRIO ---
  Logger.log("Gerando dados diários...");
  var conditionDay = "segments.date DURING TODAY";
  var htmlDay = generateReportContent(accountName, conditionDay, "DIÁRIO", dateString);
  var pdfDay = generatePDFScroll(htmlDay, "Diario");
  pdfDay.setName(`Diario_${config.accountLabel}_${dateString.replace(/\//g, '-')}.pdf`);

  // --- PARTE 2: GERAR RELATÓRIO VITALÍCIO ---
  Logger.log("Gerando dados vitalícios...");
  var conditionLife = `segments.date BETWEEN '2000-01-01' AND '${todayYMD}'`;
  var htmlLife = generateReportContent(accountName, conditionLife, "VITALÍCIO", `Todo o Histórico (Até ${dateString})`);
  var pdfLife = generatePDFScroll(htmlLife, "Vitalicio");
  pdfLife.setName(`Vitalicio_${config.accountLabel}_${dateString.replace(/\//g, '-')}.pdf`);

  // --- PARTE 3: ENVIAR EMAIL COM OS DOIS ANEXOS E CONTEÚDO VISUAL ---
  var subject = `[${config.accountLabel}] Relatórios Combo: ${accountName} - ${dateString}`;
  
  var combinedBody = getEmailHeader(dateString) + 
                     htmlDay + 
                     '<div style="border-top: 3px solid #e0e0e0; margin: 50px 0; height: 1px;"></div>' + 
                     htmlLife +
                     getEmailFooter();

  MailApp.sendEmail({
    to: config.email,
    subject: subject,
    htmlBody: combinedBody,
    attachments: [pdfDay, pdfLife]
  });
  
  Logger.log("E-mail combo enviado para " + config.email);
}

// --- CABEÇALHO DO EMAIL ---
function getEmailHeader(dateString) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f5; }
    .email-container { max-width: 100%; width: 100%; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; word-wrap: break-word; }
    .header p { margin: 10px 0 0 0; font-size: 14px; opacity: 0.9; }
    .content { padding: 20px; }
    @media (max-width: 600px) {
      .content { padding: 15px; }
      .header { padding: 20px 15px; }
      .header h1 { font-size: 20px; }
    }
  </style>
</head>
<body>
<div class="email-container">
  <div class="header">
    <h1>📊 Relatórios de Performance</h1>
    <p>Relatório Combo - ${dateString}</p>
  </div>
  <div class="content">`;
}

// --- RODAPÉ DO EMAIL ---
function getEmailFooter() {
  return `
  </div>
  <div style="background-color: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0; font-size: 12px; color: #666;">
    <p style="margin: 0;">Este é um relatório automático gerado pelo Google Ads Script.</p>
    <p style="margin: 5px 0 0 0;">📎 Confira os PDFs anexados para mais detalhes.</p>
  </div>
</div>
</body>
</html>`;
}

// --- ORQUESTRADOR DE CONTEÚDO ---
function generateReportContent(accountName, dateCondition, reportType, dateLabel) {
  var fullData = getAccountAndCampaignData(dateCondition);
  var generalData = fullData.totals;
  var campaignsList = fullData.campaigns;
  
  var validCampaignIds = campaignsList.map(function(c) { return c.id; });
  
  var deviceData = getDeviceStats(dateCondition);
  var ageData = getAgeStats(validCampaignIds, dateCondition);
  
  return buildHtmlReport(accountName, generalData, deviceData, ageData, campaignsList, reportType, dateLabel);
}

// --- FUNÇÃO DE DADOS 1: GERAL E CAMPANHAS ---
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

// --- FUNÇÃO DE DADOS 2: DISPOSITIVOS ---
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

// --- FUNÇÃO DE DADOS 3: IDADE ---
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

// --- MONTADOR DE HTML (DESIGN MODERNO + RESPONSIVO) ---
function buildHtmlReport(accountName, gen, devices, ages, campaigns, reportType, dateLabel) {
  var toMoney = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: AdsApp.currentAccount().getCurrencyCode() });
  var toPct = (val) => (val ? (val * 100).toFixed(2) + "%" : "-");

  var labelColor = reportType === "VITALÍCIO" ? "#10b981" : "#f59e0b";

  var html = `<div style="margin-bottom: 40px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <!-- SEÇÃO TÍTULO -->
    <div style="background: linear-gradient(135deg, ${reportType === 'VITALÍCIO' ? '#10b981' : '#f59e0b'} 0%, ${reportType === 'VITALÍCIO' ? '#059669' : '#d97706'} 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
        <span style="font-size: 24px; flex-shrink: 0;">${reportType === 'VITALÍCIO' ? '📈' : '📊'}</span>
        <div style="min-width: 0;">
          <h3 style="margin: 0; font-size: 18px; font-weight: 600; word-break: break-word;">${reportType}</h3>
          <p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.95; word-break: break-word;">Conta: <strong>${config.accountLabel}</strong> | ${accountName}</p>
        </div>
      </div>
    </div>

    <!-- INFO PERÍODO E FILTROS -->
    <div style="background-color: #f9fafb; padding: 15px; border-left: 4px solid ${labelColor}; margin-bottom: 20px; border-radius: 4px; font-size: 12px; color: #555; overflow-x: auto;">
      <p style="margin: 0; word-break: break-word;"><strong>📅 Período:</strong> ${dateLabel}</p>
      <p style="margin: 8px 0 0 0; word-break: break-word;"><strong>⚙️ Filtros:</strong> Status=Ativo, Orçamento &gt; ${toMoney(config.minBudget)}${config.campaignNameContains ? `, Nome contém "${config.campaignNameContains}"` : ''}</p>
    </div>

    <!-- KPI CARDS (RESPONSIVO) -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 25px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 18px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <p style="margin: 0; font-size: 11px; opacity: 0.9;">💰 Custo</p>
        <p style="margin: 8px 0 0 0; font-size: 18px; font-weight: 700; word-break: break-word;">${toMoney(gen.cost)}</p>
      </div>
      <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 18px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <p style="margin: 0; font-size: 11px; opacity: 0.9;">🎯 Conv.</p>
        <p style="margin: 8px 0 0 0; font-size: 18px; font-weight: 700;">${gen.conversions}</p>
      </div>
      <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 18px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <p style="margin: 0; font-size: 11px; opacity: 0.9;">💵 CPA</p>
        <p style="margin: 8px 0 0 0; font-size: 18px; font-weight: 700; word-break: break-word;">${toMoney(gen.cpa)}</p>
      </div>
      <div style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); color: white; padding: 18px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <p style="margin: 0; font-size: 11px; opacity: 0.9;">📌 CTR</p>
        <p style="margin: 8px 0 0 0; font-size: 18px; font-weight: 700;">${toPct(gen.ctr)}</p>
      </div>
    </div>

    <!-- ENGAJAMENTO -->
    <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <h4 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 600; color: #1f2937;">📹 Engajamento</h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 8px;">
        <div style="text-align: center; padding: 10px; background-color: #f3f4f6; border-radius: 6px;">
          <p style="margin: 0; font-size: 10px; color: #666;">CTR</p>
          <p style="margin: 4px 0 0 0; font-size: 16px; font-weight: 700; color: #1f2937;">${toPct(gen.ctr)}</p>
        </div>
        <div style="text-align: center; padding: 10px; background-color: #f3f4f6; border-radius: 6px;">
          <p style="margin: 0; font-size: 10px; color: #666;">25%</p>
          <p style="margin: 4px 0 0 0; font-size: 16px; font-weight: 700; color: #1f2937;">${toPct(gen.v25)}</p>
        </div>
        <div style="text-align: center; padding: 10px; background-color: #f3f4f6; border-radius: 6px;">
          <p style="margin: 0; font-size: 10px; color: #666;">50%</p>
          <p style="margin: 4px 0 0 0; font-size: 16px; font-weight: 700; color: #1f2937;">${toPct(gen.v50)}</p>
        </div>
        <div style="text-align: center; padding: 10px; background-color: #f3f4f6; border-radius: 6px;">
          <p style="margin: 0; font-size: 10px; color: #666;">75%</p>
          <p style="margin: 4px 0 0 0; font-size: 16px; font-weight: 700; color: #1f2937;">${toPct(gen.v75)}</p>
        </div>
        <div style="text-align: center; padding: 10px; background-color: #f3f4f6; border-radius: 6px;">
          <p style="margin: 0; font-size: 10px; color: #666;">100%</p>
          <p style="margin: 4px 0 0 0; font-size: 16px; font-weight: 700; color: #1f2937;">${toPct(gen.v100)}</p>
        </div>
      </div>
    </div>

    <!-- CAMPANHAS -->
    <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow-x: auto;">
      <h4 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 600; color: #1f2937;">🚀 Campanhas</h4>
      <div style="min-width: 100%; overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <tr style="background-color: #f3f4f6; border-bottom: 2px solid #e5e7eb;">
            <th style="padding: 10px; text-align: left; font-weight: 600; color: #374151; white-space: nowrap;">Campanha</th>
            <th style="padding: 10px; text-align: right; font-weight: 600; color: #374151; white-space: nowrap;">Custo</th>
            <th style="padding: 10px; text-align: right; font-weight: 600; color: #374151; white-space: nowrap;">Conv.</th>
            <th style="padding: 10px; text-align: right; font-weight: 600; color: #374151; white-space: nowrap;">CPA</th>
            <th style="padding: 10px; text-align: right; font-weight: 600; color: #374151; white-space: nowrap;">CTR</th>
          </tr>`;
    
    if (campaigns && campaigns.length > 0) {
      campaigns.forEach((c, idx) => {
        var bgColor = idx % 2 === 0 ? '#ffffff' : '#f9fafb';
        html += `<tr style="background-color: ${bgColor}; border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px; color: #1f2937; font-weight: 500; max-width: 200px; word-break: break-word;">${c.name}</td>
          <td style="padding: 10px; text-align: right; color: #374151; white-space: nowrap;">${toMoney(c.cost)}</td>
          <td style="padding: 10px; text-align: right; color: #374151; font-weight: 600; white-space: nowrap;">${c.conversions}</td>
          <td style="padding: 10px; text-align: right; color: #374151; white-space: nowrap;">${toMoney(c.cpa)}</td>
          <td style="padding: 10px; text-align: right; color: #374151; white-space: nowrap;">${toPct(c.ctr)}</td>
        </tr>`;
      });
    } else {
      html += `<tr><td colspan="5" style="padding: 15px; text-align: center; color: #999;">Nenhuma campanha encontrada.</td></tr>`;
    }
    html += `</table></div></div>`;

    <!-- DISPOSITIVOS E IDADE (EMPILHADOS EM MOBILE) -->
    html += `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
      <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <h4 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 600; color: #1f2937;">📱 Dispositivos</h4>
        <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; min-width: 100%;">
          <tr style="background-color: #f3f4f6; border-bottom: 2px solid #e5e7eb;">
            <th style="padding: 10px; text-align: left; font-weight: 600; color: #374151;">Device</th>
            <th style="padding: 10px; text-align: right; font-weight: 600; color: #374151;">Custo</th>
            <th style="padding: 10px; text-align: right; font-weight: 600; color: #374151;">Conv.</th>
          </tr>`;
    devices.forEach((d, idx) => {
      var bgColor = idx % 2 === 0 ? '#ffffff' : '#f9fafb';
      html += `<tr style="background-color: ${bgColor}; border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 10px; color: #1f2937;">${d.device}</td>
        <td style="padding: 10px; text-align: right; color: #374151;">${toMoney(d.cost)}</td>
        <td style="padding: 10px; text-align: right; color: #374151; font-weight: 600;">${d.conversions}</td>
      </tr>`;
    });
    html += `</table></div></div>`;

    html += `<div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <h4 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 600; color: #1f2937;">🎂 Por Idade</h4>
      <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; min-width: 100%;">
        <tr style="background-color: #f3f4f6; border-bottom: 2px solid #e5e7eb;">
          <th style="padding: 10px; text-align: left; font-weight: 600; color: #374151;">Idade</th>
          <th style="padding: 10px; text-align: right; font-weight: 600; color: #374151;">Conv.</th>
        </tr>`;
    if (ages.length > 0) {
      ages.forEach((a, idx) => {
        var bgColor = idx % 2 === 0 ? '#ffffff' : '#f9fafb';
        html += `<tr style="background-color: ${bgColor}; border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px; color: #1f2937;">${a.age}</td>
          <td style="padding: 10px; text-align: right; color: #374151; font-weight: 600;">${a.conversions}</td>
        </tr>`;
      });
    } else {
      html += `<tr><td colspan="2" style="padding: 15px; text-align: center; color: #999;">Sem conversões.</td></tr>`;
    }
    html += `</table></div></div></div></div>`;

  return html;
}

// --- GERADOR DE PDF COM ROLAGEM INFINITA (SEM PÁGINAS) ---
function generatePDFScroll(htmlContent, reportName) {
  var pdfHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 0; }
    body { margin: 0; padding: 0; background-color: #fff; }
    * { box-sizing: border-box; }
    html, body { height: auto; }
    .pdf-body { width: 100%; padding: 0; margin: 0; background: white; }
  </style>
</head>
<body>
  <div class="pdf-body" style="width: 100%; padding: 0; margin: 0;">
    ${htmlContent}
  </div>
</body>
</html>`;
  return Utilities.newBlob(pdfHtml, 'text/html', reportName + ".html").getAs('application/pdf');
}
