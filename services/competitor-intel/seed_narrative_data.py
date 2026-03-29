"""
Seed script: populates the SQLite database with sample narrative data
for dashboard testing, without needing real Claude API calls.

Usage:
    python -m services.competitor-intel.seed_narrative_data
"""

import json
from datetime import datetime

from .storage import init_db, save_narrative


# ─── Brand narratives ────────────────────────────────────────────────────────

BRAND_NARRATIVES = {
    "裘真": (
        "裘真本周动量领先(70.6分),产品上新激进(+112 SKU),属于PRODUCT_BLITZ信号。"
        "抖音提及量暴涨(+38%),小红书种草笔记数环比增长22%,显示品牌正在加大社媒投放力度。"
        "价格带集中在300-500元,与OMI核心价格带高度重叠。"
        "建议OMI密切关注其在300-500元价格带的扩张动作,尤其是通勤托特包和水桶包品类。"
        "裘真近期签约了3位百万粉丝级抖音达人,预计下周将有集中带货动作。"
    ),
    "Songmont": (
        "Songmont本周动量得分62.3,排名第二。品牌持续深耕高端轻奢定位,均价维持在800-1500元区间。"
        "天猫旗舰店月销稳步增长(+15%),但抖音渠道表现平淡,短视频互动率下降12%。"
        "小红书品牌声量保持高位,KOL合作笔记质量较高,平均点赞数超过2000。"
        "本周新推出的「山下有松」系列引发较多讨论,设计语言偏向极简中式,与OMI差异化明显。"
        "威胁指数中等(45.2),主要竞争维度在品牌调性而非价格。"
    ),
    "小CK": (
        "小CK(Charles & Keith)本周动量得分58.1,呈现缓慢下降趋势(-3.2)。"
        "品牌在中国市场的社媒声量连续三周下滑,小红书提及量环比减少18%。"
        "天猫店铺促销力度加大,部分SKU折扣达到5折,疑似清库存动作。"
        "抖音官方账号更新频率降低,从日更降至周更3次,内容策略可能在调整中。"
        "对OMI威胁指数较低(32.8),但需关注其大促期间的价格战策略,避免被动卷入折扣竞争。"
    ),
    "CASSILE": (
        "CASSILE本周动量得分55.7,属于稳健型竞争者。品牌定位偏向职场通勤,核心客群为25-35岁白领女性。"
        "小红书种草笔记以穿搭教程为主,内容质量中等,互动数据平稳。"
        "抖音直播间GMV环比增长28%,主要由一场与头部主播的合作贡献,常态化直播数据一般。"
        "本周上新8款秋季新品,设计风格趋向简约通勤,与OMI部分产品线存在重叠。"
        "建议关注其直播渠道策略,CASSILE正在测试品牌自播+达人矩阵的组合模式。"
    ),
    "La Festin": (
        "La Festin(拉菲斯汀)本周动量得分51.4,处于观察区间。品牌以法式轻奢为卖点,均价400-800元。"
        "天猫渠道表现稳定,但增长乏力,月销环比仅增长3%。"
        "小红书内容策略转向UGC驱动,鼓励用户晒单返现,笔记数量增长但质量参差不齐。"
        "抖音渠道几乎无布局,错失短视频电商红利,这是其最大短板。"
        "对OMI直接威胁较低(28.5),但在400-600元「轻奢入门」价格带存在一定竞争。"
        "品牌近期在筹备线下快闪店活动,试图提升品牌调性认知。"
    ),
}

# ─── Strategic summary ────────────────────────────────────────────────────────

STRATEGIC_SUMMARY = (
    "本周竞品格局整体呈现「一超多强」态势。裘真以70.6分的动量得分领跑,其激进的产品上新策略"
    "(+112 SKU)和社媒投放力度值得高度警惕。Songmont稳居第二梯队,凭借差异化的高端定位"
    "和优质内容策略维持品牌势能。\n\n"
    "从渠道维度看,抖音电商正在成为竞争焦点。裘真和CASSILE均在加大抖音投入,"
    "而小CK和La Festin在该渠道表现薄弱。OMI应抓住抖音渠道的结构性机会,"
    "在竞品尚未完全建立优势前抢占用户心智。小红书仍然是品牌种草的核心阵地,"
    "各品牌投入力度不减,内容质量和KOL合作效率将成为差异化关键。\n\n"
    "价格竞争方面,300-500元价格带竞争最为激烈,裘真的大规模上新直接冲击该区间。"
    "500-800元区间竞争相对温和,OMI可考虑通过产品升级策略向上拓展,避开低价红海。"
    "小CK的清库存折扣动作可能引发短期价格扰动,需做好应对预案。\n\n"
    "综合建议:OMI应在保持300-500元核心价格带竞争力的同时,加速抖音渠道建设,"
    "重点关注裘真的产品动向和CASSILE的直播策略,在内容营销上保持小红书投入并提升KOL合作层级。"
)

# ─── Action items ─────────────────────────────────────────────────────────────

ACTION_ITEMS = [
    {
        "action": "针对裘真+112 SKU上新,梳理OMI在300-500元价格带的产品矩阵,识别防御缺口",
        "department": "产品部",
        "urgency": "本周",
        "rationale": "裘真PRODUCT_BLITZ信号明确,若不及时响应可能丢失核心价格带份额"
    },
    {
        "action": "加速抖音品牌自播间搭建,目标两周内实现日播,并储备3-5位达人合作资源",
        "department": "电商部",
        "urgency": "本周",
        "rationale": "抖音电商是当前竞品争夺焦点,裘真和CASSILE均在加大投入,OMI不能缺位"
    },
    {
        "action": "小红书KOL合作升级,本月签约2位50万粉以上的时尚博主进行深度种草",
        "department": "市场部",
        "urgency": "本月",
        "rationale": "Songmont在小红书内容质量上领先,OMI需提升KOL层级以保持竞争力"
    },
    {
        "action": "准备618大促防御性定价方案,预设小CK等品牌发起价格战时的应对策略",
        "department": "运营部",
        "urgency": "本月",
        "rationale": "小CK正在清库存,大促期间可能引发价格扰动,需要提前准备应对预案"
    },
    {
        "action": "启动500-800元「轻奢升级」产品线规划,Q3推出首批SKU",
        "department": "产品部",
        "urgency": "本季度",
        "rationale": "该价格带竞争相对温和,是OMI向上拓展、避开低价红海的战略机会"
    },
    {
        "action": "建立竞品抖音直播监控机制,每周输出裘真、CASSILE直播数据周报",
        "department": "数据部",
        "urgency": "本季度",
        "rationale": "持续跟踪竞品直播策略演变,为OMI直播间运营提供数据支撑"
    },
    {
        "action": "调研La Festin线下快闪店模式,评估OMI线下体验营销的可行性",
        "department": "品牌部",
        "urgency": "本季度",
        "rationale": "线下体验店可提升品牌调性认知,La Festin的尝试值得关注和借鉴"
    },
]


def main():
    """Seed the database with sample narrative data."""
    today = datetime.now().strftime("%Y-%m-%d")

    print(f"Initializing database...")
    conn = init_db()

    # Seed per-brand narratives
    for brand, content in BRAND_NARRATIVES.items():
        print(f"  Seeding brand narrative: {brand}")
        save_narrative(
            conn,
            date=today,
            narrative_type="brand",
            content=content,
            brand_name=brand,
            model_used="seed-data",
            input_tokens=0,
            output_tokens=0,
            cost_estimate=0.0,
        )

    # Seed strategic summary
    print("  Seeding strategic_summary narrative...")
    save_narrative(
        conn,
        date=today,
        narrative_type="strategic_summary",
        content=STRATEGIC_SUMMARY,
        brand_name=None,
        model_used="seed-data",
        input_tokens=0,
        output_tokens=0,
        cost_estimate=0.0,
    )

    # Seed action items
    print("  Seeding action_items narrative...")
    save_narrative(
        conn,
        date=today,
        narrative_type="action_items",
        content=json.dumps(ACTION_ITEMS, ensure_ascii=False),
        brand_name=None,
        model_used="seed-data",
        input_tokens=0,
        output_tokens=0,
        cost_estimate=0.0,
    )

    print(f"Done! Seeded {len(BRAND_NARRATIVES)} brand narratives + strategic_summary + action_items for {today}.")


if __name__ == "__main__":
    main()
