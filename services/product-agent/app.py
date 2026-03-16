"""Streamlit UI for Product Structure Agent.

Upload 3 Excel files from 聚水潭 → get instant product structure analysis.
All text in Chinese for the target user (Joanna's team).
"""

import streamlit as st
import pandas as pd
from io import BytesIO

from core.column_mapper import detect_file_type
from core.data_merger import read_and_classify_files, merge_datasets
from core.analyzer import run_full_analysis
from core.excel_writer import write_analysis_excel
from models.schemas import FileType

# --- Page config ---
st.set_page_config(
    page_title="产品结构分析 | Rebase",
    page_icon="📊",
    layout="wide",
)

# --- Header ---
st.title("📊 产品结构分析")
st.markdown(
    "上传聚水潭导出的Excel文件，自动生成产品结构分析报告。"
    "支持自动识别文件类型（销售/库存/畅销款）。"
)
st.divider()

# --- File upload ---
st.subheader("📁 上传数据文件")
st.markdown(
    "从聚水潭导出以下文件（支持 `.xlsx` 和 `.xls` 格式）：\n"
    "1. **年度销售数据** — 包含销售数量、退货、净销售额等\n"
    "2. **当月畅销款** — 包含材质、包型、电商价、省代价等\n"
    "3. **现库存快照** — 包含库存、周日均销量、剩余天数等\n\n"
    "⚡ 文件会自动识别，无需按顺序上传。至少需要上传**销售数据**。"
)

uploaded_files = st.file_uploader(
    "拖拽或选择Excel文件",
    type=["xlsx", "xls"],
    accept_multiple_files=True,
    help="可同时上传1-3个文件",
)

# --- Analysis settings ---
with st.sidebar:
    st.header("⚙️ 分析设置")

    cost_ratio = st.slider(
        "估算成本率",
        min_value=0.20,
        max_value=0.60,
        value=0.40,
        step=0.05,
        help="预估成本占售价的比例（如有省代价会自动替换）",
    )

    months_in_period = st.number_input(
        "销售数据覆盖月数",
        min_value=1,
        max_value=24,
        value=12,
        help="年度数据填12，半年填6，季度填3",
    )

    a_threshold = st.number_input(
        "A级(明星款)净销量门槛",
        min_value=50,
        max_value=500,
        value=200,
        step=10,
        help="净销量 ≥ 此值且满足其他条件 → A级",
    )

    st.divider()
    st.markdown(
        "**产品结构Agent** · v0.1\n\n"
        "由 Rebase 平台驱动\n\n"
        "[GitHub](https://github.com/jojosuperstar0506/rebase)"
    )

# --- Process ---
if uploaded_files:
    # Show detected file types
    st.subheader("🔍 文件识别结果")
    file_buffers = []
    for f in uploaded_files:
        # Read for detection, then reset buffer
        df_peek = pd.read_excel(f)
        file_type = detect_file_type(df_peek)
        f.seek(0)  # Reset for actual processing

        type_labels = {
            FileType.SALES: "📈 年度销售数据",
            FileType.INVENTORY: "📦 现库存快照",
            FileType.BESTSELLER: "⭐ 当月畅销款",
            FileType.UNKNOWN: "❓ 无法识别",
        }
        type_colors = {
            FileType.SALES: "green",
            FileType.INVENTORY: "blue",
            FileType.BESTSELLER: "orange",
            FileType.UNKNOWN: "red",
        }

        st.markdown(
            f":{type_colors[file_type]}[{type_labels[file_type]}] — `{f.name}` ({len(df_peek)}行)"
        )
        file_buffers.append((f.name, f))

    # Run analysis button
    st.divider()
    if st.button("🚀 开始分析", type="primary", use_container_width=True):
        with st.spinner("正在合并数据..."):
            try:
                classified = read_and_classify_files(file_buffers=file_buffers)

                if FileType.SALES not in classified:
                    st.error('未检测到销售数据文件。请确保至少上传了包含「净销售额」「退货数量」等字段的文件。')
                    st.stop()

                file_count = len(classified)
                st.info(f"成功识别 {file_count} 个文件，开始分析...")

            except Exception as e:
                st.error(f"❌ 文件读取失败: {str(e)}")
                st.stop()

        with st.spinner("正在分析产品结构..."):
            try:
                merged_df = merge_datasets(
                    classified,
                    cost_ratio=cost_ratio,
                    months_in_period=months_in_period,
                )
                result = run_full_analysis(merged_df)
            except Exception as e:
                st.error(f"❌ 分析失败: {str(e)}")
                st.stop()

        # --- Display results ---
        st.success(f"✅ 分析完成！共 {result.summary.total_skus} 个SKU")

        # KPI cards
        st.subheader("📊 核心指标")
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric("总SKU数", result.summary.total_skus)
            st.metric("A级明星款", result.summary.grade_a_count)
        with col2:
            st.metric("净销售额", f"¥{result.summary.total_net_revenue:,.0f}")
            st.metric("估算总毛利", f"¥{result.summary.total_estimated_margin:,.0f}")
        with col3:
            st.metric("整体退货率", f"{result.summary.overall_return_rate:.1%}")
            st.metric("整体毛利率", f"{result.summary.overall_margin_rate:.1%}")
        with col4:
            st.metric("D级淘汰候选", result.summary.grade_d_count)
            st.metric("现库存", f"{result.summary.total_current_stock:,}")

        # Key insights
        st.subheader("💡 关键洞察")
        for i, insight in enumerate(result.key_insights, 1):
            st.markdown(f"**{i}.** {insight}")

        # Efficiency grade distribution
        st.subheader("📋 SKU效率分布")
        grade_data = {
            g.rating: {
                "SKU数": g.sku_count,
                "占比": f"{g.sku_share:.1%}",
                "净销售额": f"¥{g.total_net_revenue:,.0f}",
                "营收占比": f"{g.revenue_share:.1%}",
            }
            for g in result.efficiency_grades
        }
        st.dataframe(pd.DataFrame(grade_data).T, use_container_width=True)

        # Generate Excel download
        st.subheader("📥 下载完整报告")
        with st.spinner("正在生成Excel..."):
            excel_buffer = write_analysis_excel(merged_df, result)

        st.download_button(
            label="📥 下载产品结构分析报告 (Excel)",
            data=excel_buffer,
            file_name=f"产品结构分析_{result.analysis_id}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            type="primary",
            use_container_width=True,
        )

        st.markdown(
            "💡 **下一步:** 将 Sheet 1 (数据源_合并) 导入飞书多维表格，"
            "设置材质/包型/价格带为「单选」字段，即可创建可视化仪表盘。"
        )

elif st.session_state.get("_ran_once"):
    st.info("请重新上传文件开始新的分析。")
