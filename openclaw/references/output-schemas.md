# EdgeX CLI Output Schemas

Complete JSON response structures for every `--json` command. All numeric values are returned as **strings**.

## Contents

- [market ticker](#market-ticker)
- [market depth](#market-depth)
- [market kline](#market-kline)
- [market funding](#market-funding)
- [market ratio](#market-ratio)
- [account balances](#account-balances)
- [account positions](#account-positions)
- [account orders](#account-orders)
- [order max-size](#order-max-size)
- [order create](#order-create)
- [order status](#order-status)
- [stream output](#stream-output-ndjson)

---

## market ticker

`edgex --json market ticker BTC`

Returns an **array** with one ticker object per symbol (one if symbol specified, all if omitted).

```json
[
  {
    "contractId": "10000001",
    "contractName": "BTCUSD",
    "priceChange": "502.4",
    "priceChangePercent": "0.007583",
    "trades": "181774",
    "size": "8788.011",
    "value": "596601656.3213",
    "high": "70082.4",
    "low": "65268.8",
    "open": "66249.3",
    "close": "66751.7",
    "highTime": "1772470019139",
    "lowTime": "1772460244382",
    "startTime": "1772448300000",
    "endTime": "1772534700000",
    "lastPrice": "66751.7",
    "indexPrice": "66790.992358028",
    "oraclePrice": "66759.850000962615",
    "markPrice": "66759.850000962615",
    "openInterest": "7847.135",
    "fundingRate": "0.00004198",
    "fundingTime": "1772524800000",
    "nextFundingTime": "1772539200000"
  }
]
```

**Key fields:**
| Field | Description |
|-------|-------------|
| `lastPrice` | Most recent traded price |
| `priceChangePercent` | 24h change as decimal (0.007583 = 0.76%) |
| `size` | 24h volume in base asset (e.g., BTC) |
| `value` | 24h volume in USDT |
| `openInterest` | Total open interest in base asset |
| `fundingRate` | Current funding rate as decimal |
| `oraclePrice` | Oracle price (used for liquidation) |
| `indexPrice` | Weighted average across major exchanges |

---

## market depth

`edgex --json market depth BTC`

Returns a single object with asks (ascending) and bids (descending).

```json
{
  "startVersion": "2893481470",
  "endVersion": "2893481472",
  "level": 15,
  "contractId": "10000001",
  "contractName": "BTCUSD",
  "asks": [
    { "price": "66739.9", "size": "1.791" },
    { "price": "66741.2", "size": "3.102" }
  ],
  "bids": [
    { "price": "66738.5", "size": "2.100" },
    { "price": "66737.0", "size": "1.500" }
  ]
}
```

**Key fields:**
| Field | Description |
|-------|-------------|
| `asks` | Sell orders, sorted price ascending (best ask first) |
| `bids` | Buy orders, sorted price descending (best bid first) |
| `asks[0].price` | Best ask (lowest sell price) |
| `bids[0].price` | Best bid (highest buy price) |
| Spread | `parseFloat(asks[0].price) - parseFloat(bids[0].price)` |

---

## market kline

`edgex --json market kline BTC -i 1h -n 3`

Returns an object with `dataList` array of candles (newest first).

```json
{
  "dataList": [
    {
      "klineId": "687194849732118268",
      "contractId": "10000001",
      "contractName": "BTCUSD",
      "klineType": "HOUR_1",
      "klineTime": "1772528400000",
      "priceType": "LAST_PRICE",
      "trades": "16202",
      "size": "477.870",
      "value": "31848179.0393",
      "high": "67156.0",
      "low": "66318.4",
      "open": "66972.0",
      "close": "66615.5",
      "makerBuySize": "265.272",
      "makerBuyValue": "17667909.9031"
    }
  ],
  "nextPageOffsetData": "0880B3FC93CB3310..."
}
```

**Key fields:**
| Field | Description |
|-------|-------------|
| `klineTime` | Candle start time (Unix ms) |
| `open`, `high`, `low`, `close` | OHLC prices |
| `size` | Volume in base asset |
| `value` | Volume in USDT |
| `makerBuySize` | Buy-side volume (useful for buy/sell pressure analysis) |

---

## market funding

`edgex --json market funding BTC`

Returns an array with one funding object.

```json
[
  {
    "contractId": "10000001",
    "fundingTime": "1772524800000",
    "fundingTimestamp": "1772534760000",
    "oraclePrice": "66748.550001066178",
    "markPrice": "66748.550001066178",
    "indexPrice": "66748.482118076",
    "fundingRate": "0.00003953",
    "isSettlement": false,
    "forecastFundingRate": "0.00004198",
    "previousFundingRate": "0.00002194",
    "previousFundingTimestamp": "1772524740000",
    "premiumIndex": "-0.00042520",
    "avgPremiumIndex": "-0.00045802",
    "impactMarginNotional": "100",
    "impactAskPrice": "66720.1",
    "impactBidPrice": "66709.8",
    "interestRate": "0.0003",
    "predictedFundingRate": "0.00005000",
    "fundingRateIntervalMin": "240"
  }
]
```

**Key fields:**
| Field | Description |
|-------|-------------|
| `fundingRate` | Current rate (positive = longs pay shorts) |
| `forecastFundingRate` | Predicted next funding rate |
| `previousFundingRate` | Last settlement rate |
| `fundingRateIntervalMin` | Interval in minutes (240 = 4 hours) |
| `fundingTime` | Next settlement time (Unix ms) |
| Daily funding cost | `position_value * fundingRate * (1440 / fundingRateIntervalMin)` |

---

## market ratio

`edgex --json market ratio BTC`

Returns long/short ratio data aggregated from multiple exchanges (Binance, OKX, Bybit, etc.).

---

## account balances

`edgex --json account balances`

Returns a complex object. Key paths for common data:

```
.collateralList[0].amount              → Total USDT balance (e.g., "109.233963")
.collateralAssetModelList[0].availableAmount  → Available for trading
.collateralAssetModelList[0].totalEquity      → Total equity including unrealized PnL
.collateralAssetModelList[0].totalPositionValueAbs → Total position notional value
.positionList                          → Array of open positions (same as account positions)
.account.id                            → Account ID
.account.contractIdToTradeSetting      → Per-contract leverage settings
```

**Important:** The balance amount is in the `collateralList`, NOT at the top level. `availableAmount` accounts for margin used by open positions and pending orders.

---

## account positions

`edgex --json account positions`

Returns an array of position objects. Empty array `[]` if no open positions.

When positions exist, key fields per position:

```
.contractId          → Contract ID (e.g., "10000001")
.contractName        → Symbol (e.g., "BTCUSD")
.size                → Position size (positive = long, negative = short)
.entryPrice          → Average entry price
.markPrice           → Current mark price
.unrealizedPnl       → Unrealized profit/loss in USDT
.liquidatePrice      → Estimated liquidation price
.leverage            → Current leverage
```

---

## account orders

`edgex --json account orders`

Returns an array of active order objects. Empty array `[]` if no active orders.

Key fields per order:

```
.orderId             → Order ID (use for cancel/status)
.contractId          → Contract ID
.side                → "BUY" or "SELL"
.type                → "LIMIT", "MARKET", "TAKE_PROFIT_MARKET", "STOP_MARKET"
.size                → Order size
.price               → Limit price (or "0" for market)
.status              → "OPEN", "FILLED", "CANCELED", etc.
.isPositionTpsl      → true if this is a TP/SL order
.reduceOnly          → true if reduce-only
```

---

## order max-size

`edgex --json order max-size BTC`

```json
{
  "maxBuySize": "0.016",
  "maxSellSize": "0.016",
  "ask1Price": "66760.4",
  "bid1Price": "66752.5"
}
```

| Field | Description |
|-------|-------------|
| `maxBuySize` | Maximum long position size |
| `maxSellSize` | Maximum short position size |
| `ask1Price` | Best ask (for reference) |
| `bid1Price` | Best bid (for reference) |

---

## order create

`edgex order create BTC buy limit 0.01 --price 60000 -y --json`

On success, returns the created order object with `orderId` for tracking.

---

## order status

`edgex --json order status <orderId>`

Returns the full order object with current status. Key statuses:
- `OPEN` — Active on order book
- `FILLED` — Fully executed
- `CANCELED` — Canceled by user
- `UNTRIGGERED` — Conditional order waiting for trigger (TP/SL)

---

## stream output (NDJSON)

Stream commands output one JSON object per line (Newline-Delimited JSON):

```bash
edgex stream ticker BTC
# Each line is a complete JSON object:
# {"contractName":"BTCUSD","lastPrice":"66751.7","volume":"8788.011",...}
# {"contractName":"BTCUSD","lastPrice":"66753.2","volume":"8789.100",...}
```

Pipe with `head -n 1` for a single snapshot, or process line-by-line for continuous monitoring.
