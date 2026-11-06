#!/usr/bin/env node
if (process.platform !== 'win32') {
  console.error('Elio şu an yalnızca Windows 10/11 için hazırlandı.\nElio currently supports Windows 10/11 only.');
  process.exit(1);
}
const path = require('node:path');
const { spawn } = require('node:child_process');
const { parseArguments } = require('../src/cli-options.cjs');

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.action === 'help') {
    console.log('Elio\n\n  elio                  Bu terminalde çalışma alanını aç\n  elio [klasör]         Seçilen klasörle bu terminalde aç\n  elio --window         Proje seçim ekranını aç\n  elio --setup-shortcut Masaüstü uygulama kısayolunu oluştur\n  elio --setup-vscode   VS Code F tuşlarını ayarla (yedek alır)\n  elio --version        Sürümü göster\n\n  F1 Yardım · F2 Yeni · F3 Oturum teması · F4 Genel tema\n  F6/F7 Önceki/sonraki · F8 Kapat · F9 Menü · F10 Çıkış');
  } else if (options.action === 'version') {
    console.log(require('../package.json').version);
  } else if (options.action === 'setup-shortcut') {
    require('../scripts/install-shortcut.cjs');
  } else if (options.action === 'setup-vscode') {
    const result = require('../src/vscode-keys.cjs').installVSCodeKeys();
    console.log(result.added ? 'VS Code F tuşları ayarlandı.' : 'VS Code F tuşları zaten ayarlı.');
    if (result.backup) console.log('Önceki kısayolların yedeği: ' + result.backup);
  } else if (options.action === 'terminal') {
    await require('../src/terminal-ui.cjs').runTerminalUI(options.cwd);
  } else {
    const electron = require('electron');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const hasFolder = process.argv.slice(2).some(value => !value.startsWith('--'));
    const child = spawn(electron, [path.join(__dirname, '..', 'desktop', 'main.cjs'), ...(hasFolder ? ['--cwd', options.cwd] : [])], {
      cwd: options.cwd, env, detached: true, stdio: 'ignore', windowsHide: false
    });
    child.once('error', error => { console.error('Elio açılamadı: ' + error.message); process.exitCode = 1; });
    child.once('spawn', () => { child.unref(); console.log('Elio açılıyor.'); });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
