import { Command } from 'commander';
import chalk from 'chalk';
import { createInterface } from 'node:readline';
import type { OutputFormat, ContractMeta, CoinMeta } from '../core/types.js';
import { EdgexClient } from '../core/client.js';
import { loadConfig } from '../core/config.js';
import { loadCachedContracts, saveCachedContracts, resolveSymbol, getCachedCoins, findCoin } from '../core/symbols.js';
import { computeL2OrderFields, type L2OrderMeta } from '../core/l2-signer.js';
import { output, printKeyValue } from '../utils/output.js';
import { handleError, EdgexError } from '../utils/errors.js';

let client: EdgexClient;
let contracts: ContractMeta[];
let coins: CoinMeta[];
let starkPrivateKey: string;

async function init(): Promise<void> {
  const config = await loadConfig();
  client = new EdgexClient(config);
  starkPrivateKey = config.starkPrivateKey ?? '';

  const cached = await loadCachedContracts();
  if (cached) {
    contracts = cached;
    coins = getCachedCoins() ?? [];
  } else {
    const meta = await client.getMetaData();
    contracts = meta.contractList;
    coins = meta.coinList ?? [];
    await saveCachedContracts(contracts, coins);
  }
}

function getFormat(cmd: Command): OutputFormat {
  return cmd.optsWithGlobals().json ? 'json' : 'human';
}

async function confirmOrder(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(resolve => {
    rl.question(message, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

function contractName(contractId: string): string {
  const c = contracts.find(ct => ct.contractId === contractId);
  return c?.contractName ?? contractId;
}

function getL2Meta(contract: ContractMeta): L2OrderMeta {
  const quoteCoin = findCoin(coins, contract.quoteCoinId ?? '1000');
  if (!contract.starkExSyntheticAssetId || !contract.starkExResolution) {
    throw new EdgexError(`Missing StarkEx metadata for ${contract.contractName}. Try clearing cache: rm ~/.edgex/contracts.json`);
  }
  if (!quoteCoin?.starkExAssetId || !quoteCoin?.starkExResolution) {
    throw new EdgexError(`Missing StarkEx metadata for quote coin. Try clearing cache: rm ~/.edgex/contracts.json`);
  }
  return {
    starkExSyntheticAssetId: contract.starkExSyntheticAssetId,
    syntheticResolution: contract.starkExResolution,
    collateralAssetId: quoteCoin.starkExAssetId,
    collateralResolution: quoteCoin.starkExResolution,
    feeRate: contract.defaultTakerFeeRate ?? '0.001',
    tickSize: contract.tickSize,
  };
}

export function registerOrderCommand(program: Command): void {
  const order = program
    .command('order')
    .description('Order management (requires authentication)');

  // ─── status ───

  order
    .command('status <orderId>')
    .description('Query order status by ID')
    .action(async (orderId: string, _opts: unknown, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const data = await client.getOrderById(orderId);
        const d = data as unknown as Record<string, unknown>;

        output(fmt, data, () => {
          console.log(chalk.bold('Order Details\n'));
          printKeyValue([
            ['Order ID', String(d.orderId ?? '')],
            ['Symbol', contractName(String(d.contractId ?? ''))],
            ['Side', String(d.side ?? '')],
            ['Type', String(d.type ?? d.orderType ?? '')],
            ['Price', String(d.price ?? '')],
            ['Size', String(d.size ?? '')],
            ['Filled', String(d.filledSize ?? d.cumFilledSize ?? '0')],
            ['Status', String(d.status ?? '')],
            ['Created', d.createdTime ? new Date(Number(d.createdTime)).toLocaleString() : ''],
          ]);
        });
      } catch (err) { handleError(err); }
    });

  // ─── cancel ───

  order
    .command('cancel <orderIds>')
    .description('Cancel order(s) by ID (comma-separated for batch)')
    .action(async (orderIds: string, _opts: unknown, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const ids = orderIds.split(',').map(id => id.trim()).filter(Boolean);
        const data = await client.cancelOrderById(ids);

        output(fmt, data, () => {
          console.log(chalk.green(`Cancelled ${ids.length} order(s): ${ids.join(', ')}`));
        });
      } catch (err) { handleError(err); }
    });

  // ─── cancel-all ───

  order
    .command('cancel-all')
    .description('Cancel all open orders')
    .option('-s, --symbol <symbol>', 'Cancel only for this symbol')
    .action(async (opts: { symbol?: string }, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const contractId = opts.symbol ? resolveSymbol(contracts, opts.symbol)?.contractId : undefined;
        const data = await client.cancelAllOrder(contractId);

        output(fmt, data, () => {
          const scope = opts.symbol ? ` for ${opts.symbol}` : '';
          console.log(chalk.green(`All orders cancelled${scope}`));
        });
      } catch (err) { handleError(err); }
    });

  // ─── max-size ───

  order
    .command('max-size <symbol>')
    .description('Query maximum order size')
    .option('--price <price>', 'Limit price for calculation')
    .action(async (symbol: string, opts: { price?: string }, cmd: Command) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const contract = resolveSymbol(contracts, symbol);
        if (!contract) throw new EdgexError(`Unknown symbol: ${symbol}`);

        const data = await client.getMaxCreateOrderSize(contract.contractId, opts.price);
        const d = data as unknown as Record<string, unknown>;

        output(fmt, data, () => {
          console.log(chalk.bold(`Max Order Size: ${contract.contractName}\n`));
          printKeyValue([
            ['Max Buy Size', String(d.maxBuySize ?? d.maxBuyOrderSize ?? 'N/A')],
            ['Max Sell Size', String(d.maxSellSize ?? d.maxSellOrderSize ?? 'N/A')],
          ]);
        });
      } catch (err) { handleError(err); }
    });

  // ─── create ───

  order
    .command('create <symbol> <side> <type> <size>')
    .description('Create order (limit/market)')
    .option('--price <price>', 'Limit price (required for limit orders)')
    .option('--tp <price>', 'Take profit price')
    .option('--sl <price>', 'Stop loss price')
    .option('--client-id <id>', 'Client order ID')
    .option('-y, --yes', 'Skip order confirmation prompt')
    .action(async (
      symbol: string,
      side: string,
      type: string,
      size: string,
      opts: { price?: string; tp?: string; sl?: string; clientId?: string; yes?: boolean },
      cmd: Command,
    ) => {
      try {
        await init();
        const fmt = getFormat(cmd);
        const contract = resolveSymbol(contracts, symbol);
        if (!contract) throw new EdgexError(`Unknown symbol: ${symbol}`);

        const sideUpper = side.toUpperCase() as 'BUY' | 'SELL';
        const typeUpper = type.toUpperCase() as 'LIMIT' | 'MARKET';

        if (sideUpper !== 'BUY' && sideUpper !== 'SELL') {
          throw new EdgexError('Side must be "buy" or "sell"');
        }
        if (typeUpper !== 'LIMIT' && typeUpper !== 'MARKET') {
          throw new EdgexError('Type must be "limit" or "market"');
        }
        if (typeUpper === 'LIMIT' && !opts.price) {
          throw new EdgexError('--price is required for limit orders');
        }

        // Get oracle price for market orders
        let oraclePrice: string | undefined;
        if (typeUpper === 'MARKET') {
          const tickers = await client.getTicker(contract.contractId);
          if (tickers.length > 0) {
            oraclePrice = tickers[0]!.oraclePrice;
          }
        }

        // Compute L2 signing fields
        const l2Meta = getL2Meta(contract);
        const l2Fields = computeL2OrderFields(
          {
            side: sideUpper,
            type: typeUpper,
            size,
            price: opts.price,
            oraclePrice,
            accountId: client.currentAccountId!,
          },
          l2Meta,
          starkPrivateKey,
        );

        // EdgeX API requires price='0' for market orders; the L2 signature
        // already embeds the aggressive price via l2-signer's l2Price calculation.
        let orderPrice: string;
        let displayPrice: string | undefined;
        if (typeUpper === 'MARKET') {
          orderPrice = '0';
          const oracle = parseFloat(oraclePrice || '0');
          if (sideUpper === 'BUY') {
            displayPrice = String(Math.ceil(oracle * 1.1 * 100) / 100);
          } else {
            displayPrice = String(Math.floor(oracle * 0.9 * 100) / 100);
          }
        } else {
          orderPrice = opts.price!;
        }

        // Build order body
        const orderBody: Record<string, unknown> = {
          contractId: contract.contractId,
          price: orderPrice,
          size,
          type: typeUpper,
          side: sideUpper,
          timeInForce: typeUpper === 'MARKET' ? 'IMMEDIATE_OR_CANCEL' : 'GOOD_TIL_CANCEL',
          reduceOnly: false,
          clientOrderId: l2Fields.clientOrderId,
          expireTime: l2Fields.expireTime,
          l2Nonce: l2Fields.l2Nonce,
          l2Value: l2Fields.l2Value,
          l2Size: l2Fields.l2Size,
          l2LimitFee: l2Fields.l2LimitFee,
          l2ExpireTime: l2Fields.l2ExpireTime,
          l2Signature: l2Fields.l2Signature,
          isPositionTpsl: false,
          isSetOpenTp: false,
          isSetOpenSl: false,
        };

        // TP/SL — each sub-order needs its own L2 signature
        if (opts.tp) {
          const tpSide = (sideUpper === 'BUY' ? 'SELL' : 'BUY') as 'BUY' | 'SELL';
          const tpL2 = computeL2OrderFields(
            { side: tpSide, type: 'MARKET', size, oraclePrice: tpSide === 'BUY' ? opts.tp : undefined, accountId: client.currentAccountId! },
            l2Meta,
            starkPrivateKey,
          );
          orderBody.isSetOpenTp = true;
          orderBody.openTp = {
            side: tpSide,
            price: '0',
            size,
            triggerPrice: opts.tp,
            triggerPriceType: 'ORACLE_PRICE',
            clientOrderId: tpL2.clientOrderId,
            expireTime: tpL2.expireTime,
            l2Nonce: tpL2.l2Nonce,
            l2Value: tpL2.l2Value,
            l2Size: tpL2.l2Size,
            l2LimitFee: tpL2.l2LimitFee,
            l2ExpireTime: tpL2.l2ExpireTime,
            l2Signature: tpL2.l2Signature,
          };
        }
        if (opts.sl) {
          const slSide = (sideUpper === 'BUY' ? 'SELL' : 'BUY') as 'BUY' | 'SELL';
          const slL2 = computeL2OrderFields(
            { side: slSide, type: 'MARKET', size, oraclePrice: slSide === 'BUY' ? opts.sl : undefined, accountId: client.currentAccountId! },
            l2Meta,
            starkPrivateKey,
          );
          orderBody.isSetOpenSl = true;
          orderBody.openSl = {
            side: slSide,
            price: '0',
            size,
            triggerPrice: opts.sl,
            triggerPriceType: 'ORACLE_PRICE',
            clientOrderId: slL2.clientOrderId,
            expireTime: slL2.expireTime,
            l2Nonce: slL2.l2Nonce,
            l2Value: slL2.l2Value,
            l2Size: slL2.l2Size,
            l2LimitFee: slL2.l2LimitFee,
            l2ExpireTime: slL2.l2ExpireTime,
            l2Signature: slL2.l2Signature,
          };
        }

        if (!opts.yes) {
          const sideColor = sideUpper === 'BUY' ? chalk.green(sideUpper) : chalk.red(sideUpper);
          const typeColor = typeUpper === 'MARKET' ? chalk.red(typeUpper) : chalk.cyan(typeUpper);

          console.error(chalk.bold('\nOrder Preview:\n'));
          console.error(`  Symbol:  ${contract.contractName}`);
          console.error(`  Side:    ${sideColor}`);
          console.error(`  Type:    ${typeColor}`);
          console.error(`  Size:    ${size}`);
          if (typeUpper === 'MARKET') {
            console.error(`  Price:   ${chalk.red('MARKET')} (oracle ~${displayPrice})`);
          } else {
            console.error(`  Price:   ${orderPrice}`);
          }
          if (opts.tp) console.error(`  TP:      ${opts.tp}`);
          if (opts.sl) console.error(`  SL:      ${opts.sl}`);
          console.error('');

          if (typeUpper === 'MARKET') {
            console.error(chalk.yellow('  ⚠  Market orders execute at best available price'));
          }

          const confirmed = await confirmOrder(chalk.bold('  Confirm order? [y/N] '));
          if (!confirmed) {
            console.error(chalk.yellow('Order cancelled.'));
            return;
          }
        }

        const data = await client.createOrder(orderBody);
        const d = data as unknown as Record<string, unknown>;

        output(fmt, data, () => {
          console.log(chalk.green('Order created successfully\n'));
          printKeyValue([
            ['Order ID', String(d.orderId ?? '')],
            ['Client Order ID', l2Fields.clientOrderId],
            ['Symbol', contract.contractName],
            ['Side', sideUpper],
            ['Type', typeUpper],
            ['Size', size],
            ['Price', opts.price ?? 'MARKET'],
          ]);
        });
      } catch (err) { handleError(err); }
    });

  // ─── set-tpsl ───

  order
    .command('set-tpsl <symbol>')
    .description('Set take-profit / stop-loss on an existing position')
    .option('--tp <price>', 'Take profit trigger price')
    .option('--sl <price>', 'Stop loss trigger price')
    .option('--size <size>', 'Size (default: full position)')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (
      symbol: string,
      opts: { tp?: string; sl?: string; size?: string; yes?: boolean },
      cmd: Command,
    ) => {
      try {
        await init();
        const fmt = getFormat(cmd);

        if (!opts.tp && !opts.sl) {
          throw new EdgexError('At least one of --tp or --sl is required');
        }

        const contract = resolveSymbol(contracts, symbol);
        if (!contract) throw new EdgexError(`Unknown symbol: ${symbol}`);

        const accountData = await client.getAccountAsset();
        const raw = accountData as unknown as Record<string, unknown>;
        const positions = (raw.positionList ?? raw.positions ?? []) as Record<string, unknown>[];
        const position = positions.find(p => String(p.contractId) === contract.contractId);

        if (!position) {
          throw new EdgexError(`No open position for ${contract.contractName}. TP/SL can only be set on existing positions.`);
        }

        const posSide = String(position.side ?? '').toUpperCase();
        const posSize = opts.size || String(position.size ?? position.openSize ?? '0');
        const closeSide: 'BUY' | 'SELL' = posSide === 'LONG' || posSide === 'BUY' ? 'SELL' : 'BUY';

        if (!opts.yes) {
          const sideColor = posSide.includes('LONG') || posSide === 'BUY'
            ? chalk.green('LONG') : chalk.red('SHORT');

          console.error(chalk.bold('\nPosition TP/SL Preview:\n'));
          console.error(`  Symbol:    ${contract.contractName}`);
          console.error(`  Position:  ${sideColor} × ${posSize}`);
          if (opts.tp) console.error(`  TP:        ${chalk.green(opts.tp)}`);
          if (opts.sl) console.error(`  SL:        ${chalk.red(opts.sl)}`);
          console.error('');

          const confirmed = await confirmOrder(chalk.bold('  Confirm? [y/N] '));
          if (!confirmed) {
            console.error(chalk.yellow('Cancelled.'));
            return;
          }
        }

        const l2Meta = getL2Meta(contract);
        const results: Record<string, unknown>[] = [];

        if (opts.tp) {
          const tpL2 = computeL2OrderFields(
            {
              side: closeSide,
              type: 'MARKET',
              size: posSize,
              oraclePrice: closeSide === 'BUY' ? opts.tp : undefined,
              accountId: client.currentAccountId!,
            },
            l2Meta,
            starkPrivateKey,
          );
          const tpBody: Record<string, unknown> = {
            contractId: contract.contractId,
            side: closeSide,
            type: 'TAKE_PROFIT_MARKET',
            size: posSize,
            price: '0',
            triggerPrice: opts.tp,
            triggerPriceType: 'INDEX_PRICE',
            timeInForce: 'IMMEDIATE_OR_CANCEL',
            reduceOnly: true,
            isPositionTpsl: true,
            isSetOpenTp: false,
            isSetOpenSl: false,
            clientOrderId: tpL2.clientOrderId,
            expireTime: tpL2.expireTime,
            l2Nonce: tpL2.l2Nonce,
            l2Value: tpL2.l2Value,
            l2Size: tpL2.l2Size,
            l2LimitFee: tpL2.l2LimitFee,
            l2ExpireTime: tpL2.l2ExpireTime,
            l2Signature: tpL2.l2Signature,
          };
          const tpResult = await client.createOrder(tpBody);
          results.push({ type: 'TP', ...(tpResult as Record<string, unknown>) });
        }

        if (opts.sl) {
          const slL2 = computeL2OrderFields(
            {
              side: closeSide,
              type: 'MARKET',
              size: posSize,
              oraclePrice: closeSide === 'BUY' ? opts.sl : undefined,
              accountId: client.currentAccountId!,
            },
            l2Meta,
            starkPrivateKey,
          );
          const slBody: Record<string, unknown> = {
            contractId: contract.contractId,
            side: closeSide,
            type: 'STOP_MARKET',
            size: posSize,
            price: '0',
            triggerPrice: opts.sl,
            triggerPriceType: 'INDEX_PRICE',
            timeInForce: 'IMMEDIATE_OR_CANCEL',
            reduceOnly: true,
            isPositionTpsl: true,
            isSetOpenTp: false,
            isSetOpenSl: false,
            clientOrderId: slL2.clientOrderId,
            expireTime: slL2.expireTime,
            l2Nonce: slL2.l2Nonce,
            l2Value: slL2.l2Value,
            l2Size: slL2.l2Size,
            l2LimitFee: slL2.l2LimitFee,
            l2ExpireTime: slL2.l2ExpireTime,
            l2Signature: slL2.l2Signature,
          };
          const slResult = await client.createOrder(slBody);
          results.push({ type: 'SL', ...(slResult as Record<string, unknown>) });
        }

        output(fmt, results, () => {
          console.log(chalk.green('TP/SL set successfully\n'));
          for (const r of results) {
            printKeyValue([
              ['Type', String(r.type ?? '')],
              ['Order ID', String(r.orderId ?? '')],
              ['Symbol', contract.contractName],
              ['Side', closeSide],
              ['Size', posSize],
              ['Trigger', String(r.type === 'TP' ? opts.tp : opts.sl)],
            ]);
            console.log('');
          }
        });
      } catch (err) { handleError(err); }
    });
}
