# XHS Brand Data Extraction

Visit each of the following brand pages on Xiaohongshu (小红书) and extract the data specified. I am already logged in.

## Brands to Extract

{BRAND_LIST — paste from brand_list_all.md or brand_list_priority5.md}

## For Each Brand, Extract:

### From the brand's official account profile page:
- **Follower count** (粉丝数)
- **Total notes/posts count** (笔记数)
- **Total likes and favorites** (获赞与收藏)
- **Account name** (exactly as displayed)
- **Account ID** (from the URL or profile)
- **Whether the account is verified** (是否认证)

### From searching the brand keyword:
- **Top 5 search suggestions** that appear in the dropdown
- **Related searches** shown at the bottom of results
- **Top 5 notes from search results** — for each note capture:
  - Title
  - Author name
  - Like count
  - Comment count
  - Whether it's a video or image note

### From searching "{brand keyword} 测评" (review search):
- **Top 3 positive themes** you observe (e.g., 质感好, 百搭, 性价比高)
- **Top 3 negative themes** you observe (e.g., 偏重, 容易刮花, 五金氧化)
- **3 sample UGC review snippets** (just the first sentence of each)

## Output Format

Return ONLY a JSON array, no other text. Use this exact structure:

```json
[
  {
    "brand_name": "小CK",
    "brand_name_en": "Charles & Keith",
    "platform": "xhs",
    "extract_date": "2026-03-28",
    "d2_brand_voice": {
      "followers": 150000,
      "notes": 342,
      "likes": 890000,
      "account_name": "Charles & Keith官方账号",
      "account_id": "5f8a...",
      "verified": true
    },
    "d1_search_index": {
      "search_suggestions": ["小CK包包", "小CK新款"],
      "related_searches": ["小CK平替", "小CK和Coach对比"]
    },
    "d3_content_sample": {
      "top_notes": [
        {"title": "...", "author": "...", "likes": 5200, "comments": 340, "type": "image"}
      ]
    },
    "d6_consumer_sentiment": {
      "positive_themes": ["质感好", "百搭", "性价比高"],
      "negative_themes": ["偏重", "容易刮花"],
      "ugc_samples": ["这个包真的太百搭了...", "质感超出预期...", "就是有点重..."]
    }
  }
]
```

Do NOT include any markdown formatting, code fences, or explanation outside the JSON array.
