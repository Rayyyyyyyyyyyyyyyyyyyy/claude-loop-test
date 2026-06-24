# digest-web Specification

## Purpose

定義日報網站的前端呈現:今日首頁、單日日報頁、以週分組的歷史歸檔索引、build 階段的靜態預渲染、紐約時報中文版風格的視覺呈現，以及在 GitHub Pages 子路徑下正確運作的 base path 設定。

## Requirements

### Requirement: 今日日報首頁

系統 SHALL 在根路由 `/` 顯示「最新一期」日報，內容依四個版面分區呈現，每個版面列出其項目（標題、摘要、來源連結）。

#### Scenario: 開啟首頁顯示最新日報

- **WHEN** 使用者開啟 `/`
- **THEN** 頁面顯示資料中日期最新一期的日報，並依四個版面分區排列項目

#### Scenario: 尚無任何日報資料

- **WHEN** `data/` 目錄中沒有任何日報檔案
- **THEN** 首頁顯示「尚無日報」的空狀態訊息，而非錯誤畫面

### Requirement: 單日日報頁

系統 SHALL 提供 `/YYYY-MM-DD` 路由，顯示對應日期的日報。每個存在於 `data/` 的日期 MUST 有一個對應的可瀏覽頁面。

#### Scenario: 瀏覽特定日期

- **WHEN** 使用者開啟對應某個已存在資料之日期的 `/YYYY-MM-DD`
- **THEN** 頁面顯示該日的四版面日報內容

#### Scenario: 不存在的日期

- **WHEN** 使用者開啟一個沒有對應資料的 `/YYYY-MM-DD`
- **THEN** 顯示「找不到該日日報」的提示，並提供回到首頁或歸檔頁的連結

### Requirement: 歷史歸檔索引（以週分組）

系統 SHALL 提供 `/archive` 路由，列出所有已產生的日報日期，並以「週」為單位分組。週與週之間 SHALL 依新到舊排序，同一週內的日期亦依新到舊排序。每個日期皆可點擊連往其單日日報頁，且每個週分組 MUST 顯示該週的區間標示（例如該週的起訖日期）。

#### Scenario: 以週分組列出

- **WHEN** 使用者開啟 `/archive`
- **THEN** 頁面將所有已存在資料的日期依所屬週分組，週分組由新到舊排列、組內日期亦由新到舊，每個分組顯示該週區間標示

#### Scenario: 日期連結正確

- **WHEN** 使用者在歸檔頁點擊某個日期
- **THEN** 導向對應的 `/YYYY-MM-DD` 單日日報頁

#### Scenario: 跨年的週歸屬

- **WHEN** 資料中存在跨年週（同一週橫跨兩個年度）的日期
- **THEN** 這些日期被歸入同一個週分組，不因年度切換而被拆成兩組

### Requirement: 靜態預渲染

系統 SHALL 以 vite-ssg 在 build 階段為首頁、`/archive` 以及每一個已存在資料的日期頁產生對應的靜態 HTML，使內容在不執行 JavaScript 的情況下即可閱讀。日報內容 MUST 於 build 時嵌入頁面，而非僅由瀏覽器於 runtime 動態抓取 JSON。

#### Scenario: 每個日期頁皆預渲染

- **WHEN** 執行 production build
- **THEN** 為首頁、`/archive` 及每個已存在資料的 `YYYY-MM-DD` 產生對應的靜態 HTML 檔，且該 HTML 直接內含日報文字內容

### Requirement: NYT 中文版風格呈現

系統 SHALL 以參考紐約時報中文版的視覺風格呈現日報:標題使用襯線（serif）字體、版面採大量留白與低彩度配色、各版面有清楚的分區標題。版面 SHALL 在行動裝置與桌面寬度下皆可正常閱讀（responsive）。

#### Scenario: 行動與桌面皆可讀

- **WHEN** 使用者分別以行動裝置寬度與桌面寬度開啟任一日報頁
- **THEN** 內容皆完整可讀、不破版，標題呈現為襯線字體且版面分區清楚

### Requirement: 正確的 base path

系統 SHALL 以 `base: '/claude-loop-test/'` 設定建置，使所有資源連結、頁面路由與內部連結在 `https://rayyyy.github.io/claude-loop-test/` 下皆能正確解析。

#### Scenario: Pages 子路徑下連結正確

- **WHEN** 網站部署於 `https://rayyyy.github.io/claude-loop-test/` 且使用者於各頁間點擊內部連結
- **THEN** 所有頁面與靜態資源（JS/CSS/字體/圖片）皆正確載入，無因 base path 造成的 404
