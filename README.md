# S3 + CloudFront 署名URL + Next.js(Amplify) + 前段 CloudFront 超初心者向け 完全手順書

この手順書は、**AWS コンソールでどこを押すかまでできるだけ具体的に書いた版**です。  
「まず何を作るのか」「その設定はなぜ必要か」「どこで詰まりやすいか」が分かるようにしてあります。

対象構成は次のとおりです。

- 顔写真ファイルは **S3 に非公開保存**
- 画像配信は **CloudFront + 署名URL**
- Next.js は **Amplify Hosting** にデプロイ
- ユーザー入口は **前段 CloudFront**

---

## 0. 最初に完成形をイメージする

最終的に、アクセスの流れはこうなります。

1. ユーザーが `https://app-xxxx.cloudfront.net` または独自ドメインにアクセス
2. 前段 CloudFront が Amplify 上の Next.js を返す
3. Next.js サーバー側で、画像用 CloudFront の**署名URL**を生成する
4. ブラウザがその署名URLを使って画像用 CloudFront にアクセスする
5. 画像用 CloudFront が OAC 経由で S3 から `users/demo/face.png` を取得する
6. 署名が不正・期限切れなら 403 になる

つまり、**S3 は最後まで直接公開しない**のがポイントです。

---

## 1. この手順で固定する前提値

あなたの元の手順書に合わせて、以下を固定で進めます。

### 1-1. S3 の画像キー

```txt
users/demo/face.png
```

S3 に置くファイルは、**このキーで完全一致**させてください。

NG 例:

- `users/demo/face.jpg`
- `user/demo/face.png`
- `users/demo/profile.png`

### 1-2. アプリで使う環境変数

```txt
CLOUDFRONT_MEDIA_DOMAIN
CLOUDFRONT_KEY_PAIR_ID
CLOUDFRONT_PRIVATE_KEY
CLOUDFRONT_URL_TTL_SECONDS
```

おすすめ初期値:

```txt
CLOUDFRONT_URL_TTL_SECONDS=600
```

最初は 10 分にしておくと確認しやすいです。

---

## 2. 先に決めておく名前

AWS は名前が増えると混乱しやすいので、先にメモしてから始めます。

例:

```txt
S3 bucket: myapp-private-media-prod
CloudFront(画像配信): media-myapp-prod
CloudFront(前段): app-myapp-prod
Public key name: media-url-signer-pub-20260423
Key group name: media-url-signer-group
```

独自ドメインを使うならこれも決めておきます。

```txt
アプリ用: app.example.com
画像用: media.example.com
```

最初のおすすめは、**独自ドメインなしで AWS 提供ドメインだけで動作確認する**ことです。

---

## 3. 作業の全体順序

この順番でやれば迷いにくいです。

1. ローカルで署名用の秘密鍵・公開鍵を作る
2. S3 バケットを作る
3. 画像を `users/demo/face.png` でアップロードする
4. 画像配信用 CloudFront を作る
5. OAC 用の S3 バケットポリシーを入れる
6. Public key / Key group を作って CloudFront に紐づける
7. Amplify に Next.js をデプロイする
8. Amplify に環境変数を設定する
9. 必要なら `amplify.yml` を設定する
10. 前段 CloudFront を作る
11. 動作確認する
12. 必要なら独自ドメインを割り当てる

---

# Part A. 署名URL用の鍵を作る

## 4. ローカルで秘密鍵・公開鍵を作る

### 4-1. ターミナルで実行

```bash
openssl genrsa -out private_key.pem 2048
openssl rsa -pubout -in private_key.pem -out public_key.pem
```

作られるファイル:

- `private_key.pem` → Amplify に設定する
- `public_key.pem` → CloudFront に登録する

### 4-2. できたか確認

`private_key.pem` を開いて、先頭がだいたいこんな感じなら OK です。

```txt
-----BEGIN PRIVATE KEY-----
```

または

```txt
-----BEGIN RSA PRIVATE KEY-----
```

`public_key.pem` はこんな感じです。

```txt
-----BEGIN PUBLIC KEY-----
...
-----END PUBLIC KEY-----
```

### 4-3. 注意

- この秘密鍵は **Git にコミットしない**
- チャット、issue、Notion に貼らない
- 漏れたら作り直しが必要

---

# Part B. S3 を作る

## 5. S3 バケットを作成する

### 5-1. コンソールでの操作場所

1. AWS コンソールを開く
2. 上の検索欄で `S3` と検索
3. **Amazon S3** を開く
4. **Create bucket** を押す

### 5-2. 入力する内容

- **Bucket name**: 例 `myapp-private-media-prod`
- **AWS Region**: どこでもよいが、普段使うリージョンに合わせる
- **Object Ownership**: デフォルトのままでよい
- **Block Public Access settings for this bucket**:
  - **Block all public access** を **ON のまま**

ここは超重要です。  
**公開しないバケット**なので、public access は開けません。

### 5-3. バケット作成後に画像をアップロード

1. 作成したバケットを開く
2. **Upload** を押す
3. 画像ファイルを選ぶ
4. キーが `users/demo/face.png` になるように配置する

やり方は 2 通りあります。

#### 方法A: フォルダを作って置く

- `users/`
- その中に `demo/`
- その中に `face.png`

#### 方法B: CLI で一発アップロード

```bash
aws s3 cp ./face.png s3://myapp-private-media-prod/users/demo/face.png
```

### 5-4. この段階の正常状態

この時点では、S3 の URL を直接開いても画像は見えなくて OK です。  
むしろ**見えたら危険**です。

---

# Part C. 画像配信用 CloudFront を作る

## 6. メディア用 CloudFront Distribution を作成する

### 6-1. コンソールでの操作場所

1. AWS コンソール検索で `CloudFront`
2. **Amazon CloudFront** を開く
3. 左メニュー **Distributions**
4. **Create distribution** を押す

### 6-2. Origin を設定する

**Origin domain** で、さっき作った S3 バケットを選びます。

ここでの重要ポイント:

- **S3 バケットの通常の origin を選ぶ**
- **S3 website endpoint は選ばない**

### 6-3. OAC を設定する

Origin 設定の中で、次のような項目を探します。

- **Origin access**
- **Origin access control settings (recommended)**

ここで:

1. **Origin access control settings (recommended)** を選ぶ
2. **Create new OAC** を押す
3. 名前は分かりやすく入れる
   - 例: `oac-media-myapp-prod`
4. 保存する

### 6-4. Viewer 設定

最初は次で OK です。

- **Viewer protocol policy**: `Redirect HTTP to HTTPS`
- **Allowed HTTP methods**: `GET, HEAD`
- **Compress objects automatically**: `Yes`

### 6-5. Cache behavior の考え方

この画像配信用 Distribution は基本的に静的画像だけなので、最初はデフォルトのままで大丈夫です。

### 6-6. Distribution を作成

画面下の **Create distribution** を押します。

### 6-7. 作成直後にやること

CloudFront 側で、S3 バケットポリシーの更新案内が出ることがあります。  
その場合は、**あとで必ず S3 のバケットポリシーを設定**します。

---

# Part D. OAC 用の S3 バケットポリシーを入れる

## 7. S3 バケットポリシーを設定する

### 7-1. Distribution ID を確認

1. CloudFront の **Distributions** 一覧に戻る
2. 作成した画像用 Distribution を開く
3. **Distribution ID** を控える
4. AWS アカウント ID も控える

Distribution ARN は次の形になります。

```txt
arn:aws:cloudfront::<AWSアカウントID>:distribution/<DistributionID>
```

### 7-2. S3 バケットポリシー画面を開く

1. S3 に戻る
2. 対象バケットを開く
3. **Permissions** タブ
4. **Bucket policy** の **Edit** を押す

### 7-3. 入れるポリシー

以下の `<BUCKET_NAME>`、`<AWS_ACCOUNT_ID>`、`<DISTRIBUTION_ID>` を置き換えて使います。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipalReadOnly",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::<BUCKET_NAME>/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::<AWS_ACCOUNT_ID>:distribution/<DISTRIBUTION_ID>"
        }
      }
    }
  ]
}
```

### 7-4. 保存後の意味

これで、**その CloudFront Distribution 経由の読み取りだけ許可**されます。  
S3 直アクセスは引き続き拒否されます。

---

# Part E. 署名URL必須にする

## 8. Public key を CloudFront に登録する

### 8-1. 操作場所

1. CloudFront 左メニュー **Public keys**
2. **Create public key**

### 8-2. 入力内容

- **Name**: 例 `media-url-signer-pub-20260423`
- **Key**: `public_key.pem` の中身を丸ごと貼る
- **Comment**: 任意

保存します。

### 8-3. 保存後に控えるもの

作成後、**Public key ID** を控えます。  
これが後で `CLOUDFRONT_KEY_PAIR_ID` になります。

---

## 9. Key group を作る

### 9-1. 操作場所

1. CloudFront 左メニュー **Key groups**
2. **Create key group**

### 9-2. 入力内容

- **Name**: 例 `media-url-signer-group`
- さっき作った Public key を選択して追加

保存します。

---

## 10. Distribution に署名必須を設定する

### 10-1. 操作場所

1. CloudFront **Distributions**
2. 画像配信用 Distribution を開く
3. **Behaviors** タブ
4. 対象 behavior の **Edit** を押す

### 10-2. 設定内容

以下のような設定項目を探します。

- **Restrict viewer access**
- **Trusted key groups**

設定:

- **Restrict viewer access**: `Yes`
- **Trusted key groups**: さっき作った key group を選ぶ

### 10-3. どのパスに署名必須をかけるか

おすすめは 2 パターンあります。

#### パターンA: 画像配信用 Distribution 全体にかける

- 画像しか置かないならこれで OK
- 単純で分かりやすい

#### パターンB: `/users/*` だけにかける

- 画像以外の公開ファイルを将来置くならこちら
- ただし behavior 分割が必要

最初は **Distribution 全体に署名必須**でよいです。

### 10-4. 反映待ち

CloudFront は更新後すぐではなく、**Deployed** になるまで少し待ちます。

---

# Part F. 画像用 CloudFront 単体の動作確認

## 11. まずは「署名なしでは落ちる」を確認する

画像配信用 CloudFront のドメインを控えます。  
例:

```txt
dxxxxxxxxxxxx.cloudfront.net
```

ブラウザで次を開きます。

```txt
https://dxxxxxxxxxxxx.cloudfront.net/users/demo/face.png
```

期待結果:

- **403** になる

これが正常です。  
ここで画像が見えてしまうなら、署名必須化ができていません。

---

# Part G. Amplify に Next.js をデプロイする

## 12. Amplify アプリを作る

### 12-1. 操作場所

1. AWS コンソールで `Amplify` を開く
2. **AWS Amplify** を開く
3. **New app**
4. **Host web app**

### 12-2. リポジトリ接続

1. Git provider を選ぶ
   - GitHub など
2. リポジトリを選ぶ
3. ブランチを選ぶ
4. **Next**

### 12-3. Build settings

最初は自動検出でよいですが、**SSR の環境変数**がある場合は後で `amplify.yml` を調整する可能性があります。

### 12-4. デプロイ

**Save and deploy** を押します。

### 12-5. デフォルトドメインを控える

デプロイ完了後、Amplify の URL を控えます。  
例:

```txt
main.xxxxx.amplifyapp.com
```

これは後で**前段 CloudFront のオリジン**になります。

---

# Part H. Amplify に環境変数を設定する

## 13. Amplify の環境変数を入れる

### 13-1. 操作場所

1. Amplify の対象アプリを開く
2. 左メニュー **Hosting** か **App settings** 周辺を開く
3. **Environment variables** を開く

### 13-2. 追加する値

#### `CLOUDFRONT_MEDIA_DOMAIN`

値の例:

```txt
dxxxxxxxxxxxx.cloudfront.net
```

`https://` なしで統一すると扱いやすいです。

#### `CLOUDFRONT_KEY_PAIR_ID`

CloudFront Public key の ID を入れる。

#### `CLOUDFRONT_PRIVATE_KEY`

`private_key.pem` の中身を丸ごと入れる。  
改行をそのまま入れられない場合は、改行を `\n` にした文字列で入れます。

#### `CLOUDFRONT_URL_TTL_SECONDS`

```txt
600
```

### 13-3. 保存後の注意

保存しただけでは、アプリ側がそのまま参照できない場合があります。  
Next.js の SSR では、build 時に `.env.production` へ書き出す設定が必要になることがあります。

---

## 14. 必要なら `amplify.yml` を設定する

SSR の server-side runtime で環境変数が読めない場合は、リポジトリに `amplify.yml` を置きます。

例:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
        - |
          env | grep -e CLOUDFRONT_MEDIA_DOMAIN \
                   -e CLOUDFRONT_KEY_PAIR_ID \
                   -e CLOUDFRONT_PRIVATE_KEY \
                   -e CLOUDFRONT_URL_TTL_SECONDS >> .env.production
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

### 14-1. この設定の意味

Amplify の環境変数を `.env.production` に書き出して、Next.js の build 時 / SSR 時に読めるようにするための設定です。

### 14-2. 注意

秘密鍵が build 過程で参照されるので、**リポジトリには書かず、Amplify の環境変数から流し込む**方針を守ってください。

---

# Part I. Amplify 単体で動作確認する

## 15. Amplify の URL でアプリを開く

Amplify デフォルト URL でアプリを開きます。

ここで期待する結果:

- ページ自体は表示される
- 画像も表示される

### 15-1. 画像が出ない場合のよくある原因

- `CLOUDFRONT_MEDIA_DOMAIN` が間違っている
- `CLOUDFRONT_KEY_PAIR_ID` が違う
- `CLOUDFRONT_PRIVATE_KEY` が壊れている
- `CLOUDFRONT_URL_TTL_SECONDS` が 0 以下
- `users/demo/face.png` が S3 に存在しない

この段階で画像が出るまで直してから、前段 CloudFront に進んでください。

---

# Part J. 前段 CloudFront を作る

## 16. Amplify の前に置く CloudFront を作る

### 16-1. 目的

この CloudFront は**アプリ本体の入口**です。  
画像用 CloudFront とは別物です。

### 16-2. 操作場所

1. CloudFront **Distributions**
2. **Create distribution**

### 16-3. Origin 設定

- **Origin domain**: Amplify のデフォルトドメインを入れる
  - 例 `main.xxxxx.amplifyapp.com`
- 種別は **Custom origin** として扱われます

### 16-4. 設定値

- **Protocol**: HTTPS only
- **Viewer protocol policy**: Redirect HTTP to HTTPS
- **Allowed methods**: 必要に応じて GET/HEAD/OPTIONS など

最初は静的表示・通常表示だけならデフォルト寄りで大丈夫です。

### 16-5. Host ヘッダでハマらないための方針

最初は、**Amplify のデフォルトドメインをそのままオリジンにする**のが安全です。  
オリジン証明書名との不一致で 502 を起こしにくいからです。

### 16-6. Distribution 作成

**Create distribution** を押して、CloudFront ドメインを控えます。

例:

```txt
dyyyyyyyyyyyy.cloudfront.net
```

---

# Part K. 前段 CloudFront 経由の動作確認

## 17. 前段 CloudFront の URL でアクセスする

以下を開きます。

```txt
https://dyyyyyyyyyyyy.cloudfront.net
```

期待結果:

- アプリが表示される
- 画像も表示される

### 17-1. ここで画像が出る仕組み

前段 CloudFront 自体は画像の署名には関与しません。  
アプリが HTML を返し、その中で Next.js が生成した**画像用 CloudFront の署名URL**をブラウザが叩いています。

---

# Part L. 独自ドメインを使う場合

## 18. まず知っておくべきこと

CloudFront で使う ACM 証明書は、**us-east-1（バージニア北部）** に作る必要があります。

これを間違えると、CloudFront の Alternate domain name に証明書を付けられません。

---

## 19. アプリ用ドメインを前段 CloudFront に付ける

### 19-1. ACM で証明書作成

1. AWS コンソールで `Certificate Manager` を開く
2. リージョンを **us-east-1** に切り替える
3. **Request certificate**
4. 例えば `app.example.com` を追加
5. DNS 検証で作成

### 19-2. CloudFront に紐づけ

1. 前段 CloudFront Distribution を開く
2. **Settings** または **General** から編集
3. **Alternate domain name (CNAME)** に `app.example.com`
4. **Custom SSL certificate** に作成した証明書を選ぶ
5. 保存

### 19-3. Route 53 で向ける

Route 53 を使っている場合:

1. 対象 Hosted zone を開く
2. **Create record**
3. `app` の A レコードを作成
4. **Alias** を ON
5. 前段 CloudFront Distribution を選ぶ

---

## 20. 画像用ドメインを CloudFront に付ける

必要なら、画像配信用 Distribution にも独自ドメインを付けられます。

例:

```txt
media.example.com
```

やることはアプリ用とほぼ同じです。

1. us-east-1 の ACM に `media.example.com` の証明書を作る
2. 画像配信用 CloudFront に Alternate domain name を設定
3. Route 53 で `media.example.com` をその Distribution に向ける
4. Amplify 側の `CLOUDFRONT_MEDIA_DOMAIN` を `media.example.com` に更新
5. 再デプロイする

---

# Part M. 必須の確認項目

## 21. 確認1: S3 直アクセスが拒否される

S3 オブジェクト URL を直接開く。

期待結果:

- AccessDenied

---

## 22. 確認2: 画像用 CloudFront に署名なしでアクセスすると 403

```txt
https://<画像用CloudFrontドメイン>/users/demo/face.png
```

期待結果:

- 403

---

## 23. 確認3: Amplify 経由では画像が出る

期待結果:

- ページ表示 OK
- 画像表示 OK

---

## 24. 確認4: 前段 CloudFront 経由でも画像が出る

期待結果:

- ページ表示 OK
- 画像表示 OK

---

## 25. 確認5: 期限切れ URL は 403 になる

署名URLをコピーして、期限切れ後に再度開く。

期待結果:

- 403

---

# Part N. 詰まりやすいポイント集

## 26. 症状: 画像が出ない

チェック順:

1. S3 に `users/demo/face.png` が本当にあるか
2. `CLOUDFRONT_MEDIA_DOMAIN` が正しいか
3. `CLOUDFRONT_KEY_PAIR_ID` が Public key ID と一致しているか
4. `CLOUDFRONT_PRIVATE_KEY` が壊れていないか
5. CloudFront behavior で `Restrict viewer access = Yes` になっているか
6. Key group が behavior に紐づいているか

---

## 27. 症状: 署名なしで画像が見えてしまう

原因候補:

- Restrict viewer access を有効にしていない
- 別 behavior にだけ設定していて、実際のパスに当たっていない
- そもそも画像配信用ではなく別 Distribution を見ている

---

## 28. 症状: 署名URLでも 403

原因候補:

- 間違った秘密鍵で署名している
- Key pair ID が違う
- S3 キーが一致していない
- TTL が短すぎてすぐ切れている

---

## 29. 症状: 前段 CloudFront で 502

原因候補:

- オリジンに入れた Amplify ドメインが違う
- Host / 証明書まわりの不整合
- Amplify 側がまだ正常デプロイされていない

最初は **Amplify デフォルトドメインをそのまま origin にする**のが安全です。

---

# Part O. 最後にやるべき整理

## 30. 本番前に見直すこと

- `CLOUDFRONT_URL_TTL_SECONDS` を短めにする
- 秘密鍵のローテーション手順を作る
- Public key / Key group の更新手順を決める
- 監査ログやアクセスログの扱いを決める
- PII なので、認証・認可も本番では必須にする

---

# Part P. これだけ見ればよい最短チェックリスト

## 31. 最短チェックリスト

- [ ] `private_key.pem` / `public_key.pem` を作った
- [ ] S3 バケットを作った
- [ ] `users/demo/face.png` をアップロードした
- [ ] 画像配信用 CloudFront を作った
- [ ] OAC を設定した
- [ ] S3 バケットポリシーを入れた
- [ ] Public key を作った
- [ ] Key group を作った
- [ ] behavior に署名必須を設定した
- [ ] 署名なしで 403 を確認した
- [ ] Amplify にデプロイした
- [ ] 環境変数を入れた
- [ ] 必要なら `amplify.yml` を設定した
- [ ] Amplify 単体で画像表示を確認した
- [ ] 前段 CloudFront を作った
- [ ] 前段 CloudFront 経由で画像表示を確認した

---

# Part Q. 今回の構成で覚えておくべき一言まとめ

## 32. 要点

- **S3 は非公開のまま**
- **画像は CloudFront 署名URLでだけ見せる**
- **画像用 CloudFront と、アプリ用 CloudFront は別物**
- **Amplify はアプリを載せる場所**
- **前段 CloudFront はアプリの入口**

この 5 つが頭に入っていれば、全体像で迷いにくくなります。
