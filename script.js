// ---------------------------------------------------------------
// script.js – PulseChain TA Detector
// ---------------------------------------------------------------
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const DEXSCREENER_BASE = 'https://api.dexscreener.com/latest/dex/pairs/pulsechain';

const TOP_TOKENS = [
  { id: 'pulsechain', symbol: 'PLS',   pair: 'USDC/WPLS' },
  { id: 'hex',        symbol: 'HEX',   pair: 'HEX/WPLS' },
  { id: 'elhex',      symbol: 'eHEX',  pair: 'eHEX/WPLS' },
  { id: 'pulsex',     symbol: 'PLSX',  pair: null },
  { id: 'mintra',     symbol: 'MINTRA',pair: null },
  { id: 'inc',        symbol: 'INC',   pair: 'INC/WPLS' },
  { id: 'pdai',       symbol: 'pDAI',  pair: null },
  { id: 'pusdc',      symbol: 'pUSDC', pair: null },
  { id: 'liquid-loans', symbol: 'LIQ', pair: null },
  { id: 'atropa',     symbol: 'ATROPA',pair: null }
];

let chart, scannerChart;
let provider;   // MetaMask

// ---------------------------------------------------------------
// SINGLE TOKEN
// ---------------------------------------------------------------
async function loadSingle() {
  const tokenId = document.getElementById('token').value.trim().toLowerCase();
  const alertsDiv = document.getElementById('alerts');
  const dexDiv = document.getElementById('dex-info');

  alertsDiv.innerHTML = '<div class="loading">Fetching data from CoinGecko...</div>';
  dexDiv.innerHTML = '';

  if (!tokenId) {
    alertsDiv.innerHTML = '<div class="error">Enter a token ID!</div>';
    return;
  }

  try {
    // USE CORS PROXY
    const proxy = 'https://corsproxy.io/?';
    const url = `${proxy}https://api.coingecko.com/api/v3/coins/${tokenId}/ohlc?vs_currency=usd&days=30`;

    console.log('Fetching:', url); // DEBUG
    const res = await fetch(url);
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
    }

    const ohlc = await res.json();
    if (!ohlc || ohlc.length === 0) throw new Error('No OHLC data returned');

    // SUCCESS — continue with chart
    alertsDiv.innerHTML = `<div style="color:yellow">Data loaded! (${ohlc.length} candles)</div>`;
    
    // ... rest of your chart code ...
    const candles = ohlc.map(([ts, o, h, l, c]) => ({ x: new Date(ts), o, h, l, c }));
    const closes = ohlc.map(d => d[4]);
    const rsi = TI.RSI.calculate({ values: closes, period: 14 });
    const macd = TI.MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
    const bb = TI.BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });

    renderChart('chart', candles, tokenId.toUpperCase());
    detectSetups(candles, rsi, macd, bb, closes, [], tokenId);

  } catch (e) {
    console.error('Load failed:', e);
    alertsDiv.innerHTML = `<div class="error">API ERROR: ${e.message}</div>`;
  }
}

    // ---- market chart for volume ----
    const marketRes = await fetch(`${COINGECKO_BASE}/coins/${tokenId}/market_chart?vs_currency=usd&days=${days}`);
    const market = await marketRes.json();

    const candles = ohlc.map(([ts, o, h, l, c]) => ({ x: new Date(ts), o, h, l, c }));
    const closes  = ohlc.map(d => d[4]);
    const volumes = market.total_volumes?.map(v => v[1]) ?? [];

    const rsi = TI.RSI.calculate({ values: closes, period: 14 });
    const macd = TI.MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
    const bb   = TI.BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });

    renderChart('chart', candles, tokenId.toUpperCase());
    detectSetups(candles, rsi, macd, bb, closes, volumes, tokenId);
    await loadDexInfo(tokenId);
  } catch (e) {
    alertsDiv.innerHTML = `<div class="error">Error: ${e.message}</div>`;
    console.error(e);
  }
}

// ---------------------------------------------------------------
// CHART RENDER
// ---------------------------------------------------------------
function renderChart(canvasId, candles, label) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'candlestick',
    data: { datasets: [{ label, data: candles, borderColor: '#00ff88', backgroundColor: 'rgba(0,255,136,0.2)' }] },
    options: {
      scales: { x: { type: 'time', time: { unit: 'day' } }, y: { beginAtZero: false } },
      plugins: { legend: { labels: { color: '#00ff88' } } },
      backgroundColor: '#000'
    }
  });
}

// ---------------------------------------------------------------
// SETUP DETECTION
// ---------------------------------------------------------------
function detectSetups(candles, rsi, macd, bb, closes, volumes, tokenId) {
  const alerts = [];
  const last   = closes.length - 1;

  // RSI Oversold + Bullish candle
  if (rsi[last] < 30 && closes[last] > closes[last - 1]) {
    alerts.push(`${tokenId.toUpperCase()}: RSI Oversold Reversal – Buy Dip?`);
  }

  // MACD Bullish Crossover
  const macdLast = macd[macd.length - 1];
  const macdPrev = macd[macd.length - 2];
  if (macdPrev?.MACD < macdPrev.signal && macdLast.MACD > macdLast.signal) {
    alerts.push(`${tokenId.toUpperCase()}: MACD Bullish Cross – Momentum Shift`);
  }

  // Bollinger Squeeze + Breakout
  const bbLast = bb[last];
  const squeeze = (bbLast.upper - bbLast.lower) / bbLast.middle < 0.05;
  if (squeeze && closes[last] > bbLast.middle) {
    alerts.push(`${tokenId.toUpperCase()}: Bollinger Squeeze Breakout – Volatility Pump`);
  }

  // Volume spike (2× previous day)
  if (volumes.length && volumes[last] > volumes[last - 1] * 2) {
    const pct = ((volumes[last] / volumes[last - 1] - 1) * 100).toFixed(0);
    alerts.push(`${tokenId.toUpperCase()}: Volume Spike +${pct}% – Whales Active`);
  }

  const html = alerts.length
    ? alerts.map(a => `<div class="alert">${a}</div>`).join('')
    : '<div class="no-alert">No setups – waiting for the next move.</div>';
  document.getElementById('alerts').innerHTML = html;
}

// ---------------------------------------------------------------
// DEX INFO (PulseX liquidity)
// ---------------------------------------------------------------
async function loadDexInfo(tokenId) {
  const pairs = await fetch('dex-pairs.json').then(r => r.json());
  const token  = TOP_TOKENS.find(t => t.id === tokenId);
  if (!token?.pair) return;

  const addr = pairs[token.pair];
  if (!addr) return;

  try {
    const res = await fetch(`${DEXSCREENER_BASE}/${addr}`);
    const data = await res.json();
    const pair = data?.pairs?.[0];
    if (!pair) return;

    const liq = pair.liquidity?.usd ?? 0;
    const vol = pair.volume?.h24 ?? 0;
    const fdv = pair.fdv ?? 0;

    const lowLiq = liq < 100_000 ? '<span style="color:orange">Low Liquidity – Slippage Risk</span>' : '';
    document.getElementById('dex-info').innerHTML = `
      <div class="dex-alert">
        Liquidity: $${liq.toLocaleString()} | 24h Vol: $${vol.toLocaleString()} | FDV: $${fdv.toLocaleString()}
        ${lowLiq}
      </div>`;
  } catch (e) {
    console.error('DexScreener error', e);
  }
}

// ---------------------------------------------------------------
// MULTI-TOKEN SCANNER
// ---------------------------------------------------------------
async function toggleScanner() {
  const sec = document.getElementById('scanner-section');
  sec.classList.toggle('hidden');
  if (!sec.classList.contains('hidden')) await runScanner();
}

async function runScanner() {
  const tbody = document.querySelector('#scanner-table tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="loading">Scanning top tokens…</td></tr>';

  const rows = [];
  for (const token of TOP_TOKENS.slice(0, 10)) {
    try {
      const res = await fetch(`${COINGECKO_BASE}/coins/${token.id}/market_chart?vs_currency=usd&days=7`);
      const data = await res.json();
      const closes = data.prices.map(p => p[1]);
      const rsi = TI.RSI.calculate({ values: closes, period: 14 }).slice(-1)[0];
      const price = closes[closes.length - 1];
      const setup = rsi < 30 ? 'Oversold' : rsi > 70 ? 'Overbought' : 'Neutral';
      const liq = token.pair ? 'High' : '—';

      rows.push(`<tr>
        <td>${token.symbol}</td>
        <td>$${price.toFixed(6)}</td>
        <td>${rsi.toFixed(1)}</td>
        <td>${setup}</td>
        <td>${liq}</td>
      </tr>`);
    } catch (e) {
      rows.push(`<tr><td colspan="5" class="error">Failed: ${token.symbol}</td></tr>`);
    }
  }
  tbody.innerHTML = rows.join('');
}

// ---------------------------------------------------------------
// METAMASK (stub)
// ---------------------------------------------------------------
async function connectWallet() {
  if (!window.ethereum) return alert('Install MetaMask!');
  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  alert('MetaMask connected – portfolio TA coming soon.');
}

// ---------------------------------------------------------------
// EXPORT (JSON + PNG)
// ---------------------------------------------------------------
function exportSetup() {
  const data = {
    token: document.getElementById('token').value,
    alerts: document.getElementById('alerts').innerText,
    timestamp: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'pulsechain-setup.json'; a.click();

  // PNG export (requires html2canvas CDN – add in index.html if you want it)
}

// ---------------------------------------------------------------
// AUTO-REFRESH
// ---------------------------------------------------------------
setInterval(() => {
  const token = document.getElementById('token').value.trim();
  if (token) loadSingle();
}, 5 * 60 * 1000);

// ---------------------------------------------------------------
// START
// ---------------------------------------------------------------
loadSingle();
