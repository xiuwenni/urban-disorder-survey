# 云端部署说明

这个版本已经支持云端部署。核心要求是：云服务器需要有一个持久化数据目录，否则问卷提交后的 CSV/JSONL 会在重启或重新部署后丢失。

## 推荐方案：Render Web Service + Persistent Disk

1. 把 `问卷/sv_survey_app` 推送到一个 GitHub 仓库。
2. 在 Render 新建 Web Service，选择该仓库。
3. Build Command:

```bash
npm install --omit=dev && npm run build
```

4. Start Command:

```bash
npm start
```

5. 添加环境变量：

```text
NODE_ENV=production
HOST=0.0.0.0
DATA_DIR=/data
SAMPLE_SIZE=30
TARGET_RATINGS=3
```

6. 添加 Persistent Disk：

```text
Mount Path: /data
Size: 1 GB
```

7. 部署完成后，Render 会给一个稳定公网 URL。

## Railway 方案

1. 新建 Railway Project，连接 GitHub 仓库。
2. 添加 Volume，挂载到：

```text
/data
```

3. 设置环境变量：

```text
HOST=0.0.0.0
DATA_DIR=/data
SAMPLE_SIZE=30
TARGET_RATINGS=3
```

4. Start Command:

```bash
npm start
```

## 管理和导出

部署后的管理页：

```text
https://你的云端域名/?admin=1
```

下载原始评分：

```text
https://你的云端域名/api/export/responses.csv
```

下载图片汇总：

```text
https://你的云端域名/api/export/image_summary.csv
```

## 数据文件

云端数据会保存在 `DATA_DIR` 指定的目录中：

- `responses.csv`
- `responses.jsonl`
- `assignments.jsonl`
- `image_counts.json`

如果使用 Render/Railway，请务必配置持久磁盘或 Volume。
