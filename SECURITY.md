# Güvenlik / Security

## Açık bildirme / Reporting a vulnerability

Lütfen güvenlik açıklarını herkese açık issue olarak **açmayın**. GitHub'da bu deponun **Security** sekmesinden
**Report a vulnerability** ile özel olarak bildirin:
<https://github.com/tursuntalha/elio/security/advisories/new>

Please do not open public issues for security problems. Use the **Security** tab → **Report a vulnerability**.

Desteklenen sürüm: yalnızca en son sürüm. Elio şu an yalnızca Windows 10/11'de desteklenir.

## Elio ne yapar, neye dokunur / What Elio touches

- **Araçları çalıştırır.** Claude Code, Codex ve OpenCode'u sizin kullanıcı hesabınızla, seçtiğiniz proje klasöründe bir sahte terminalde (node-pty) başlatır. Araçların kendi izin ve güvenlik modeli geçerlidir. "Tüm izinler açık" modları (`--dangerously-skip-permissions`, `--yolo`) araçların onay istemlerini atlar; yalnızca güvendiğiniz klasörlerde kullanın. Bu modlar varsayılan olarak kapalıdır.
- **Giriş durumu.** `claude auth status`, `codex login status` ve `opencode auth list` salt okunur komutlarının çıktısını okur. Çıktıdan yalnızca giriş durumu ve (OpenCode için) sağlayıcı adları kullanılır; e-posta, kuruluş adı gibi alanlar atılır. Giriş düğmesi aracın kendi `login` komutunu bir terminal sekmesinde çalıştırır; terminale yazdığınız şifre veya kod olduğu gibi aracın girişine iletilir; Elio bunları saklamaz, kaydetmez ve ayrıca işlemez.
- **Ağ ve telemetri yok.** Elio kendisi hiçbir ağ isteği yapmaz ve kullanım verisi göndermez; Anthropic, OpenAI veya başka bir servise bağlanmaz, hesap anahtarlarını veya token'larını okumaz. Araçlar (Claude Code, Codex, OpenCode) kendi politikalarına göre ağa bağlanır. Yalnızca kurulum sırasında npm paketleri ve Electron indirilir.
- **Yerel veri.** Ayarlar (görünüm, başlatma modları, varsayılan araç, son projeler, favoriler) `%APPDATA%\agent-terminal` altında düz JSON olarak tutulur. Konuşma içeriği Elio tarafından saklanmaz.
- **Masaüstü penceresi.** Electron `contextIsolation` ve `sandbox` açık, `nodeIntegration` kapalı çalışır; arayüz yerel bir özel protokolden yüklenir, dış gezinme ve yeni pencere engellenir.
- **Windows başlatıcısı.** `desktop/Elio.exe` depoda tutulmaz; `elio --setup-shortcut` sırasında `desktop/launcher.cs`'ten yerel olarak derlenir (Windows'un yerleşik C# derleyicisi). İmzasızdır; kaynağı kısadır ve incelenebilir.

## Dikkat edilmesi gerekenler / Things to be aware of

- Elio, araçların çıktısını ve girdisini aynı pencerede gösterir. Terminale yapıştırdığınız veya yazdığınız her şey doğrudan o araca gider.
