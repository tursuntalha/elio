# Elio

Claude Code, Codex ve OpenCode'u tek yerden açan, özelleştirilebilir bir Windows terminali. Birden fazla oturumu sekmelerde çalıştırabilir, oturumlara ad verebilir ve temaları favorilere ekleyebilirsin.

![Elio ana ekranı](assets/screenshot.png)

## Kurulum

Windows 10 veya 11, Git ve Node.js 22.12+ gerekir. Kullanacağın agent'ın komutu terminalde çalışıyor olmalı.

```powershell
git clone https://github.com/tursuntalha/elio.git
cd elio
npm ci
npm link
```

## Kullanım

- `elio` bulunduğun terminalde ve klasörde açılır.
- `elio --window` ayrı pencere açar ve son projeleri gösterir.
- `elio --setup-shortcut` masaüstü ve Başlat menüsü kısayollarını oluşturur.

Oturuma özel görünüm anında uygulanır. Genel görünüm yeni oturumlarda kullanılır. Ayrı pencerede yazı tipini de seçebilirsin.

[MIT](LICENSE) · [Paletler](data/Gogh-LICENSE-MIT.txt) · [Yazı tipleri](assets/fonts) · [Agent simgeleri](assets/brands/LICENSE.txt)
