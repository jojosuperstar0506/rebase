# Douyin Brand Data Extraction

Visit each of the following brand pages on Douyin (抖音) and extract the data specified. I am already logged in.

## Brands to Extract

{BRAND_LIST — paste from brand_list_all.md or brand_list_priority5.md}

## For Each Brand, Extract:

### From the brand's official Douyin account page:
- **Follower count** (粉丝)
- **Total videos count** (作品数)
- **Total likes** (获赞)
- **Account name** (exactly as displayed)
- **Account ID** (抖音号)
- **Whether the account is verified** (是否认证)

### From the brand's Douyin shop (if exists):
- **Number of products in shop** (商品数量)
- **Whether they do livestreams** (yes/no)
- **If currently live:** viewer count
- **Top 3 selling products:** name and price

### From searching the brand keyword:
- **Top 5 search suggestions**
- **Top 3 trending related hashtags** with view counts
- **Top 3 creators/KOLs** making content about this brand — name and follower count

## Output Format

Return ONLY a JSON array, no other text. Use this exact structure:

```json
[
  {
    "brand_name": "小CK",
    "brand_name_en": "Charles & Keith",
    "platform": "douyin",
    "extract_date": "2026-03-28",
    "d2_brand_voice": {
      "followers": 89000,
      "videos": 156,
      "likes": 1200000,
      "account_name": "CharlesKeith官方旗舰店",
      "account_id": "CK12345",
      "verified": true
    },
    "d5_social_commerce": {
      "shop_product_count": 45,
      "live_status": "not_live",
      "live_viewers": 0,
      "top_selling_products": [
        {"name": "链条单肩包", "price": 499}
      ]
    },
    "d1_search_index": {
      "search_suggestions": ["小CK包包", "小CK新款2026"],
      "trending_hashtags": {"#小CK": "2.3亿", "#小CK穿搭": "8900万"}
    },
    "d4_kol_ecosystem": {
      "top_creators": [
        {"name": "时尚搭配师小鱼", "followers": 520000}
      ]
    }
  }
]
```

Do NOT include any markdown formatting, code fences, or explanation outside the JSON array.
