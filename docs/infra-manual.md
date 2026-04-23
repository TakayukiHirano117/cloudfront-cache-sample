# 手動構築完全手順: S3 + CloudFront 署名 URL + Next.js(Amplify) + 前段 CloudFront

この手順書だけで、サンプルの構築・確認・切り分けまで完了できるように作っている。  
対象はこのリポジトリの実装（`src/lib/signFacePhotoUrl.ts`, `src/lib/cloudFrontMediaConfig.ts`, `src/data/mockUser.ts`）に一致。

---

## 0. 目的と最終形

### 目的

- 顔写真（PII）を **S3 に非公開保存**
- 配信は **CloudFront キャッシュ** を使って高速化
- 閲覧は **CloudFront 署名 URL** で制限
- アプリ（Next.js）は **Amplify Hosting**
- ユーザー入口は **前段 CloudFront**（Amplify の前）

### 最終形（データフロー）

1. ブラウザが前段 CloudFront 経由で Next.js を表示
2. Next.js サーバーが CloudFront 署名 URL を発行
3. ブラウザが署名 URL でメディア用 CloudFront にアクセス
4. メディア用 CloudFront が OAC 経由で S3 から取得
5. 署名不正・期限切れ・非許可なら CloudFront が拒否

---

## 1. 一次ソース（必読）

以下はすべて AWS 公式ドキュメント。

- CloudFront Private Content（署名 URL / Cookie の全体像）  
  [https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/PrivateContent.html](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/PrivateContent.html)
- S3 オリジンを OAC で制限  
  [https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- Trusted signers / Key groups  
  [https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-trusted-signers.html](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-trusted-signers.html)
- キャッシュ TTL  
  [https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html)
- CloudFront カスタムオリジン設定  
  [https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html)
- CloudFront CNAME / カスタムドメイン  
  [https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/CNAMEs.html](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/CNAMEs.html)
- S3 パブリックアクセスブロック  
  [https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)
- Amplify Hosting  
  [https://docs.aws.amazon.com/amplify/latest/userguide/welcome.html](https://docs.aws.amazon.com/amplify/latest/userguide/welcome.html)

---

## 2. このリポジトリが前提にしている値

### オブジェクトキー

- 顔写真キーは `src/data/mockUser.ts` の `photoObjectKey` を使う。
- 現在値は `users/demo/face.png`。  
  S3 に置くキーをこれと一致させること（拡張子も含めて完全一致）。

### 環境変数（実装上必須）

`src/lib/cloudFrontMediaConfig.ts` の仕様どおり。

| 変数 | 必須 | 説明 |
|---|---|---|
| `CLOUDFRONT_MEDIA_DOMAIN` | 必須 | メディア用 CloudFront ドメイン。`dxxxx.cloudfront.net` か `https://dxxxx.cloudfront.net` |
| `CLOUDFRONT_KEY_PAIR_ID` | 必須 | 署名に使う CloudFront 公開鍵 ID |
| `CLOUDFRONT_PRIVATE_KEY` | 必須 | PEM 秘密鍵全文（改行そのまま or `\n` エスケープ） |
| `CLOUDFRONT_URL_TTL_SECONDS` | 任意 | 署名有効期限（秒）。未設定時 `3600` |

補足:
- 実装は `\n` エスケープを実改行に戻す。
- `CLOUDFRONT_URL_TTL_SECONDS` は `<= 0` だと無効扱い（URL 生成しない）。

---

## 3. 構築前チェックリスト

- AWS アカウントに CloudFront / S3 / Amplify / ACM / Route53 操作権限がある
- 顔写真データの取り扱いルール（社内規定）が確認済み
- 秘密鍵をコード管理に入れない運用が決まっている
- 今回使うドメイン（任意）を決めている

---

## 4. 手順A: メディア用 S3 + CloudFront + OAC + 署名必須

## A-1. S3 バケット作成

1. S3 コンソールで新規バケット作成
2. 「Block all public access」を有効のままにする
3. バケットに `users/demo/face.png` をアップロード

## A-2. メディア用 CloudFront Distribution 作成

1. CloudFront で `Create distribution`
2. Origin domain に上記 S3 バケットを指定
3. Origin access は **Origin access control settings (recommended)** を選択
4. OAC を新規作成して関連付け
5. 保存後、CloudFront コンソールの案内どおり S3 バケットポリシーを更新

ポイント:
- OAC が効いていれば S3 直アクセスを遮断しやすい（一次ソース: OAC ドキュメント）

## A-3. 署名 URL 必須化（キーグループ）

1. CloudFront の `Public keys` で公開鍵を登録
2. `Key groups` でキーグループ作成し公開鍵を紐づけ
3. メディア用 Distribution の対象 Behavior を編集
4. `Restrict viewer access` を有効化
5. `Trusted key groups` に作成したキーグループを選択

署名の設計指針:
- URL 有効期限は短めにする（例: 5分〜60分）
- 必要ならカスタムポリシーで IP 制限を追加（CloudFront 仕様範囲）

---

## 5. 手順B: Next.js を Amplify Hosting に配置

1. Amplify Hosting で Git リポジトリ接続
2. このリポジトリを対象ブランチでデプロイ設定
3. Environment variables に以下を登録
   - `CLOUDFRONT_MEDIA_DOMAIN`
   - `CLOUDFRONT_KEY_PAIR_ID`
   - `CLOUDFRONT_PRIVATE_KEY`（シークレット）
   - `CLOUDFRONT_URL_TTL_SECONDS`（任意）
4. 初回デプロイ完了後、Amplify のデフォルトドメインを控える  
   例: `main.xxxxx.amplifyapp.com`

注意:
- 秘密鍵は漏えい時ローテーション対象。公開鍵差し替え手順を運用に含めること

---

## 6. 手順C: 前段 CloudFront（Amplify の手前）

1. CloudFront で新規 Distribution 作成
2. Origin に Amplify デフォルトドメインを **Custom origin** として設定
3. Origin protocol policy は HTTPS only
4. Viewer protocol policy も Redirect HTTP to HTTPS か HTTPS only を選択
5. デフォルト behavior は全パス `/*` を Amplify へ

独自ドメインを使う場合:

1. ACM で証明書を作成（CloudFront で使う証明書リージョン要件に従う）
2. Distribution の Alternate domain name にドメインを設定
3. 証明書を関連付け
4. Route53 で Alias A/AAAA を前段 CloudFront に向ける

---

## 7. 動作確認（必須）

## 確認1: 署名なしアクセス拒否

- `https://<media_cf_domain>/users/demo/face.png` に直接アクセス
- 期待: 403（または拒否応答）

## 確認2: アプリ経由の表示成功

- 前段 CloudFront または Amplify ドメインでアプリを開く
- ユーザーカードに顔写真が表示される

## 確認3: 期限切れ拒否

- 生成された署名 URL を期限後に再アクセス
- 期待: 403

## 確認4: S3 直アクセス拒否

- S3 オブジェクト URL へ直接アクセス
- 期待: AccessDenied

---

## 8. 典型トラブルと対処

## 症状A: 画像が出ない（プレースホルダ表示）

原因候補:
- 必須環境変数不足
- 秘密鍵フォーマット不正
- TTL が不正値

対処:
- `CLOUDFRONT_MEDIA_DOMAIN` / `CLOUDFRONT_KEY_PAIR_ID` / `CLOUDFRONT_PRIVATE_KEY` を確認
- `CLOUDFRONT_PRIVATE_KEY` が `BEGIN ... PRIVATE KEY` を含むか確認
- 改行はそのままか `\n` エスケープかを確認

## 症状B: 署名 URL でも 403

原因候補:
- Key group 未関連付け
- 間違った Key pair ID / 秘密鍵
- Behavior の対象パスがずれている
- 署名 URL のオブジェクトキー不一致（`.png` / `.jpg` など）

対処:
- Behavior の `Restrict viewer access` と trusted key group を再確認
- `photoObjectKey` と S3 キーが一致しているか確認

## 症状C: S3 直アクセスできてしまう

原因候補:
- バケットポリシーが広すぎる
- OAC の関連付け漏れ

対処:
- OAC の紐付けと S3 ポリシーを再作成
- 「CloudFront Distribution からの `s3:GetObject` のみ許可」に戻す

---

## 9. セキュリティ上の注意（PII前提）

- 署名 URL は有効期限内に再利用され得る。短 TTL を基本にする
- 必要に応じて signed cookies + 認証導線を検討する
- 本サンプルは認証実装を含まないため、本番では認可必須
- ログ、Referer、監査証跡に URL が残る前提で運用設計する

---

## 10. このリポジトリとの対応表

- 署名 URL 生成: `src/lib/signFacePhotoUrl.ts`
- 環境変数バリデーション: `src/lib/cloudFrontMediaConfig.ts`
- モックユーザー/オブジェクトキー: `src/data/mockUser.ts`
- 画面描画: `src/app/page.tsx`, `src/components/UserProfileCard.tsx`

この対応表に沿って、インフラ設定値を変えたら環境変数と `photoObjectKey` の一致を必ず確認すること。
