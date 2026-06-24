# digest-automation Specification

## Purpose

定義日報的自動化排程與發佈:GitHub Actions cron 每日觸發、完整的產生與部署流程、歷史資料於 repo 的累積、API key 的密鑰安全管理，以及產生失敗時保護既有線上站點的機制。

## Requirements

### Requirement: 每日排程觸發

系統 SHALL 透過 GitHub Actions cron 於 UTC 23:00（等同台北時間 07:00）每日自動觸發日報產生與發佈流程。該 workflow MUST 同時支援手動觸發（`workflow_dispatch`）以便測試與補跑。

#### Scenario: 排程自動執行

- **WHEN** 到達 UTC 23:00
- **THEN** GitHub Actions 自動啟動日報 workflow，執行產生、build 與部署

#### Scenario: 手動觸發

- **WHEN** 使用者於 GitHub Actions 介面手動觸發該 workflow
- **THEN** workflow 立即執行完整的產生與發佈流程

### Requirement: 完整發佈流程

workflow SHALL 依序執行:呼叫 Gemini 產生當日資料 → 將 `data/YYYY-MM-DD.json` commit 回 repo → 以 vite-ssg build → 部署至 GitHub Pages。整體流程 SHALL 設計為能在排程觸發後約 30 分鐘內（即台北 07:30 前）完成上線。

#### Scenario: 端到端發佈

- **WHEN** workflow 被觸發且 Gemini 產生成功
- **THEN** 當日 JSON 被 commit 回 repo、網站完成 build 並部署，新內容於 `https://rayyyy.github.io/claude-loop-test/` 可見

### Requirement: 歷史資料累積

系統 SHALL 將每日產生的 `data/YYYY-MM-DD.json` commit 回 repo 的預設分支，使歷史日報逐日累積並在後續每次 build 時一併重新預渲染。commit MUST 由 CI 以可識別的自動化身分進行，且不覆寫其他日期的既有資料。

#### Scenario: 新日期累積不影響舊資料

- **WHEN** 某日 workflow 產生新的 `data/YYYY-MM-DD.json` 並 commit
- **THEN** repo 中既有日期的 JSON 維持不變，新日期檔案被加入，後續 build 預渲染包含所有日期

#### Scenario: 自動 commit 身分

- **WHEN** CI commit 當日資料
- **THEN** 該 commit 使用自動化 bot 身分，並可在 git log 中辨識為排程產生

### Requirement: 密鑰安全管理

系統 SHALL 透過 GitHub repo Secrets 提供 `GEMINI_API_KEY` 給 workflow，並以環境變數注入產生步驟。API key MUST NOT 被寫入 repo 檔案、commit 內容、build 產物或 workflow log。

#### Scenario: 由 Secrets 注入

- **WHEN** workflow 執行產生步驟
- **THEN** `GEMINI_API_KEY` 由 GitHub Secrets 以環境變數提供，且不出現在任何 log 輸出或被 commit 的檔案中

### Requirement: 產生失敗時不破壞既有站點

當 Gemini 產生步驟整體失敗（四版面皆無法取得內容）時，系統 SHALL 中止部署，使線上既有的最新一期日報維持不變，而非以空白或錯誤內容覆蓋。

#### Scenario: 產生全失敗不部署

- **WHEN** 某次 workflow 的 Gemini 產生步驟整體失敗
- **THEN** 不進行 commit 與部署，線上站點維持前一次成功的內容，workflow 標記為失敗以利通知
