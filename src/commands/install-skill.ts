import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, mkdirSync, cpSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { handleError } from '../utils/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getSkillSourceDir(): string {
  // In dist/commands/install-skill.js → go up to package root → openclaw/
  return join(__dirname, '..', '..', 'openclaw');
}

interface Target {
  name: string;
  dir: string;
}

function getTargets(): Target[] {
  const home = homedir();
  return [
    { name: 'Cursor (project)', dir: join(process.cwd(), '.cursor', 'skills', 'edgex-cli') },
    { name: 'Cursor (user)',    dir: join(home, '.cursor', 'skills', 'edgex-cli') },
    { name: 'Claude Code',     dir: join(home, '.claude', 'skills', 'edgex-cli') },
  ];
}

function copyDir(src: string, dest: string): number {
  mkdirSync(dest, { recursive: true });
  let count = 0;

  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      count += copyDir(srcPath, destPath);
    } else {
      cpSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

export function registerInstallSkillCommand(program: Command): void {
  program
    .command('install-skill')
    .description('Install AI agent skill files for Cursor / Claude Code')
    .option('--cursor', 'Install for Cursor only (project-level)')
    .option('--cursor-user', 'Install for Cursor only (user-level)')
    .option('--claude', 'Install for Claude Code only')
    .option('--list', 'Show install targets without installing')
    .action(async (opts: {
      cursor?: boolean;
      cursorUser?: boolean;
      claude?: boolean;
      list?: boolean;
    }) => {
      try {
        const sourceDir = getSkillSourceDir();

        if (!existsSync(sourceDir) || !existsSync(join(sourceDir, 'SKILL.md'))) {
          console.error(chalk.red('Error: Skill files not found in package.'));
          console.error(chalk.gray(`Expected at: ${sourceDir}`));
          console.error(chalk.gray('Try reinstalling: npm install -g @realnaka/edgex-cli'));
          process.exit(1);
        }

        let targets = getTargets();

        if (opts.cursor) targets = targets.filter(t => t.name.includes('project'));
        else if (opts.cursorUser) targets = targets.filter(t => t.name.includes('user'));
        else if (opts.claude) targets = targets.filter(t => t.name.includes('Claude'));

        if (opts.list) {
          console.log(chalk.bold('\nAvailable install targets:\n'));
          for (const t of targets) {
            const exists = existsSync(join(t.dir, 'SKILL.md'));
            const status = exists ? chalk.yellow('(installed)') : chalk.gray('(not installed)');
            console.log(`  ${chalk.cyan(t.name)}  ${status}`);
            console.log(`  ${chalk.gray(t.dir)}\n`);
          }
          return;
        }

        console.log(chalk.bold('\nInstalling EdgeX CLI skill for AI agents...\n'));

        for (const target of targets) {
          try {
            const fileCount = copyDir(sourceDir, target.dir);
            console.log(`  ${chalk.green('✓')} ${target.name} ${chalk.gray(`(${fileCount} files)`)}`);
            console.log(`    ${chalk.gray(target.dir)}`);
          } catch (err: any) {
            console.log(`  ${chalk.red('✗')} ${target.name}`);
            console.log(`    ${chalk.red(err.message)}`);
          }
        }

        console.log(chalk.bold('\nDone!'));
        console.log(chalk.gray('AI agents in Cursor / Claude Code can now use EdgeX CLI with'));
        console.log(chalk.gray('full knowledge of commands, workflows, and trading rules.\n'));
      } catch (err) {
        handleError(err);
      }
    });
}
