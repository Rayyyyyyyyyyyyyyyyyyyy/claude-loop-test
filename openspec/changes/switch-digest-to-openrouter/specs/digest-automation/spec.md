## MODIFIED Requirements

### Requirement: 完整發佈流程

workflow SHALL 依序執行:呼叫 OpenRouter 產生當日資料 → 將 `data/YYYY-MM-DD.json` commit 回 repo → 以 vite-ssg build → 部署至 GitHub Pages。整體流程 SHALL 設計為能在排程觸發後約 30 分鐘內（即台北 07:30 前）完成上線。

#### Scenario: 端到端發佈

- **WHEN** workflow 被觸發且 OpenRouter 產生成功
- **THEN** 當日 JSON 被 commit 回 repo、網站完成 build 並部署，新內容於 `https://rayyyy.github.io/claude-loop-test/` 可見

### Requirement: 密鑰安全管理

系統 SHALL 透過 GitHub repo Secrets 提供 `OPENROUTER_API_KEY` 給 workflow，並以環境變數注入產生步驟。API key MUST NOT 被寫入 repo 檔案、commit 內容、build 產物或 workflow log。

#### Scenario: 由 Secrets 注入

- **WHEN** workflow 執行產生步驟
- **THEN** `OPENROUTER_API_KEY` 由 GitHub Secrets 以環境變數提供，且不出現在任何 log 輸出或被 commit 的檔案中

### Requirement: 產生失敗時不破壞既有站點

當產生步驟整體失敗（四版面皆無法取得內容）時，系統 SHALL 中止部署，使線上既有的最新一期日報維持不變，而非以空白或錯誤內容覆蓋。

#### Scenario: 產生全失敗不部署

- **WHEN** 某次 workflow 的 OpenRouter 產生步驟整體失敗
- **THEN** 不進行 commit 與部署，線上站點維持前一次成功的內容，workflow 標記為失敗以利通知
