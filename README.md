# PulseChain TA Setup Analyzer

Browser-based TA tool for PulseChain tokens. Spots RSI/MACD/Bollinger setups + DEX liquidity checks.

## Quick Start
1. Open `index.html` in browser.
2. Enter token ID (e.g., `pulsechain` for PLS).
3. Hit Load – watch for green alerts!

## Extend
- Add more tokens to `TOP_TOKENS` array.
- Integrate Moralis for on-chain volume.
- Backtest: Fetch longer history, simulate trades.

## Deploy
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/pulsechain-ta-analyzer.git
git push -u origin main
# Enable GitHub Pages in settings
