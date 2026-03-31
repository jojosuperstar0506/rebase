import { useState } from "react";
import FileUpload from "./FileUpload";

// Design tokens
const BG = "#0c0c14";
const S1 = "#14141e";
const BD = "#2a2a3a";
const AC = "#06b6d4";
const TX = "#e4e4ec";
const T2 = "#9898a8";

const EXAMPLES: { label: string; text: string }[] = [
  {
    label: "订单履约流程",
    text: "每天早上，销售部从微信群和淘宝/抖音后台收集客户订单，手动汇总到Excel表格里。如果是大客户订单（金额超过5000元），需要销售经理在微信里审批确认。审批通过后把订单信息打印出来，交给仓库部。仓库根据纸质单据拣货、打包，同时财务部核对订单金额和收款记录。如果库存不足，采购部需要紧急联系供应商补货。拣完货后手动在Excel里更新库存。财务部每天下午花30分钟对账，发现不一致就在微信群里跟销售确认。每周五财务做一次周报，从Excel里手动汇总数据。",
  },
  {
    label: "采购入库流程",
    text: "采购部每周检查一次库存，在Excel里看哪些商品低于安全库存。然后手动在微信上联系3-5家供应商询价比较，选定后下单。供应商发货后，仓库收货时用纸质验收单逐一核对品名、数量、质量。如果验收不通过（数量不对或质量问题），需要拍照发微信群通知采购部处理退换，同时暂停入库。验收通过后手动录入ERP系统（用友U8）。如果是新品首次入库，还需要产品部确认商品信息和定价。财务每月底根据入库单和供应商对账单手动核对应付账款，经常出现发票和入库数量不一致的情况。",
  },
  {
    label: "售后退换货流程",
    text: "客户通过微信或淘宝客服提出退换货申请。客服先判断是退货还是换货，记录在共享Excel表里，包含订单号、问题描述、客户要求。如果是质量问题可以直接处理，如果是非质量问题（不喜欢、买错了）需要检查是否在7天退货期内。金额超过200元需要主管在微信里审批，超过1000元需要经理审批。审批通过后客服通知客户寄回商品。仓库收到退货后检查商品状态——如果商品完好可以重新入库，如果损坏需要报废处理。检查完成后微信通知财务处理退款。财务手动在支付宝/微信后台操作退款，退货的要全额退，换货的要安排重新发货。整个流程大概需要3-7个工作日，客户经常投诉太慢。",
  },
];

interface IntakePanelProps {
  description: string;
  files: File[];
  onDescriptionChange: (desc: string) => void;
  onFilesChange: (files: File[]) => void;
  onSubmit: () => void;
  inlineError?: string | null;
}

export default function IntakePanel({
  description,
  files,
  onDescriptionChange,
  onFilesChange,
  onSubmit,
  inlineError,
}: IntakePanelProps) {
  const [hoveredExample, setHoveredExample] = useState<number | null>(null);
  const [activeExample, setActiveExample] = useState<number | null>(null);
  const [submitHover, setSubmitHover] = useState(false);

  function handleExampleClick(idx: number) {
    const example = EXAMPLES[idx];
    if (description.trim() && description !== EXAMPLES[activeExample ?? -1]?.text) {
      if (!window.confirm("覆盖当前内容？")) return;
    }
    onDescriptionChange(example.text);
    setActiveExample(idx);
  }

  const canSubmit = description.trim().length > 0;

  return (
    <div
      className="ip-outer"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 24px 40px",
        minHeight: "100vh",
      }}
    >
      <style>{`
        .ip-card { width: 100%; max-width: 720px; }
        .ip-textarea { min-height: 140px; }
        .ip-submit { min-height: 44px; }
        .ip-pill { min-height: 36px; }
        @media (max-width: 768px) {
          .ip-outer { padding: 24px 16px 32px !important; }
          .ip-card { padding: 20px !important; }
          .ip-textarea { min-height: 180px !important; }
          .ip-header h1 { font-size: 24px !important; }
        }
      `}</style>
      {/* Header */}
      <div className="ip-header" style={{ textAlign: "center", marginBottom: 36 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: AC,
            margin: 0,
            letterSpacing: "0.02em",
          }}
        >
          流程扫描
        </h1>
        <div
          style={{
            fontSize: 16,
            color: T2,
            marginTop: 4,
            fontWeight: 400,
          }}
        >
          Workflow Scout
        </div>
        <p
          style={{
            fontSize: 14,
            color: T2,
            marginTop: 12,
            maxWidth: 560,
            lineHeight: 1.6,
          }}
        >
          描述您的业务流程，上传相关文档，获取智能优化建议
        </p>
      </div>

      {/* Main card */}
      <div
        className="ip-card"
        style={{
          background: S1,
          border: `1px solid ${BD}`,
          borderRadius: 12,
          padding: 36,
        }}
      >
        {/* Textarea section */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ marginBottom: 8 }}>
            <span
              style={{ fontSize: 12, color: T2, fontWeight: 600 }}
            >
              描述您的业务流程
            </span>
            <span
              style={{ fontSize: 11, color: T2, marginLeft: 8, fontWeight: 400 }}
            >
              Describe your business workflow
            </span>
          </div>
          <textarea
            value={description}
            onChange={(e) => {
              onDescriptionChange(e.target.value);
              setActiveExample(null);
            }}
            rows={6}
            placeholder="例如：每天早上，销售部从微信群收集客户订单，手动录入到Excel表格里，再发给仓库部打印拣货单..."
            className="ip-textarea"
            style={{
              width: "100%",
              background: BG,
              border: `1px solid ${inlineError ? "#ef4444" : BD}`,
              borderRadius: 8,
              padding: "12px 14px",
              color: TX,
              fontSize: 14,
              lineHeight: 1.7,
              resize: "vertical",
              fontFamily: "system-ui, sans-serif",
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = AC;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = inlineError ? "#ef4444" : BD;
            }}
          />
          {inlineError && (
            <div style={{ color: "#ef4444", fontSize: 12, marginTop: 6 }}>
              ⚠ {inlineError}
            </div>
          )}
        </div>

        {/* File upload section */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: T2, fontWeight: 600 }}>
              上传相关文档（可选）
            </span>
            <span
              style={{ fontSize: 11, color: T2, marginLeft: 8, fontWeight: 400 }}
            >
              Upload supporting documents (optional)
            </span>
          </div>
          <FileUpload files={files} onFilesChange={onFilesChange} />
        </div>

        {/* Quick examples */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: T2, fontWeight: 600 }}>
              快速示例
            </span>
            <span
              style={{ fontSize: 11, color: T2, marginLeft: 8, fontWeight: 400 }}
            >
              Quick examples
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {EXAMPLES.map((ex, i) => {
              const isActive = activeExample === i;
              const isHovered = hoveredExample === i;
              return (
                <button
                  key={i}
                  className="ip-pill"
                  onClick={() => handleExampleClick(i)}
                  onMouseEnter={() => setHoveredExample(i)}
                  onMouseLeave={() => setHoveredExample(null)}
                  style={{
                    padding: "7px 16px",
                    borderRadius: 20,
                    border: `1px solid ${isActive ? AC : isHovered ? AC : BD}`,
                    background: isActive
                      ? `${AC}18`
                      : isHovered
                        ? `${AC}0a`
                        : "transparent",
                    color: isActive ? AC : isHovered ? TX : T2,
                    fontSize: 13,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    fontFamily: "system-ui, sans-serif",
                  }}
                >
                  {ex.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Submit button */}
        <button
          className="ip-submit"
          onClick={onSubmit}
          disabled={!canSubmit}
          onMouseEnter={() => setSubmitHover(true)}
          onMouseLeave={() => setSubmitHover(false)}
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 8,
            border: "none",
            background: canSubmit
              ? submitHover
                ? "#05a3c0"
                : AC
              : "#2a2a3a",
            color: canSubmit ? "#000" : "#555",
            fontSize: 15,
            fontWeight: 700,
            cursor: canSubmit ? "pointer" : "not-allowed",
            transition: "all 0.2s",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          开始扫描 →
        </button>
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 24,
          fontSize: 13,
          color: T2,
          textAlign: "center",
        }}
      >
        Powered by Rebase · 您的数据安全且不会被存储
      </div>
    </div>
  );
}
