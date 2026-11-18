# AI質問機能 試験結果

## 1. 記録規則

結果区分は「自動テスト」「モック」「実DB」「実Gemini」「手動」のどれで確認したかを明記する。未実施項目は合格としない。実APIへの大量アクセスは行わない。

## 2. 変更前ベースライン（2026-11-18）

| 項目                | 結果                      |
| ------------------- | ------------------------- |
| `pnpm lint`         | 成功                      |
| `pnpm typecheck`    | 成功                      |
| `pnpm format:check` | 成功                      |
| `pnpm test`         | 成功、40 tests / 5 suites |
| `pnpm build`        | 成功                      |

`.env`は読み取っていない。実DB、実Gemini、Preview、Productionへの通信は実施していない。

## 3. AI機能テスト一覧

| ID  | テスト         | 方法               | 状態   | 記録                                                                          |
| --- | -------------- | ------------------ | ------ | ----------------------------------------------------------------------------- |
| T01 | 正常質問       | fake Service/Model | 合格   | 201とDB返却相当DTO、Service→save順を確認                                      |
| T02 | 再読込         | E2E/モック         | 合格   | TASK-05でPlaywright page reload後に履歴API mockを再取得。実DB永続化は未確認   |
| T03 | 履歴0件        | Supertest/モック   | 合格   | 200、`success: true`、空配列を確認                                            |
| T04 | 空白入力       | fake Service/Model | 合格   | Service/Model未呼出しを確認                                                   |
| T05 | 2,001文字      | fake Service/Model | 合格   | 2,000絵文字を受理、2,001コードポイントを400で拒否                             |
| T06 | 不正JSON       | Supertest          | 合格   | 400 `INVALID_JSON`                                                            |
| T07 | 16KiB超過      | Supertest          | 合格   | 413 `PAYLOAD_TOO_LARGE`                                                       |
| T08 | 非JSON         | Supertest          | 合格   | 415 `UNSUPPORTED_MEDIA_TYPE`                                                  |
| T09 | DB保存失敗     | fake Model         | 合格   | 503 `DB_UNAVAILABLE`、成功itemなし                                            |
| T10 | AI失敗         | fake Service       | 合格   | 502、DB保存なし                                                               |
| T11 | AI空回答       | fake Service       | 合格   | 502、DB保存なし                                                               |
| T12 | オフライン     | E2E/モック         | 未実施 | TASK-06                                                                       |
| T13 | 連打           | E2E                | 未実施 | TASK-06                                                                       |
| T14 | HTML風文字列   | Playwright mock    | 合格   | TASK-05で質問・回答を文字列描画し、img/svg生成およびイベント実行なしを確認    |
| T15 | デモ停止       | Supertest          | 合格   | 未設定/falseとProductionを503、Production以外のtrueを後続へ通すことを自動確認 |
| T16 | 秘密管理       | 静的確認           | 未実施 | TASK-07                                                                       |
| T17 | 履歴21件以上   | Modelモック        | 合格   | 21行を与えて公開結果が20件であることを確認                                    |
| T18 | 同日時の履歴   | SQL静的確認        | 合格   | 固定SQLの`created_at DESC, id DESC`を確認                                     |
| T19 | Geminiへの入力 | モック             | 未実施 | TASK-04                                                                       |
| T20 | TODO回帰       | 既存自動テスト     | 合格   | 既存40 testsが変更後も成功                                                    |

## 4. TASK-01変更後（2026-11-18）

| 項目                | 結果                                       |
| ------------------- | ------------------------------------------ |
| `pnpm lint`         | 成功                                       |
| `pnpm typecheck`    | 成功                                       |
| `pnpm format:check` | 成功                                       |
| `pnpm test`         | 成功、43 tests / 6 suites（新規3、既存40） |
| `pnpm build`        | 成功                                       |

T15はSupertestによる自動テストであり、実Vercel環境の確認ではない。T20はモックを使用する既存サーバーテストによる回帰確認であり、実NeonやブラウザE2Eは含まない。

## 5. 未実施の実環境試験

- 実NeonへのDDL適用、INSERT、SELECT
- 実GeminiへのgenerateContent
- Vercel Previewアクセス保護とAI有効化
- Vercel Productionでの強制停止
- Vercel Function上限と30秒timeoutの整合

## 6. TASK-02変更後（2026-11-18）

| 項目                | 結果                      |
| ------------------- | ------------------------- |
| `pnpm lint`         | 成功                      |
| `pnpm typecheck`    | 成功                      |
| `pnpm format:check` | 成功                      |
| `pnpm test`         | 成功、50 tests / 7 suites |
| `pnpm build`        | 成功                      |

TASK-02で追加した7件はすべてfake Modelまたは行readerを使用する。履歴ありのDTO、最大20件、DB障害503、想定外500、デモ停止、Production停止を確認した。既存/TASK-01の43件も成功した。

初回の全テストでは、TASK-01の有効時テストが履歴Controller追加後の既定Modelへ到達し、環境内DB設定を介して接続を試みたため1件失敗した。秘密値は読み取っていない。テストへfake Modelを明示注入して実DB経路を除去し、再実行で50件すべて成功した。

不正JSON、16KiB超過、非JSON（T06〜T08）はGET履歴APIに本文がなく、今回の指示で質問保存APIが禁止されているため未実施のままとする。TASK-03でAI専用parserとともに実装・検証する。

## 7. TASK-03変更後（2026-11-18）

| 項目                | 結果                      |
| ------------------- | ------------------------- |
| `pnpm lint`         | 成功                      |
| `pnpm typecheck`    | 成功                      |
| `pnpm format:check` | 成功                      |
| `pnpm test`         | 成功、62 tests / 8 suites |
| `pnpm build`        | 成功                      |

POSTの正常保存順、trim、コードポイント境界、JSON構文、16KiB超過、非JSON、Service失敗/空回答、DB失敗、公開制御をfake Service/Modelによる自動テストで確認した。GET履歴とTODO V1/V2の既存テストも成功した。

これらは模擬Serviceとfake DB依存を使った自動テストであり、実NeonへのINSERT/SELECT成功を示さない。SQL、実DB、実Gemini、Preview/Productionでの実環境検証は未実施。

SQLレビュー指摘: 既存同名制約の式およびindexのキー列・順序・方向まで完全一致を確認できない。DDLの修正とレビュー承認後までNeonへ適用しない。

## 8. TASK-04変更後（2026-11-18）

| 項目                | 結果                      |
| ------------------- | ------------------------- |
| `pnpm lint`         | 成功                      |
| `pnpm typecheck`    | 成功                      |
| `pnpm format:check` | 成功                      |
| `pnpm test`         | 成功、68 tests / 9 suites |
| `pnpm build`        | 成功                      |

Gemini SDK境界はfake clientで検証し、実Gemini HTTP通信は実施していない。モデル・prompt単独・1024 token・30秒HTTP timeout・attempts 1・自動継続/AFC無効・空/欠落回答・設定不足・一般化した通信失敗を確認した。ProductionではService呼出しが0回である。

実Neon INSERT/SELECT、API keyを設定した手動実機試験、Preview/Production実環境動作は未実施。Vercel Function上限・runtime Nodeバージョンも未確認。

## 9. TASK-05履歴UI（2026-11-18）

| 項目                | 結果                       |
| ------------------- | -------------------------- |
| `pnpm lint`         | 成功                       |
| `pnpm typecheck`    | 成功                       |
| `pnpm format:check` | 成功                       |
| `pnpm test`         | 成功、68 tests / 9 suites  |
| `pnpm build`        | 成功                       |
| AI履歴UI E2E        | 成功、15/15 Chromium cases |
| `git diff --check`  | 成功                       |

Playwright履歴レスポンスはすべて`page.route()`でモックし、実Neonへ接続していない。UI reloadはモックAPIの再取得を示すだけで、実DB永続化を確認したものではない。DDLの制約/index定義照合は未解決である。TASK-04の設定不足時503と実行失敗時502の`AI_UNAVAILABLE` status不一致はPR #6で502に統一済み。

指定コマンド`pnpm exec playwright test tests/e2e/ai-history.spec.ts`は既存のroot所有`test-results/.last-run.json`に対するpermission deniedで、browser起動前に停止した。既存結果ファイルを変更・削除せず、Chromiumをユーザーcacheへ導入し、`pnpm exec playwright test tests/e2e/ai-history.spec.ts --output=/tmp/vercel-study-ai-task05-results`で同じ15ケースを実行して全件成功した。初回実行時に検出したテスト期待値の曖昧さ2件を修正して再実行した結果である。

TODO回帰は`pnpm test`内の既存サーバーテストにより確認した。実DBを使う既存TODO E2Eは今回実行していない。

## 10. TASK-06質問送信UI（2026-11-18）

| 項目                | 結果                                                         |
| ------------------- | ------------------------------------------------------------ |
| `pnpm lint`         | 成功                                                         |
| `pnpm typecheck`    | 成功                                                         |
| `pnpm format:check` | 成功                                                         |
| `pnpm test`         | 成功、68 tests / 9 suites                                    |
| `pnpm build`        | 成功                                                         |
| `git diff --check`  | 成功                                                         |
| AI履歴・質問UI E2E  | 成功、32/32 Chromium cases（UI01〜UI31、date edge case含む） |

E2EではPOST/GETを`page.route()`でmockし、実Gemini・Neonへ通信していない。45秒timeoutはPlaywright clockで進め、実時間待機を行わず、二重送信なし・入力保持・保存結果不明表示を確認した。POST成功後の履歴GET失敗では回答表示と送信成功を維持し、履歴更新失敗を別表示する。

E2E出力は既存のroot所有`test-results/`を変更せず、`--output=/tmp/vercel-study-ai-task06-results`へ保存した。TASK-05と同様、Playwrightの既定出力先はpermission deniedとなる環境上の制約がある。

実Neonへの保存/履歴再取得、実Geminiの回答、Preview/Production、実回線断時のserver-side処理継続は未実施。`ai_qa_logs`の制約/index定義照合の未解決指摘は継続する。`AI_UNAVAILABLE` statusはPR #6で502へ統一済み。
