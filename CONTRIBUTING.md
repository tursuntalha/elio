# Katkı rehberi / Contributing

Katkılarınız memnuniyetle karşılanır. Elio şu an **yalnızca Windows 10/11** için geliştirilir ve test edilir.
Contributions are welcome. Elio is currently developed and tested on **Windows 10/11 only**.

## Başlamak / Getting started

```sh
git clone https://github.com/tursuntalha/elio.git
cd elio
npm ci
npm run check
npm test
npm start            # terminal sürümü / terminal UI
npm run start:window # masaüstü penceresi / desktop window
```

Node.js 22.12 veya üzeri gerekir. `npm test` ve `npm run check` hiçbir yapay zekâ aracı kurulu olmadan çalışır.
`npm run test:ui` ve `npm run test:projects` gerçek pencereler açar; `test:ui` makinenizde kurulu Claude Code, Codex ve OpenCode'u da başlatır.

## Proje yapısı / Layout

| Klasör | İçerik |
| --- | --- |
| `bin/` | `elio` komutu |
| `src/` | Ortak mantık: oturumlar, denetleyici, giriş durumu, terminal arayüzü |
| `desktop/` | Electron ana süreci ve Windows başlatıcısı (`launcher.cs`) |
| `media/` | Masaüstü arayüzü (HTML/CSS/JS) |
| `assets/`, `data/` | Simgeler, logolar, yazı tipleri, renk paletleri |
| `scripts/` | Simge, font, palet ve kısayol üretimi |
| `test/` | Birim ve uçtan uca testler |

## Kurallar / Guidelines

- **Küçük ve odaklı PR'lar** açın; bir PR bir konuyu çözsün.
- Davranış değişikliğine **test** ekleyin. Arayüz değişikliğinde bir ekran görüntüsü ekleyin.
- `npm run check` ve `npm test` geçmeli. CI bunları Windows üzerinde çalıştırır.
- Dosyalar **LF** satır sonu ve UTF-8 kullanır (`.gitattributes`/`.editorconfig`).
- Arayüz metinleri şu an Türkçedir; başka dil eklemek isterseniz önce bir issue açıp konuşalım.
- **Anahtar, token ve kişisel yol** içeren çıktıyı issue veya PR'a yapıştırmayın.
- Hiçbir şeyi sessizce başka yere göndermeyin: Elio'nun ağa yaptığı her çağrı `README`'de ve `SECURITY.md`'de belgelidir; yenisi eklenecekse orada da açıklanmalıdır.
- Yeni üçüncü taraf varlık (font, simge, veri) eklerseniz lisansını `THIRD_PARTY_NOTICES.md`'ye yazın.

## Simgeler ve logo / Icons and logo

`npm run brand:build` logo ve uygulama simgesi kaynaklarını, `npm run icons:generate` PNG/ICO dosyalarını üretir.
`desktop/Elio.exe` depoda tutulmaz; `elio --setup-shortcut` Windows'un yerleşik C# derleyicisiyle üretir (`npm run launcher:build`).

## Sürüm / Release

Sürüm notları `CHANGELOG.md`'dedir. Sürüm numarası `package.json`, `media/view.html` (görünen sürüm) ve `desktop/launcher.cs` içinde birlikte güncellenir.
