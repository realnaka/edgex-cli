---
name: edgex-cli
description: Trade perpetual and equity contracts on EdgeX exchange via CLI. Query market data (price, depth, funding, kline, long/short ratio), manage accounts (balance, positions, leverage), place/cancel orders with TP/SL, and stream real-time WebSocket data. Supports 290+ contracts including crypto (BTC, ETH, SOL) and US equities (TSLA, AAPL, NVDA). Use when the user wants to trade on EdgeX, check EdgeX market data, manage EdgeX positions, or interact with EdgeX exchange programmatically.
---

# EdgeX CLI

CLI for EdgeX perpetual and equity contract trading. All commands support `--json` for structured output.

## Install

```bash
npm install -g @realnaka/edgex-cli
```

Requires Node.js >= 18. Verify: `edgex --version`

## Capabilities & Limits

**Public (no auth):** market ticker/depth/kline/funding/ratio/summary, stream ticker/depth/kline/trades
**Authenticated (requires `edgex setup`):** account balances/positions/orders/leverage, order create/cancel/status/max-size, stream account
**Assets:** 290+ perpetual contracts — crypto (BTC, ETH, SOL) + US equities (TSLA, AAPL, NVDA, GOOG, AMZN, META)

**Cannot do:** withdraw funds, transfer between accounts, modify TP/SL after creation, change account settings

## Commands

```
edgex market ticker [symbol] --json          # 24h ticker (price, volume, OI, funding)
edgex market depth <symbol> --json           # Order book (--level 15|200)
edgex market kline <symbol> -i <interval> -n <count> --json   # Candlesticks
edgex market funding [symbol] --json         # Funding rates
edgex market summary --json                  # Market-wide stats
edgex market ratio [symbol] --json           # Long/short ratio by exchange

edgex account balances --json                # Asset balances
edgex account positions --json               # Open positions
edgex account orders --json                  # Active orders
edgex account leverage <symbol> <n> --json   # Set leverage (cross-margin)

edgex order create <symbol> <buy|sell> <limit|market> <size> [--price X] [--tp X] [--sl X] [-y] --json
edgex order status <orderId> --json
edgex order cancel <orderId> --json
edgex order cancel-all [-s <symbol>] --json
edgex order max-size <symbol> --json         # Max position size given current balance

edgex stream ticker <symbol>                 # Real-time ticker (NDJSON)
edgex stream depth <symbol>                  # Real-time order book (NDJSON)
edgex stream kline <symbol> -i <interval>    # Real-time kline (NDJSON)
edgex stream trades <symbol>                 # Real-time trades (NDJSON)
edgex stream account                         # Account/order updates (NDJSON, requires auth)
```

**Kline intervals:** 1m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d, 1w, 1M

**Symbol format:** Flexible — `BTC`, `btc`, `BTCUSD`, or contract ID `10000001` all work.

**Flags:** `--testnet` for testnet environment. `--json` for JSON output. `-y` to skip order confirmation.

## Agent Rules

- ALWAYS use `--json` flag for programmatic parsing
- ALWAYS check `account balances` and `order max-size` before placing orders
- ALWAYS present order parameters to the user and get explicit confirmation before using `-y`
- NEVER use `-y` without the user's explicit approval
- For market orders, ALWAYS warn the user about slippage risk
- All numeric values are returned as **strings** — use `parseFloat()` to parse
- Funding rate is a decimal: `"0.0001"` means 0.01%
- Timestamps are Unix milliseconds as strings
- `--json` flag works both before and after the subcommand: `edgex --json market ticker BTC` and `edgex market ticker BTC --json` are equivalent

## Core Workflows

### Safe Order Placement

1. Check balance: `edgex --json account balances` → read `.collateralAssetModelList[0].availableAmount`
2. Check price: `edgex --json market ticker <symbol>` → read `[0].lastPrice`
3. Check max size: `edgex --json order max-size <symbol>` → read `.maxBuySize` or `.maxSellSize`
4. Validate: available balance sufficient? requested size ≤ max size?
5. Present order preview to user: symbol, side, type, size, price, TP/SL
6. After user confirms → execute: `edgex order create <symbol> <side> <type> <size> [--price X] -y --json`
7. Verify: `edgex --json order status <orderId>`

### Close All Positions

1. Get positions: `edgex --json account positions`
2. For each position with non-zero size: determine reverse side and size
3. Execute: `edgex order create <symbol> <reverse-side> market <size> -y --json`

### Market Analysis

1. Get ticker: `edgex --json market ticker <symbol>` (price, 24h change, volume, OI)
2. Get depth: `edgex --json market depth <symbol>` (bid/ask spread, liquidity)
3. Get funding: `edgex --json market funding <symbol>` (funding rate, sentiment)
4. Get kline: `edgex --json market kline <symbol> -i 1h -n 50` (price history)
5. Combine into analysis: trend direction, support/resistance, funding cost

## EdgeX-Specific Rules

- **Cross-margin only** by default. All positions in one account share collateral. To isolate risk, create sub-accounts on the EdgeX web interface.
- **USDT collateral only.** Margin and PnL calculated in USDT.
- **Funding every 1-4 hours** (varies by contract). Check `fundingRateIntervalMin` in funding response.
- **Stock perpetuals during market closure** (weekends/holidays): market orders are REJECTED. Only limit orders within a price range are allowed. See [references/trading-rules.md](references/trading-rules.md) for details.
- **TP/SL execute as market orders** and are reduce-only by default.
- **Oracle Price** (from Stork) is used for liquidation, not last traded price.
- **Rate limit:** 50 requests per 10 seconds (CLI auto-throttles).

## Error Recovery

| Error | Cause | Fix |
|-------|-------|-----|
| "Run edgex setup" | No credentials configured | Run `edgex setup` |
| "Unknown symbol: XXX" | Symbol not found in cache | `rm ~/.edgex/contracts.json` and retry |
| "INSUFFICIENT_MARGIN" | Not enough balance | Reduce size or deposit more USDT |
| "INVALID_ORDER_MARKET_PRICE" | Market order during stock closure | Use limit order within allowed price range |
| "Order rejected" | Price outside allowed range | Check funding response for price limits |
| Rate limit exceeded | Too many requests | CLI auto-waits; or add delay between commands |

## Reference Files

- **Output schemas**: See [references/output-schemas.md](references/output-schemas.md) for complete JSON response structures of every command
- **Trading rules**: See [references/trading-rules.md](references/trading-rules.md) for EdgeX margin, liquidation, stock perpetual, order types, fees, and price mechanisms
- **Advanced workflows**: See [references/workflows.md](references/workflows.md) for multi-asset monitoring, portfolio dashboard, funding scanner, and smart order workflows
