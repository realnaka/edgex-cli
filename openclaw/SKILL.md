# EdgeX CLI

CLI for EdgeX perpetual and equity contract trading. Query market data, manage accounts, and execute trades from the terminal. All commands output JSON for AI agent integration.

## Installation

```bash
npm install -g edgex-cli
```

## Capabilities

### Market Data (no authentication required)

- **Ticker**: Get 24-hour price, volume, and open interest for any contract
- **Order Book**: View bid/ask depth at 15 or 200 levels
- **Kline**: Historical candlestick data with configurable intervals (1m to 1M)
- **Funding Rate**: Current and historical funding rates
- **Long/Short Ratio**: Multi-exchange long/short ratio analysis
- **Market Summary**: Aggregate market statistics

### Account Management (requires EdgeX credentials)

- View account balances, positions, and active orders
- Set leverage per contract (cross-margin mode)

### Trading (requires EdgeX credentials)

- Place limit and market orders with optional TP/SL
- Cancel individual orders or all open orders
- Query maximum order size

### Real-time Streaming (WebSocket)

- Stream live ticker, order book, and kline data
- Stream private account and order updates

## Usage

All commands support `--json` flag for structured output.

```bash
# Market data
edgex market ticker BTC --json
edgex market depth ETH --json
edgex market kline SOL -i 1h -n 50 --json
edgex market funding --json
edgex market ratio BTC --json

# Account
edgex account balances --json
edgex account positions --json

# Trading
edgex order create BTC buy market 0.01 --json
edgex order cancel <orderId> --json
```

## Symbol Format

Accepts flexible inputs: `BTC`, `btc`, `BTCUSD`, or contract ID `10000001`.

## Configuration

Credentials via environment variables or `~/.edgex/config.json`:

```bash
export EDGEX_ACCOUNT_ID=12345
export EDGEX_STARK_PRIVATE_KEY=0x...
```

## Contracts

EdgeX supports 290+ perpetual contracts including crypto (BTC, ETH, SOL, etc.) and US equity contracts.
