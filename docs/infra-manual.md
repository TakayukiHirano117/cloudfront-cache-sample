# 手動構築手順書: メディア用 S3 + CloudFront（署名 URL）、Next.js on Amplify、前段 CloudFront

このドキュメントはサンプルアプリを本番に近い形で動かすための **コンソール中心の手順** です。一次ソースとして AWS 公式ドキュメントへのリンクを併記します。

## なぜ S3 + CloudFront が「セキュアになり得る」か

AWS はプライベート配信を次のように整理しています（[Serve private content with signed URLs and signed cookies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/PrivateContent.html)）。

1. **CloudFront エッジでの制御**  
   信頼できるキーグループに紐づく配信では、**署名付き URL または署名付き Cookie** を要求できます。署名の検証に通らないリクエストはオブジェクトを返しません。

2. **S3 直リンクの遮断（推奨）**  
   **OAC（Origin Access Control）** で「CloudFront からの読み取りのみ」を許可し、S3 の URL によるバイパスを防ぎます（[Restrict access to an Amazon S3 origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)）。

**注意:** キャッシュは主にパフォーマンス向けです。**有効な署名付き URL が漏洩した場合、その期限内は取得され得ます**。期限・IP 条件・短めの TTL でリスクを下げます。顔写真など PII では、ログ・Referer・ブラウザ履歴への残り方も設計対象に含めてください。

## アプリが期待する環境変数（Amplify / ローカル）

| 変数名 | 説明 |
|--------|------|
| `CLOUDFRONT_MEDIA_DOMAIN` | メディア用ディストリビューションのドメイン（例: `d111111abcdef8.cloudfront.net`）。`https://` 付きでも可。 |
| `CLOUDFRONT_KEY_PAIR_ID` | CloudFront のキーペア ID（コンソールの公開鍵 ID）。 |
| `CLOUDFRONT_PRIVATE_KEY` | 上記キーペアに対応する **PEM 形式の秘密鍵全文**。改行はそのまま、または `\n` にエスケープして 1 行で格納（アプリ側で `\n` を実改行に戻します）。 |
| `CLOUDFRONT_URL_TTL_SECONDS` | 任意。署名の有効期限（秒）。未設定時は `3600`。 |

秘密鍵は **リポジトリに含めない** こと。Amplify のシークレット環境変数に保存してください。

## A. メディア（顔写真）: S3 + CloudFront + OAC + 署名 URL

### A-1. S3 バケット

1. S3 でバケットを作成する。パブリックアクセスはブロックしたままにする（[Blocking public access to your S3 storage](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)）。
2. テスト用の顔写真をアップロードする。オブジェクトキーはアプリのモックと一致させる（既定: `users/demo/face.jpg` は [src/data/mockUser.ts](../src/data/mockUser.ts) で定義）。

### A-2. CloudFront ディストリビューション（メディア用）

1. CloudFront で新規ディストリビューションを作成し、オリジンに上記バケットを指定する。
2. **Origin access** で OAC を作成し、その OAC をオリジンに関連付ける（[Restrict access to an Amazon S3 origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)）。
3. コンソールのガイドに従い、**バケットポリシー** を更新し、当該ディストリビューションからの `s3:GetObject` のみを許可する。

### A-3. 信頼できるキーと署名付き URL 必須化

1. RSA 2048 または ECDSA 256 の鍵ペアを用意する（[Create key pairs for your signers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/PrivateContent.html#private-content-creating-cloudfront-key-pairs)）。
2. **公開鍵** を CloudFront の **キーグループ** に登録し、メディア用ディストリビューションの対象 **キャッシュビヘイビア** にそのキーグループを関連付ける（[Specify signers that can create signed URLs and signed cookies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-trusted-signers.html)）。
3. そのビヘイビアで **Restrict viewer access (Use signed URLs or signed cookies)** を有効にする。
4. **キャッシュ TTL** はサンプル用途なら数分〜数十分程度にし、署名の意図と齟齬が出ないようにする（TTL と署名期限の関係は [Managing how long content stays in the cache (expiration)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html) などで設計）。

### A-4. 署名の実装（本リポジトリ）

アプリは `@aws-sdk/cloudfront-signer` の `getSignedUrl` を使用します（[npm の README](https://www.npmjs.com/package/@aws-sdk/cloudfront-signer) および AWS の [Code examples for creating a signature](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/PrivateCFSignatureCodeAndExamples.html)）。

## B. Next.js on AWS Amplify Hosting

1. [Amplify Hosting](https://docs.aws.amazon.com/amplify/latest/userguide/welcome.html) でアプリをホストし、このリポジトリを接続する。
2. ビルド仕様はリポジトリの `pnpm-lock.yaml` に合わせ、インストールと `pnpm run build` が通るようにする（Amplify のビルドイメージと `pnpm` の有効化はコンソール／`amplify.yml` で調整）。
3. 上記の環境変数を Amplify の **環境変数** に設定する。`CLOUDFRONT_PRIVATE_KEY` はシークレット扱いとする。
4. デプロイ完了後、Amplify が表示する **デフォルトドメイン**（例: `main.xxxxx.amplifyapp.com`）をメモする。次節のオリジンに使用する。

## C. アプリ前段の CloudFront（Amplify の手前）

Amplify 自体も CDN 背後ですが、本サンプルでは **別の CloudFront** をユーザー向けの入口に置く構成とします。

1. CloudFront で **新規ディストリビューション** を作成する。
2. **オリジン** に Amplify のデフォルトドメインを **カスタムオリジン** として追加する。プロトコルは **HTTPS only** を推奨（[Viewer protocol policy](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.md#DownloadDistValuesViewerProtocolPolicy)）。
3. **Origin の設定** で、オリジンに送る **Host ヘッダー** を Amplify のホスト名に合わせる（カスタムオリジンではオリジンドメインとの整合が重要。[Origin settings](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html)）。
4. デフォルトルートオブジェクトは、SSR の `/` をオリジンに委譲する前提では不要なことが多い。動かない場合はビヘイビアとオリジンのパスを確認する。
5. 独自ドメインを使う場合、**ACM**（リージョンに注意: CloudFront に紐づける証明書は **us-east-1** の場合がある）で証明書を発行し、ディストリビューションの **Alternate domain name (CNAME)** に設定する（[Using custom URLs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/CNAMEs.html)）。
6. Route 53 などで、ユーザー向けドメインの **エイリアス A/AAAA** をこのディストリビューションに向ける。
7. （任意）[AWS WAF](https://docs.aws.amazon.com/waf/latest/developerguide/cloudfront-features.html) を関連付け、レート制限やマネージドルールを検討する。

## D. 動作確認チェックリスト

1. メディアの CloudFront URL に **署名なし** でアクセスし、**403** 等で拒否されること。
2. アプリ画面で顔写真が表示されること（サーバーが生成した **署名付き URL** 経由）。
3. 署名の有効期限切れ後、同じ URL で **取得できない** こと。
4. S3 のオブジェクト URL を直接叩き、**アクセス拒否** であること（OAC とバケットポリシーが正しい場合）。

## 本サンプルの限界（アプリ設計）

- 認証（Cognito 等）は含みません。ページに到達したクライアントは誰でも署名 URL を得られるため、**本番の PII 配信では認可レイヤ** が別途必要です。
- 顔写真の取り扱いでは、組織のプライバシー・ログ保持ポリシーに従ってください。
