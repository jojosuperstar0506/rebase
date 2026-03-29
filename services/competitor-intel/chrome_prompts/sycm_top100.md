# 生意参谋 — Top 100 Product Ranking Extraction

I am logged into 生意参谋 (sycm.taobao.com) on my Tmall seller account. Please extract the top 100 products from the category ranking.

## Step-by-Step Instructions

### 1. Navigate to the ranking page
- Go to **生意参谋** → **市场** → **行业排行** (or **品类排行** / **商品排行**, depending on the navigation version)
- If you see "市场" in the left sidebar, click it, then look for "行业排行" or "商品排行"
- If the page has a "商品" sub-tab, select it (we want product rankings, not store rankings)

### 2. Select the category
- Drill down to: **箱包皮具** → **女士包** (or the most specific women's handbag subcategory available, e.g., 单肩/斜挎包)
- Note the **exact category path** you selected — I need this in the output

### 3. Set time range
- Select **最近7天** (last 7 days)

### 4. Set ranking type
- Select **按交易指数** (by transaction index)
- This is the most useful ranking metric — it combines sales volume, conversion, and other factors

### 5. Extract products — paginate through all pages
- SYCM typically shows 20 products per page
- **Navigate through 5 pages** to capture 100 products total
- If the page shows a "下一页" button or page numbers, click to advance
- If fewer than 100 products are available, capture all that exist
- Some data may require clicking "展开" or hovering to reveal — please do so

### 6. For each product, extract:
- **排名** (rank): 1–100
- **商品名称** (product name): full title as displayed
- **品牌** (brand): brand name
- **价格** (price): ¥ amount — may be a range like "¥299-¥599", capture the full string
- **交易指数** (transaction index): the SYCM index number (this is a proprietary index, not actual sales — that's expected)
- **支付转化率** (payment conversion rate): percentage, if displayed
- **搜索人气** (search popularity): index number, if displayed
- **店铺名** (store name): the Tmall/Taobao store name
- **商品链接/ID** (product link or ID): the product URL or item ID if visible

### Important Notes
- SYCM uses **proprietary index numbers**, NOT real sales figures. Extract the index values as-is.
- Some columns may be hidden — expand any collapsed sections
- If any filters are pre-applied by default, note them in the output
- Chinese number formats (e.g., "5.2万") can be left as-is — our import script handles conversion

## Output Format

Return ONLY a JSON object, no other text. Use this exact structure:

```json
{
  "source": "sycm",
  "extract_date": "2026-03-28",
  "category_path": "箱包皮具 > 女士包",
  "time_range": "最近7天",
  "ranking_type": "交易指数",
  "total_extracted": 100,
  "pages_navigated": 5,
  "products": [
    {
      "rank": 1,
      "product_name": "真皮女包单肩斜挎包2026新款",
      "brand": "Songmont",
      "price": "¥899",
      "transaction_index": 98543,
      "payment_conversion_rate": "4.2%",
      "search_popularity": 45230,
      "store_name": "Songmont官方旗舰店",
      "product_id": "https://detail.tmall.com/item.htm?id=..."
    },
    {
      "rank": 2,
      "product_name": "...",
      "brand": "...",
      "price": "...",
      "transaction_index": 87654,
      "payment_conversion_rate": "3.8%",
      "search_popularity": 38120,
      "store_name": "...",
      "product_id": "..."
    }
  ]
}
```

Do NOT include any markdown formatting, code fences, or explanation outside the JSON object.
