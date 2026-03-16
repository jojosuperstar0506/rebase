# Product Structure Agent (产品结构分析)

> Joanna's first "virtual employee" — analyzes product portfolio, inventory health, and purchasing decisions from ERP data.

**Owner:** Joanna
**Status:** v0.1 — core pipeline working

---

## What It Does

Upload 3 Excel files from 聚水潭 (or any ERP) → get a complete product structure analysis in seconds.

### 4 Business Objectives

| # | Objective | What It Answers |
|---|-----------|----------------|
| 1 | **What to make** | Which material × bag type × price tier combos generate the most profit? Where are gaps? |
| 2 | **Why products fail** | Which segments have the highest return rates? What drives slow movers? |
| 3 | **Inventory health** | Which SKUs are overstocked? Understocked? How many days until stockout? |
| 4 | **How much to order** | Recommended reorder quantities by category with target 库销比 |

### Output

- **Formatted Excel** (2 sheets): merged data source + 8-section analysis document
- **Structured JSON** via API for frontend dashboard integration
- **Streamlit UI** for drag-and-drop analysis

---

## Quick Start

### Run Streamlit UI
```bash
cd services/product-agent
pip install -r requirements.txt
streamlit run app.py
```

### Run with test data
```bash
cd services/product-agent
python3 -m test_data.generate_mock   # Creates 3 mock Excel files
python3 -c "
from core.data_merger import read_and_classify_files, merge_datasets
from core.analyzer import run_full_analysis
from core.excel_writer import write_analysis_excel

classified = read_and_classify_files(file_paths=[
    'test_data/mock_sales.xlsx',
    'test_data/mock_bestseller.xlsx',
    'test_data/mock_inventory.xlsx',
])
merged = merge_datasets(classified)
result = run_full_analysis(merged)
write_analysis_excel(merged, result, output_path='test_data/output_test.xlsx')
print(f'Done! {result.summary.total_skus} SKUs analyzed')
"
```

---

## Data Requirements

### 3 Input Files (from 聚水潭 exports)

| File | Required? | Key Columns | Grain |
|------|-----------|-------------|-------|
| **年度销售数据** | Yes | 款式编码, 产品分类, 基本售价, 销售数量, 退货数量, 净销量, 净销售额, 运费支出 | Base product code |
| **当月畅销款** | Optional | 货号, 材质, 包型, 电商价, 省代价, 吊牌价, 库存, 月销售 | Full SKU (with variant) |
| **现库存快照** | Optional | 货号, 助记码, 聚水潭库存, 周日均销量, 剩余天数, 近4周退货数 | Full SKU (with variant) |

Files are **auto-detected** based on column signatures. Upload in any order.

Column names can shift between exports — the fuzzy column mapper handles common variants (e.g., "聚水潭库存" vs "可用库存" vs "在库数").

---

## Analysis Logic

### Efficiency Grading (A/B/C/D)

| Grade | Criteria | Action |
|-------|----------|--------|
| **A·明星款** | 净销量 ≥ 200, 退货率 < 35%, 毛利 > 0 | Scale up — reorder aggressively |
| **B·稳定款** | 净销量 ≥ 50, 退货率 < 40%, 毛利 > 0 | Maintain — steady reorder |
| **C·观察款** | 净销量 ≥ 10, 毛利 > 0 | Watch — improve or phase out |
| **D·淘汰候选** | Everything else | Kill — liquidate and free capital |

Thresholds are configurable via the sidebar (Streamlit) or API parameters.

### Inventory Health (库销比)

| Status | 库销比 (months) | Meaning |
|--------|----------------|---------|
| 缺货风险 | < 0.5 | Reorder urgently |
| 健康 | 0.5 - 3 | Normal |
| 偏高 | 3 - 6 | Consider markdown |
| 严重积压 | > 6 | Liquidate immediately |
| 零动销 | No sales | Dead stock |

### Known Limitations

1. **No true COGS**: Estimated at 40% of retail (or 省代价 when available). Add COGS column for exact margins.
2. **Material granularity**: Sales file lumps all leather as "真皮女包". Bestseller file distinguishes 头层皮/复合二层皮 — used when available.
3. **Static thresholds**: A-grade threshold of 200 units may be too aggressive for small catalogs. Adjust in sidebar.
4. **No seasonality**: Uses annual average, not seasonal patterns. Monthly breakdown data would improve accuracy.

---

## Architecture

```
services/product-agent/
├── app.py                    # Streamlit UI
├── api.py                    # FastAPI endpoints (for platform integration)
├── core/
│   ├── column_mapper.py      # Fuzzy column matching + file type detection
│   ├── data_merger.py        # 3-file merge + computed fields
│   ├── normalizer.py         # Material, bag type, price tier standardization
│   ├── analyzer.py           # 4-objective analysis engine
│   └── excel_writer.py       # Formatted Excel output (2 sheets, 8 sections)
├── models/
│   └── schemas.py            # Pydantic models (ProductSKU, AnalysisResult, etc.)
├── test_data/
│   ├── generate_mock.py      # Mock data generator (30 SKUs)
│   ├── mock_sales.xlsx       # Sample sales file
│   ├── mock_bestseller.xlsx  # Sample bestseller file
│   └── mock_inventory.xlsx   # Sample inventory file
└── requirements.txt
```

---

## Weekly Workflow (for Joanna's team)

```
聚水潭导出3个Excel (5 min)
    ↓
Streamlit上传 + 下载报告 (2 min)
    ↓
飞书多维表格导入 Sheet 1 (3 min)
    ↓
仪表盘自动更新 → 周会讨论 (15 min)
```

Total: ~25 minutes per week for a complete product health review.
