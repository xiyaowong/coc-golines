# coc-golines

<p align="center">
  <strong>golines extension for coc.nvim</strong>
</p>

<p align="center">
  <a href="https://github.com/golangci/golines"><img src="https://img.shields.io/badge/powered%20by-golines-00ADD8.svg?style=flat-square" alt="golines"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="License"></a>
</p>

---

[golines](https://github.com/golangci/golines) extension for [coc.nvim](https://github.com/neoclide/coc.nvim).

---

## 📦 Installation

```vim
:CocInstall coc-golines
```

> Automatically downloads prebuilt `golines` binaries on first launch if not found.

---

## ⌨️ Commands

| Command                   | Description                                       |
| :------------------------ | :------------------------------------------------ |
| `golines.reinstall`       | Reinstall or update the latest `golines` binary   |
| `golines.formatWorkspace` | Format all Go files in workspace (`golines -w .`) |

---

## ⚙️ Settings

```jsonc
// In :CocConfig
{
  "golines.enable": true,
  "golines.path": null,
  "golines.args": [],
  "golines.checkUpdate": true
}
```

---

## 📄 License

[MIT](LICENSE) © [wongxy](https://github.com/xiyaowong)
