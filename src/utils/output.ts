import chalk from 'chalk';
import Table from 'cli-table3';
import type { OutputFormat } from '../core/types.js';

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printTable(headers: string[], rows: string[][]): void {
  const table = new Table({
    head: headers.map(h => chalk.cyan(h)),
    style: { head: [], border: [] },
  });
  for (const row of rows) {
    table.push(row);
  }
  console.log(table.toString());
}

export function printKeyValue(pairs: [string, string][]): void {
  const maxKeyLen = Math.max(...pairs.map(([k]) => k.length));
  for (const [key, value] of pairs) {
    console.log(`  ${chalk.gray(key.padEnd(maxKeyLen))}  ${value}`);
  }
}

export function formatPrice(value: string | number, highlight = false): string {
  const s = typeof value === 'number' ? value.toFixed(2) : value;
  return highlight ? chalk.white.bold(s) : s;
}

export function formatPnl(value: string): string {
  const n = parseFloat(value);
  if (isNaN(n) || n === 0) return value;
  return n > 0 ? chalk.green(`+${value}`) : chalk.red(value);
}

export function formatPercent(value: string): string {
  const n = parseFloat(value);
  if (isNaN(n) || n === 0) return value;
  const pct = (n * 100).toFixed(2) + '%';
  return n > 0 ? chalk.green(`+${pct}`) : chalk.red(pct);
}

export function output(format: OutputFormat, jsonData: unknown, humanFn: () => void): void {
  if (format === 'json') {
    printJson(jsonData);
  } else {
    humanFn();
  }
}
