# 街景照片失序程度评分问卷

这是一个单链接问卷应用。受访者打开同一个链接后，系统会自动从 `问卷/SVs_analysis` 中抽取 30 张图片进行 0-5 分评分。

## 运行

在项目根目录执行：

```powershell
node .\问卷\sv_survey_app\server.mjs
```

打开：

```text
http://127.0.0.1:8787/
```

管理员查看回收进度：

```text
http://127.0.0.1:8787/?admin=1
```

## 抽样逻辑

- 每次进入问卷只生成一份随机任务。
- 每份任务包含 30 张图片。
- 系统会优先抽取当前评分次数较少的图片；在评分次数相同的图片中随机排序。
- 因此，当累计回收约 105 份有效问卷时，1048 张图片都能达到至少 3 次评分，少数图片会多 1 次。

## 数据文件

提交后的数据保存在：

- `问卷/sv_survey_app/data/responses.csv`：原始评分数据，适合 Excel/SPSS/R 读取。
- `问卷/sv_survey_app/data/responses.jsonl`：逐条 JSON 备份。
- `问卷/sv_survey_app/data/image_counts.json`：每张图片已评分次数。
- `问卷/sv_survey_app/data/assignments.jsonl`：每次抽样任务记录。

页面也提供两个下载接口：

- `/api/export/responses.csv`
- `/api/export/image_summary.csv`

## 评分含义

- 0：无失序
- 1：极轻微失序
- 2：轻度失序
- 3：中度失序
- 4：较严重失序
- 5：非常严重失序
