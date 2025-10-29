// Config
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const DEXSCREENER_BASE = 'https://api.dexscreener.com/latest/dex/pairs/pulsechain';
const TOP_TOKENS = [
  { id: 'pulsechain', symbol: 'PLS', pair: 'USDC/WPLS' },
  { id: 'hex', symbol: 'HEX', pair: 'HEX/WPLS' }, // HEX is on Ethereum, but PulseChain fork uses 'hex'
  { id: 'elhex', symbol: 'eHEX', pair: 'eHEX/WPLS' }, // eHEX is 'elhex' on CoinGecko
  { id: 'pulsex', symbol: 'PLSX', pair: null },
  { id: 'mintra', symbol: 'MINTRA', pair: null },
  { id: 'inc', symbol: 'INC', pair: null },
  { id: 'pdai', symbol: 'pDAI', pair: null },
  { id: 'pusdc', symbol: 'pUSDC', pair: null },
  { id: 'peth', symbol: 'pETH', pair: null },
  { id: 'liquid-loans', symbol: 'LIQ', pair: null }
];
let chart, scannerChart;
let provider; // For MetaMask

// Load single token
async function loadSingle() {
  const tokenId = document.getElementById('token').value.toLowerCase();
  const days = 30;
  const res = await fetch(`${COINGECKO_BASE}/coins/${tokenId}/ohlc?vs_currency=usd&days=${days}`);
  if (!res.ok) { alert('Token not found!'); return; }
  const data = await res.json();

  const candles = data.map(([ts, o, h, l, c]) => ({ x: new Date(ts), o, h, l, c }));
  const closes = data.map(d => d[4]);
  const rsi = TI.RSI.calculate({ values: closes, period: 14 });
  const macd = TI.MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
  const bb = TI.BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });

  renderChart('chart', candles, tokenId);
  detectSetups(candles, rsi, macd, bb, closes, tokenId);
  await loadDexInfo(tokenId);
}

// Render candlestick chart
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

// Detect setups (enhanced)
function detectSetups(candles, rsi, macd, bb, closes, tokenId) {
  const alerts = [];
  const last = closes.length - 1;

  // RSI Oversold + Bullish
  if (rsi[last] < 30 && closes[last] > closes[last-1]) {
    alerts.push(`🚀 ${tokenId.toUpperCase()}: RSI Oversold Reversal – Buy Dip?`);
  }

  // MACD Crossover
  const macdLast = macd[macd.length - 1];
  const macdPrev = macd[macd.length - 2];
  if (macdPrev?.MACD < macdPrev.signal && macdLast.MACD > macdLast.signal) {
    alerts.push(`📈 ${tokenId.toUpperCase()}: MACD Bullish Cross – Momentum Shift`);
  }

  // Bollinger Squeeze (volatility breakout)
  const bbLast = bb[last];
  const squeeze = (bbLast.upper - bbLast.lower) / bbLast.middle < 0.05; // Tight bands
  if (squeeze && closes[last] > bbLast.middle) {
    alerts.push(`⚡ ${tokenId.toUpperCase()}: Bollinger Squeeze Breakout – Volatile Pump Incoming`);
  }

  document.getElementById('alerts').innerHTML = alerts.map(a => `<div class="alert">${a}</div>`).join('') || '<div class="no-alert">No setups – chill for now.</div>';
}

// Load DEX pair info
async function loadDexInfo(tokenId) {
  const pairs = await fetch('dex-pairs.json').then(r => r.json());
  const pairKey = TOP_TOKENS.find(t => t.id === tokenId)?.pair;
  if (!pairKey) return;

  const pairAddr = pairs[pairKey];
  const res = await fetch(`${DEXSCREENER_BASE}/${pairAddr}`);
  const dexData = await res.json();
  const { liquidity: { usd }, volume: { h24 }, fdv } = dexData.pairs[0] || {};

  document.getElementById('dex-info').innerHTML = `
    <div class="dex-alert">
      💧 Liquidity: $${usd?.toLocaleString() || 'N/A'} | 24h Vol: $${h24?.toLocaleString() || 'N/A'} | FDV: $${fdv?.toLocaleString() || 'N/A'}
      ${usd < 100000 ? '<span style="color:orange">⚠️ Low Liquidity – Slippage Risk</span>' : ''}
    </div>
  `;
}

// Multi-Token Scanner
async function toggleScanner() {
  const section = document.getElementById('scanner-section');
  section.classList.toggle('hidden');
  if (!section.classList.contains('hidden')) await runScanner();
}

async function runScanner() {
  const tbody = document.getElementById('scanner-table').querySelector('tbody');
  tbody.innerHTML = '';
  let allData = [];

  for (const token of TOP_TOKENS.slice(0, 10)) { // Top 10
    try {
      const res = await fetch(`${COINGECKO_BASE}/coins/${token.id}/market_chart?vs_currency=usd&days=7`);
      const data = await res.json();
      const closes = data.prices.map(p => p[1]);
      const rsi = TI.RSI.calculate({ values: closes, period: 14 })[closes.length - 1];
      const setup = rsi < 30 ? 'Oversold' : (rsi > 70 ? 'Overbought' : 'Neutral');
      const price = closes[closes.length - 1];

      // Mock liquidity from DEX (expand)
      const liq = token.pair ? 'High' : 'Check PulseX';

      tbody.innerHTML += `<tr><td>${token.symbol}</td><td>$${price.toFixed(6)}</td><td>${rsi.toFixed(1)}</td><td>${setup}</td><td>${liq}</td></tr>`;
      allData.push({ label: token.symbol, data: closes.slice(-7) }); // Last week for aggregate
    } catch (e) { console.log(`Scan failed for ${token.id}`); }
  }

  // Aggregate chart (simple line for overview)
  renderScannerChart(allData);
}

function renderScannerChart(data) {
  const ctx = document.getElementById('scanner-chart').getContext('2d');
  if (scannerChart) scannerChart.destroy();
  scannerChart = new Chart(ctx, {
    type: 'line',
    data: { labels: Array(7).fill().map((_, i) => `Day ${i+1}`), datasets: data.map(d => ({ label: d.label, data: d.data, borderColor: '#00ff88' })) },
    options: { scales: { y: { beginAtZero: false } }, plugins: { legend: { labels: { color: '#00ff88' } } } }
  });
}

// MetaMask Connect (stub)
async function connectWallet() {
  if (typeof window.ethereum !== 'undefined') {
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    alert('MetaMask connected! Add portfolio TA later.');
  } else {
    alert('Install MetaMask!');
  }
}

// Export (JSON + PNG via html2canvas)
function exportSetup() {
  const data = { alerts: document.getElementById('alerts').innerText, token: document.getElementById('token').value };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ta-setup.json';
  a.click();

  // PNG (add html2canvas CDN if needed)
  // html2canvas(document.getElementById('single-chart')).then(canvas => { /* download */ });
}

// Auto-load
loadSingle();
