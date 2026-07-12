# GitHub Pages + Google Sheets 使用步骤

这个方案不需要 Render 付费，也不需要电脑一直开机。

## 1. 创建 Google Sheet

新建一个 Google Sheet，例如：

```text
urban-disorder-survey-responses
```

打开表格后选择：

```text
扩展程序 -> Apps Script
```

## 2. 粘贴 Apps Script

把仓库中的这份代码复制到 Apps Script：

```text
google_apps_script/Code.gs
```

保存项目。

## 3. 部署 Apps Script Web App

点击：

```text
部署 -> 新建部署
```

设置：

```text
类型：Web 应用
执行身份：我
谁可以访问：任何人
```

部署后复制 Web App URL，格式通常类似：

```text
https://script.google.com/macros/s/......../exec
```

## 4. 写入 Web App URL

打开：

```text
docs/config.js
```

把：

```js
GOOGLE_SCRIPT_URL: "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE"
```

改成你的 Web App URL。

## 5. 推送到 GitHub

在 GitHub Desktop 中提交并 Push。

## 6. 开启 GitHub Pages

进入 GitHub 仓库页面：

```text
Settings -> Pages
```

设置：

```text
Source: Deploy from a branch
Branch: main
Folder: /docs
```

保存后 GitHub 会生成问卷网址，例如：

```text
https://xiuwenni.github.io/urban-disorder-survey/
```

## 7. 数据在哪里看

评分数据会写入 Google Sheet 的：

- `responses`
- `assignments`
- `image_summary`

其中 `image_summary` 会按图片编号汇总评分次数、平均分、最大值、最小值和是否达到至少 3 次评分。
