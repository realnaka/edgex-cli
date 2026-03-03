# EdgeX Trading Rules

Comprehensive trading rules extracted from [EdgeX official documentation](https://edgex-1.gitbook.io/edgeX-documentation/trading).

## Contents

- [Margin Mode & Accounts](#margin-mode--accounts)
- [Order Types](#order-types)
- [Stock Perpetual Rules](#stock-perpetual-rules)
- [Funding Fees](#funding-fees)
- [Trading Fees](#trading-fees)
- [Price Types](#price-types)
- [Liquidation](#liquidation)
- [Take Profit & Stop Loss](#take-profit--stop-loss)

---

## Margin Mode & Accounts

**Cross-margin by default.** All positions within one trading account share collateral. If one position has unrealized loss, it reduces available margin for all other positions.

**Isolated margin via sub-accounts.** Users can create up to 20 trading accounts per wallet. Each account has independent margin — liquidation of one account does NOT affect others. Transfers between sub-accounts are fee-free but can impact margin ratios.

**Hedge mode:** Use sub-accounts to simultaneously hold long and short positions in the same market (one per sub-account).

**Collateral:** USDT only. All margin and PnL calculated in USDT. Linear PnL curve: 1 BTC position with $100 price move = $100 PnL change.

### Implications for CLI Users

- `edgex account balances` shows balances for the configured account only
- Leverage is set per-contract: `edgex account leverage BTC 20`
- There is no CLI command to create sub-accounts or transfer between them — use the web interface
- When checking balance before trading, `availableAmount` already accounts for margin used by existing positions

---

## Order Types

### 1. Limit Order

Place at a specific price or better. NOT guaranteed to fill.

- Buy limit: executes at limit price or lower
- Sell limit: executes at limit price or higher

**Time-in-force options:**
- **Good-Till-Time (default):** Remains active until filled or max 4 weeks
- **Immediate-or-Cancel (IOC):** Fill at limit or better immediately; cancel remainder
- **Fill-or-Kill (FOK):** Fill entirely at limit or better immediately; cancel if not fully fillable

**Execution conditions:**
- **Post-Only:** Ensures maker-only execution (rejected if would take)
- **Reduce-Only:** Can only decrease position size, never increase

### 2. Market Order

Execute immediately at best available price. Guaranteed execution, no price guarantee.

- Slippage risk: especially in low-liquidity markets
- **NOT available** for stock perpetuals during market closure
- The CLI internally submits market orders with oracle price ±10% as protection

### 3. Conditional Orders

Orders with a trigger price condition:

- **Conditional Limit:** Trigger price + limit price. When last traded price hits trigger, limit order is placed.
- **Conditional Market:** Trigger price only. When triggered, executes as market order.

---

## Stock Perpetual Rules

**CRITICAL: These rules significantly affect order behavior for equity contracts (TSLA, AAPL, NVDA, etc.)**

### Trading Hours & Market Status

- The system determines "Market Open" or "Market Closed" in real-time based on the official US stock market schedule
- The perpetual market remains **open 24/7**, but rules change during market closure
- US stock market hours: Mon-Fri 9:30 AM - 4:00 PM ET (excluding holidays)

### Rules During Market Closure (Weekends & Holidays)

**Order restrictions:**
- **Market orders are REJECTED.** The system will reject all market orders.
- **Only limit orders are allowed**, and the limit price MUST fall within the designated price range.
- **Conditional orders** (TP/SL, conditional limit/market) triggered during closure must follow the same rules: market-type triggers are rejected, limit-type triggers must be within range.

**Price range calculation:**
- Long (buy) upper limit: `Last Closing Index Price × (1 + 1/Max Leverage)`
- Short (sell) lower limit: `Last Closing Index Price × (1 - 1/Max Leverage)`

**Example:** If max leverage = 10x and last closing price = $100:
- Buy limit orders cannot exceed $110
- Sell limit orders cannot be below $90

**Mark price during closure:**
- Restricted within the designated price range
- Clamping mechanism: price change limited to **0.5% every 3 seconds**

### Risk Warnings for Stock Perpetuals

- **Liquidation risk** if margin is insufficient during extended closures
- **Price deviation** during market open/close transitions can be extreme
- **Order rejection** if parameters don't meet closure criteria

### Implications for CLI Agent

When trading stock perpetuals:

1. Check if it's a stock contract (TSLA, AAPL, NVDA, GOOG, AMZN, META, etc.)
2. If weekend or US market closed:
   - Do NOT use market orders — they will be rejected
   - Use limit orders only
   - Warn user about restricted price range
3. If market is open: all order types work normally

---

## Funding Fees

Mechanism to keep perpetual contract prices aligned with spot prices. Exchanged between longs and shorts periodically.

**Settlement frequency:** Varies by contract (check `fundingRateIntervalMin` in funding response):
- Most crypto contracts: every 4 hours (240 min)
- Some contracts: every 1 hour (60 min)

**When positive funding rate:** Longs pay shorts
**When negative funding rate:** Shorts pay longs

**Formula:**
```
Funding Fee = Position Value × Index Price × Funding Rate
```

**Daily funding cost estimate:**
```
Daily Cost = Funding Rate × (1440 / fundingRateIntervalMin) × Position Value
```

Example: BTC position $10,000, funding rate 0.01%, 4-hour interval:
```
Daily Cost = 0.0001 × (1440/240) × 10000 = $6.00/day
```

**Key points:**
- Only positions held at settlement time pay/receive funding
- Closing position before settlement avoids funding fee
- Funding rate changes continuously; check `forecastFundingRate` for prediction

---

## Trading Fees

Tiered structure based on rolling 30-day trading volume.

- **Maker orders:** Add liquidity to the order book (limit orders not immediately filled)
- **Taker orders:** Remove liquidity from the order book (market orders, limits that fill immediately)
- **Gas fees:** EdgeX covers gas costs for trade settlements
- **Sub-account aggregation:** Volume from all sub-accounts counts toward the main account's fee tier

Check current fee tiers at: https://pro.edgex.exchange/vip

---

## Price Types

EdgeX uses three different prices:

### Last Price
- Most recent transaction price, updated in real-time
- Used for: order matching, TP/SL triggers, chart display

### Index Price  
- Weighted average from Binance, OKX, Bybit, Coinbase (weights adjusted every 4 hours)
- Used for: funding fee calculation
- Advantage: resistant to single-exchange anomalies

### Oracle Price
- Sourced from Stork (independent oracle provider)
- Used for: **margin calculation and liquidation**
- Most important for risk: your position is liquidated based on Oracle Price, not Last Price
- Advantage: resistant to market manipulation

**Implication:** Even if the Last Price doesn't hit your liquidation level, the Oracle Price might (or vice versa). Always check `oraclePrice` in ticker data for accurate risk assessment.

---

## Liquidation

- **Trigger:** Oracle Price reaches liquidation price
- **Mode:** Cross-margin — liquidation happens when available balance reaches zero AND position margin drops to maintenance margin level
- **Sub-accounts:** Liquidation of one account does NOT affect other sub-accounts

**Prevention strategies:**
1. Use lower leverage
2. Maintain adequate available balance
3. Set stop-loss orders
4. Monitor `oraclePrice` (not just `lastPrice`)
5. Use sub-accounts to isolate high-risk positions

---

## Take Profit & Stop Loss

**Key rules:**
- TP/SL are triggered by **Last Traded Price** (not oracle price)
- TP/SL orders execute as **market orders** when triggered
- All TP/SL are **reduce-only** by default
- TP/SL can only be configured AFTER order execution (not on pending limit orders via web UI, but CLI supports attaching TP/SL at order creation time with `--tp` and `--sl`)
- Once created, TP/SL **cannot be modified** — must cancel and re-create

**CLI TP/SL behavior:**
- `--tp 3500` creates a TAKE_PROFIT_MARKET order at trigger price 3500
- `--sl 2800` creates a STOP_MARKET order at trigger price 2800
- Both are attached to the position and auto-cancel when position is closed
