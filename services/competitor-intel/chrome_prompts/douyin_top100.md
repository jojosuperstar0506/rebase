# 抖店罗盘 / 抖音电商 — Top 100 Product Ranking Extraction

I am logged into my 抖店 seller account. Please extract the top 100 products from the category hot seller rankings.

## Step-by-Step Instructions

### 1. Navigate to the ranking page

**Try the primary path first:**
- Go to **抖店罗盘** (compass.jinritemai.com) → **行业趋势** or **商品排行**

**If the ranking page isn't found there, try the alternative:**
- Go to **抖音电商 seller backend** (fxg.jinritemai.com) → **市场洞察** → **行业排行** or **商品分析**
- Look for a page that shows category-level product rankings by sales

### 2. Select the category
- Drill down to: **箱包** → **女包** (or the most specific women's handbag subcategory available)
- Note the **exact category path** you selected — I need this in the output

### 3. Set time range
- Select **最近7天** or **本周** (whichever is available)

### 4. Set ranking type
- Prefer **销售额** (GMV / sales revenue) if available
- If only **销量** (sales volume / units sold) is available, use that
- Note which metric you selected

### 5. Choose store ranking (not creator ranking)
- If both **达人** (creator/KOL) and **店铺** (store) rankings exist, select the **店铺** (store) view
- We want to see product rankings from brand stores, not individual creators

### 6. Extract products — paginate through all pages
- Navigate through pages to capture **100 products** total
- Click "下一页" or page numbers to advance
- If fewer than 100 exist, capture all available

### 7. For each product, extract:
- **排名** (rank): 1–100
- **商品名称** (product name): full title as displayed
- **品牌** (brand): brand name if displayed (some Douyin products don't show brand separately — leave empty string if not visible)
- **价格** (price): ¥ amount or range
- **销量** (sales volume): units sold in the time period
- **销售额** (sales revenue / GMV): ¥ amount if displayed
- **店铺名** (store name): the Douyin Shop store name
- **带货方式** (sales channel): whether the product is primarily sold via:
  - **直播** (livestream)
  - **短视频** (short video)
  - **商城** (shelf / organic search)
  - Leave blank if not visible
- **商品链接/ID** (product URL or ID): if visible

### Important Notes
- Sales numbers on Douyin should be actual estimates (not index numbers like SYCM)
- Chinese number formats (e.g., "5.2万") can be left as-is — our import script converts them
- Data availability may vary based on your 抖店 subscription tier — extract whatever is visible
- If columns are hidden or require clicking to expand, please do so

## Output Format

Return ONLY a JSON object, no other text. Use this exact structure:

```json
{
  "source": "douyin_shop",
  "extract_date": "2026-03-28",
  "category_path": "箱包 > 女包",
  "time_range": "最近7天",
  "ranking_type": "销售额",
  "total_extracted": 100,
  "pages_navigated": 5,
  "products": [
    {
      "rank": 1,
      "product_name": "大容量真皮托特包通勤女包",
      "brand": "裘真",
      "price": "¥459",
      "sales_volume": "1.2万",
      "sales_revenue": "550万",
      "store_name": "裘真官方旗舰店",
      "sales_channel": "直播",
      "product_id": "https://haohuo.jinritemai.com/..."
    },
    {
      "rank": 2,
      "product_name": "...",
      "brand": "...",
      "price": "...",
      "sales_volume": "...",
      "sales_revenue": "...",
      "store_name": "...",
      "sales_channel": "短视频",
      "product_id": "..."
    }
  ]
}
```

Do NOT include any markdown formatting, code fences, or explanation outside the JSON object.
