# EdgeX CLI Advanced Workflows

Multi-step workflows for common trading scenarios. Each workflow lists the exact commands to run and how to interpret results.

## Contents

- [Market Snapshot](#market-snapshot)
- [Multi-Asset Price Monitor](#multi-asset-price-monitor)
- [Portfolio Dashboard](#portfolio-dashboard)
- [Technical Briefing](#technical-briefing)
- [Smart Order with Risk Check](#smart-order-with-risk-check)
- [Funding Rate Scanner](#funding-rate-scanner)
- [Position PnL Monitor](#position-pnl-monitor)

---

## Market Snapshot

**Goal:** Quick overview of a single asset's market condition.

```bash
# Step 1: Price and 24h stats
edgex --json market ticker BTC

# Step 2: Order book depth
edgex --json market depth BTC

# Step 3: Funding rate
edgex --json market funding BTC
```

**Analysis template:**

| Metric | Source | Path |
|--------|--------|------|
| Current price | ticker | `[0].lastPrice` |
| 24h change | ticker | `[0].priceChangePercent` (multiply by 100 for %) |
| 24h volume (USDT) | ticker | `[0].value` |
| Open interest | ticker | `[0].openInterest` |
| Best bid | depth | `.bids[0].price` |
| Best ask | depth | `.asks[0].price` |
| Spread | depth | `asks[0].price - bids[0].price` |
| Funding rate | funding | `[0].fundingRate` (multiply by 100 for %) |
| Next funding | funding | `[0].fundingTime` (Unix ms → human time) |

**Interpretation:**
- High spread + low depth = low liquidity, avoid market orders
- Positive funding rate = longs paying shorts = market is bullish-biased
- Rising OI + rising price = new money entering longs

---

## Multi-Asset Price Monitor

**Goal:** Compare multiple assets side by side.

```bash
# Run for each asset
edgex --json market ticker BTC
edgex --json market ticker ETH
edgex --json market ticker SOL
edgex --json market ticker TSLA
edgex --json market ticker NVDA
edgex --json market ticker AAPL
```

**Present as table:**

| Asset | Price | 24h Change | 24h Volume | Open Interest |
|-------|-------|------------|------------|---------------|
| BTC | lastPrice | priceChangePercent × 100% | value | openInterest |
| ... | ... | ... | ... | ... |

Sort by 24h change to identify outperformers/underperformers.

---

## Portfolio Dashboard

**Goal:** Full account overview with position details.

```bash
# Step 1: Account overview
edgex --json account balances

# Step 2: For each position, get current market price
# (positions are in the balances response at .positionList)
edgex --json market ticker <symbol_from_position>
```

**Dashboard template:**

```
=== Account Summary ===
Total Equity:     collateralAssetModelList[0].totalEquity
Available:        collateralAssetModelList[0].availableAmount
Position Value:   collateralAssetModelList[0].totalPositionValueAbs
Margin Used:      totalEquity - availableAmount

=== Positions ===
Symbol | Size | Entry | Current | PnL | PnL%
-------|------|-------|---------|-----|-----
(from positionList + current ticker)

=== Pending Orders ===
(run: edgex --json account orders)
```

---

## Technical Briefing

**Goal:** Technical analysis from kline data.

```bash
# Get last 50 hourly candles
edgex --json market kline BTC -i 1h -n 50
```

**Analysis from kline data:**

1. **Current price vs range:** Compare `close` of latest candle to `high`/`low` across all candles
2. **Support/resistance:** Look for price levels where `low` values cluster (support) and `high` values cluster (resistance)
3. **Trend:** If recent closes are above earlier closes → bullish; below → bearish
4. **Volume analysis:** Compare `size` of recent candles to average. Rising volume + rising price = strong trend
5. **Buy/sell pressure:** `makerBuySize / size` ratio > 0.5 = more buying pressure

---

## Smart Order with Risk Check

**Goal:** Place an order with comprehensive risk validation.

```bash
# Step 1: Check balance
edgex --json account balances

# Step 2: Check current price
edgex --json market ticker SOL

# Step 3: Check max order size
edgex --json order max-size SOL

# Step 4: Check funding rate (for cost estimation)
edgex --json market funding SOL
```

**Validation checklist:**
1. ✅ `availableAmount` > required margin (`size × price / leverage`)
2. ✅ Requested size ≤ `maxBuySize` (or `maxSellSize`)
3. ✅ For stock contracts: check if market is open (avoid market orders during closure)
4. ✅ Calculate daily funding cost: `size × price × fundingRate × (1440/fundingRateIntervalMin)`

**Present to user before execution:**
```
Order Preview:
  Symbol:  SOL
  Side:    BUY
  Type:    LIMIT
  Size:    1.0
  Price:   $80.00
  Value:   $80.00
  Margin:  $8.00 (10x leverage)
  TP:      $84.00 (+5%)
  SL:      $77.60 (-3%)
  Est. daily funding: $0.05

  Available balance: $109.23
  After order margin: $101.23

Proceed? (waiting for user confirmation)
```

---

## Funding Rate Scanner

**Goal:** Find funding arbitrage opportunities across assets.

```bash
# Scan crypto
edgex --json market funding BTC
edgex --json market funding ETH
edgex --json market funding SOL

# Scan equities
edgex --json market funding TSLA
edgex --json market funding NVDA
edgex --json market funding AAPL
```

**Present as table sorted by |funding rate|:**

| Asset | Funding Rate | Annual % | Direction | Interval |
|-------|-------------|----------|-----------|----------|
| SOL | 0.0100% | 87.6% | Longs pay | 4h |
| BTC | 0.0042% | 36.8% | Longs pay | 4h |
| ... | ... | ... | ... | ... |

**Annualized rate formula:**
```
Annual % = |fundingRate| × (1440 / fundingRateIntervalMin) × 365 × 100
```

**Flag opportunities:** |funding rate| > 0.01% = potential funding arbitrage. Explain:
- If funding is very positive: short the perp, long spot elsewhere → earn funding
- If funding is very negative: long the perp, short spot elsewhere → earn funding

---

## Position PnL Monitor

**Goal:** Track all positions with current PnL and auto-close losers.

```bash
# Step 1: Get positions
edgex --json account positions

# Step 2: For each position, get current price
edgex --json market ticker <symbol>
```

**PnL calculation:**
```
For long:  PnL = (currentPrice - entryPrice) × size
For short: PnL = (entryPrice - currentPrice) × |size|
PnL% = PnL / (entryPrice × |size|) × 100
```

**Auto-close rule (if user requests):**
- If PnL% < -5%: close position with market order
- `edgex order create <symbol> <reverse_side> market <size> -y --json`

**Always confirm with user before auto-closing positions.**
