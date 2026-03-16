"""Generate mock Excel test data for the Product Structure Agent.

Creates 3 Excel files simulating 聚水潭 exports for a bags/accessories brand:
1. 年度销售数据 (yearly sales — ~30 SKUs)
2. 当月畅销款 (monthly bestsellers — ~15 SKUs)
3. 现库存快照 (current inventory — ~20 SKUs)

Run: python -m test_data.generate_mock
"""

import random
import pandas as pd
from pathlib import Path

random.seed(42)

OUTPUT_DIR = Path(__file__).parent


# --- Shared product catalog ---
PRODUCTS = [
    # (base_code, name, category, material, bag_type, retail_price, series)
    ("1526L3031", "经典单肩包", "真皮女包", "复合二层皮", "单肩包", 329, "古岩系列"),
    ("1526L3015", "通勤手提包", "真皮女包", "头层皮", "手提包", 499, "墨影系列"),
    ("1526L3042", "百搭斜挎包", "PU女包", "PU", "斜挎包", 199, "云石系列"),
    ("1526L3008", "复古水桶包", "真皮女包", "头层皮", "水桶包", 459, "流光系列"),
    ("1526L3055", "轻奢链条包", "PU女包", "PU", "链条包", 269, "织梦系列"),
    ("1526L3021", "日系托特包", "PU女包", "PU", "女式单肩包", 159, None),
    ("1526L3033", "简约双肩包", "PU女包", "PU", "双肩包", 189, None),
    ("1526L3018", "商务公文包", "真皮女包", "头层皮", "公文包", 599, None),
    ("1526L3047", "迷你腋下包", "PU女包", "PU", "腋下包", 149, None),
    ("1526L3012", "编织手拿包", "PVC女包", "PVC", "手拿包", 129, None),
    ("1526L3039", "大容量购物袋", "帆布女包", "帆布", "购物袋", 89, None),
    ("1526L3027", "精致卡包", "真皮女包", "头层皮", "钱包", 199, None),
    ("1526L3050", "时尚腰包", "PU女包", "PU", "腰包", 169, None),
    ("1526L3009", "休闲斜挎小包", "超纤女包", "超纤", "斜挎包", 219, None),
    ("1526L3044", "复古手提包大号", "真皮女包", "复合二层皮", "手提包", 389, "古岩系列"),
    ("1526L3016", "通勤单肩包", "PU女包", "PU", "单肩包", 179, None),
    ("1526L3035", "小众链条包", "PU女包", "PU", "链条包", 239, None),
    ("1526L3022", "旅行双肩包", "尼龙女包", "尼龙", "双肩包", 259, None),
    ("1526L3058", "真皮钱包长款", "真皮女包", "头层皮", "钱包", 349, None),
    ("1526L3041", "PVC透明手拿", "PVC女包", "PVC", "手拿包", 99, None),
    ("1526L3029", "单肩通勤大包", "真皮女包", "复合二层皮", "女士单肩包", 359, "墨影系列"),
    ("1526L3014", "迷你斜挎包", "PU女包", "PU", "斜挎包", 139, None),
    ("1526L3037", "编织托特包", "PVC女包", "PVC", "托特包", 159, None),
    ("1526L3051", "真皮腋下包", "真皮女包", "头层皮", "腋下包", 429, None),
    ("1526L3006", "超纤单肩包", "超纤女包", "超纤", "单肩包", 249, None),
    ("1526L3048", "帆布双肩包", "帆布女包", "帆布", "双肩包", 119, None),
    ("1526L3023", "PU手提包", "PU女包", "PU", "手提包", 209, None),
    ("1526L3060", "头层皮斜挎", "真皮女包", "头层皮", "斜挎包", 479, None),
    ("1526L3034", "尼龙单肩包", "尼龙女包", "尼龙", "单肩包", 189, None),
    ("1526L3019", "复合皮水桶包", "真皮女包", "复合二层皮", "水桶包", 309, None),
]


def _gen_sales_data() -> pd.DataFrame:
    """Generate yearly sales data (simulates 聚水潭 sales export)."""
    rows = []
    for code, name, category, material, bag_type, price, series in PRODUCTS:
        # Simulate realistic sales distribution (power law)
        base_volume = random.choice([5, 10, 20, 50, 80, 150, 300, 500, 800])
        sales_vol = base_volume + random.randint(-base_volume // 3, base_volume // 3)
        sales_vol = max(1, sales_vol)

        # Return rates vary by material and price
        if "真皮" in category:
            return_rate = random.uniform(0.30, 0.50)
        elif "PU" in category:
            return_rate = random.uniform(0.20, 0.35)
        else:
            return_rate = random.uniform(0.15, 0.30)

        return_vol = int(sales_vol * return_rate)
        net_vol = sales_vol - return_vol
        gross_rev = sales_vol * price
        # Net revenue accounts for returns
        net_rev = net_vol * price * random.uniform(0.85, 1.0)  # Some discounting
        shipping = net_vol * random.uniform(6, 12)

        rows.append({
            "款式编码": code,
            "商品名称": name,
            "产品分类": category,
            "包型": series if series else bag_type,
            "基本售价": price,
            "销售数量": sales_vol,
            "退货数量": return_vol,
            "净销量": net_vol,
            "销售额": round(gross_rev, 2),
            "净销售额": round(net_rev, 2),
            "运费支出": round(shipping, 2),
        })

    return pd.DataFrame(rows)


def _gen_bestseller_data() -> pd.DataFrame:
    """Generate monthly bestseller data (top 15 with material detail)."""
    # Pick the higher-volume products
    sorted_products = sorted(PRODUCTS, key=lambda p: p[5], reverse=True)[:15]
    rows = []

    for code, name, category, material, bag_type, price, series in sorted_products:
        # Add variant suffix
        variants = ["A1DS", "B2MK", "C3WH"]
        for variant in random.sample(variants, random.randint(1, 2)):
            full_sku = f"{code}{variant}"
            monthly_sales = random.randint(5, 80)
            stock = random.randint(10, 200)
            tag_price = int(price * random.uniform(1.5, 2.0))
            dealer_price = int(price * random.uniform(0.35, 0.45))

            rows.append({
                "货号": full_sku,
                "商品名称": name,
                "材质": material,
                "包型": bag_type,
                "电商价": price,
                "省代价": dealer_price,
                "吊牌价": tag_price,
                "库存": stock,
                "月销售": monthly_sales,
            })

    return pd.DataFrame(rows)


def _gen_inventory_data() -> pd.DataFrame:
    """Generate current inventory snapshot."""
    rows = []

    for code, name, category, material, bag_type, price, series in PRODUCTS[:20]:
        variants = ["A1DS", "B2MK", "C3WH"]
        for variant in random.sample(variants, random.randint(1, 3)):
            full_sku = f"{code}{variant}"
            stock = random.randint(0, 300)
            weekly_daily = round(random.uniform(0, 5), 1)
            days_remaining = round(stock / weekly_daily, 0) if weekly_daily > 0 else 999
            recent_returns = random.randint(0, 15)

            rows.append({
                "货号": full_sku,
                "商品名称": name,
                "助记码": code,
                "聚水潭库存": stock,
                "周日均销量": weekly_daily,
                "剩余天数": min(days_remaining, 999),
                "近4周退货数": recent_returns,
                "采购订": random.randint(0, 100),
                "采购欠": random.randint(0, 50),
            })

    return pd.DataFrame(rows)


def generate_all():
    """Generate all 3 mock data files."""
    sales_df = _gen_sales_data()
    bestseller_df = _gen_bestseller_data()
    inventory_df = _gen_inventory_data()

    sales_path = OUTPUT_DIR / "mock_sales.xlsx"
    bestseller_path = OUTPUT_DIR / "mock_bestseller.xlsx"
    inventory_path = OUTPUT_DIR / "mock_inventory.xlsx"

    sales_df.to_excel(sales_path, index=False)
    bestseller_df.to_excel(bestseller_path, index=False)
    inventory_df.to_excel(inventory_path, index=False)

    print(f"✅ Generated mock data:")
    print(f"   Sales:      {sales_path} ({len(sales_df)} rows)")
    print(f"   Bestseller: {bestseller_path} ({len(bestseller_df)} rows)")
    print(f"   Inventory:  {inventory_path} ({len(inventory_df)} rows)")

    return sales_path, bestseller_path, inventory_path


if __name__ == "__main__":
    generate_all()
