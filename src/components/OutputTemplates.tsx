export const formatToolResult = (toolName: string, result: any): string => {
  if (!result) return '<div style="padding:20px; color:#fff;">Action completed successfully.</div>';
  
  const title = toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  
  const headHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,sans-serif; background:#050505; color:#f5ede6; padding:24px; }
    h1, h2, h3 { color:#d0a78b; margin-top:0; font-weight:600; }
    .card { background:rgba(208, 167, 139, 0.05); border:1px solid rgba(208, 167, 139, 0.2); padding:20px; border-radius:12px; margin-bottom:20px; box-shadow:0 4px 20px rgba(0,0,0,0.3); }
    .badge { background:rgba(208, 167, 139, 0.15); border:1px solid #d0a78b; color:#d0a78b; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:bold; text-transform:uppercase; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:16px; }
    .field { margin-bottom:12px; }
    .label { font-size:11px; color:#8c827a; text-transform:uppercase; font-weight:bold; letter-spacing:0.5px; }
    .value { font-size:14px; color:#fff; margin-top:2px; }
    table { width:100%; border-collapse:collapse; margin-top:16px; }
    th { border-bottom:1px solid rgba(208, 167, 139, 0.2); padding:8px 12px; text-align:left; color:#d0a78b; font-size:12px; text-transform:uppercase; }
    td { padding:12px; border-bottom:1px solid rgba(255,255,255,0.05); font-size:13px; }
    .step-list { margin:0; padding:0 0 0 20px; }
    .step-list li { margin-bottom:10px; font-size:13px; line-height:1.5; color:#eee; }
    .highlight { color:#d0a78b; font-weight:bold; }
  </style></head><body>`;
  const footHtml = `</body></html>`;

  // --- Predefined Tool Templates ---
  
  if (toolName === 'get_user_location' && result) {
    const mapsUrl = `https://www.google.com/maps?q=${result.lat},${result.lng}`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0d0a08;color:#f0e6df;display:flex;flex-direction:column;height:100vh}.map-wrap{flex:1;min-height:0}iframe{width:100%;height:100%;border:0}.info{padding:16px 20px;background:#1a1512;border-top:1px solid #2a1f18;text-align:center}p{margin:4px 0;font-size:14px;color:#d0a78b}span{color:#988c84}</style></head><body><div class="map-wrap"><iframe src="${mapsUrl}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div><div class="info"><p>📍 Your location</p><span>Accuracy: ±${Math.round(result.accuracy)}m</span></div></body></html>`;
  }
  
  if (toolName === 'list_calendar_events' && result?.items) {
      const events = result.items.map((e: any) => {
        const start = e.start?.dateTime || e.start?.date || 'TBD';
        const t = start.includes('T') ? new Date(start).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : start;
        return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #2a1f18"><div style="width:4px;height:4px;border-radius:50%;background:#d0a78b;flex-shrink:0"></div><div style="flex:1"><p style="margin:0;font-size:14px;color:#f0e6df">${e.summary || 'Untitled'}</p><p style="margin:2px 0 0;font-size:11px;color:#988c84">${t}</p></div></div>`;
      }).join('');
      return `${headHtml}<h2>📅 Upcoming Events</h2><p>${result.items.length} events</p>${events || '<p>No upcoming events</p>'}</body></html>`;
  }

  if (toolName === 'belgian_company_lookup' && result.company) {
    const c = result.company;
    return `${headHtml}
      <div class="card">
        <div class="flex" style="border-bottom:1px solid rgba(208, 167, 139, 0.2); padding-bottom:16px; margin-bottom:16px;">
          <div><h2>🏢 Belgian Enterprise Profile</h2><p style="margin:4px 0 0; font-size:12px; color:#988c84;">Official CBE/KBO Records</p></div>
          <span class="badge">${c.status}</span>
        </div>
        <div class="grid">
          <div class="field"><div class="label">Legal Name</div><div class="value" style="font-size:16px; font-weight:600; color:#d0a78b;">${c.name}</div></div>
          <div class="field"><div class="label">Enterprise Number</div><div class="value highlight">${c.bce}</div></div>
          <div class="field"><div class="label">Legal Form</div><div class="value">${c.legalForm}</div></div>
          <div class="field"><div class="label">CEO / Administrator</div><div class="value">${c.ceo}</div></div>
          <div class="field"><div class="label">Address</div><div class="value">${c.address}</div></div>
          <div class="field"><div class="label">Established</div><div class="value">${c.established}</div></div>
          <div class="field"><div class="label">NACE Code</div><div class="value">${c.nace}</div></div>
        </div>
      </div>
    ${footHtml}`;
  }

  // ... (Full implementation of other tool templates here, ensuring consistent structure)

  return `<div style="padding:16px; color:#fff;"><h3>${title}</h3><pre>${JSON.stringify(result, null, 2)}</pre></div>`;
};


