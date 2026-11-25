import React from "react";
import { calTypeLabel, getInstrumentStatus, getTodayStr } from "@/lib/status";
import type { AppSettings, CategoryTab, Instrument } from "@/types";

interface PrintLedgerViewProps {
  instruments: Instrument[];
  settings: AppSettings;
  activeCategory: CategoryTab;
  logoDataUrl: string;
}

export const PrintLedgerView: React.FC<PrintLedgerViewProps> = ({
  instruments,
  settings,
  activeCategory,
  logoDataUrl,
}) => {
  const isFixtureOnly = activeCategory === "fixture";

  return (
    <div className="hidden print-only bg-white text-black">
      {/* Header */}
      <div className="relative text-center mb-2">
        {logoDataUrl && (
          <img
            src={logoDataUrl}
            alt="Logo"
            className="absolute left-0 top-0 h-10 object-contain"
          />
        )}
        <h1 className="text-lg font-bold tracking-wide">
          {settings.docTitle || "监视与测量管理台账"}
          {activeCategory === "gauge"
            ? "（量具）"
            : activeCategory === "fixture"
              ? "（检具）"
              : ""}
        </h1>
        <p className="text-[9pt] text-slate-600 italic">
          {settings.docSubtitle}
        </p>
      </div>

      <div className="flex items-center justify-between text-[8.5pt] mb-2">
        <span className="font-medium text-amber-800">{settings.weeklyNotice}</span>
        <div className="flex items-center gap-6">
          <span>打印日期：{getTodayStr()}</span>
          <span>共 {instruments.length} 台</span>
          <span className="font-semibold">
            表格编号：{settings.docCode} 版本：{settings.docVersion}
          </span>
        </div>
      </div>

      {/* Bordered Table */}
      <table className="print-table">
        <thead>
          <tr className="bg-slate-100 text-center font-semibold">
            <th className="w-8">序号</th>
            <th className="w-16">部门</th>
            <th>{isFixtureOnly ? "检具名称" : "仪器名称"}</th>
            <th>出厂/管理编号</th>
            <th>型号规格</th>
            {!isFixtureOnly && <th>存放位置</th>}
            <th className="w-12">校验</th>
            <th className="w-20">上次检验</th>
            <th className="w-12">周期</th>
            <th className="w-20">下次检验</th>
            <th className="w-20">状态</th>
            <th>检测机构</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {instruments.map((inst, idx) => {
            const st = getInstrumentStatus(inst, settings.warningDays);
            const statusBg =
              st.status === "valid"
                ? "bg-emerald-100 text-emerald-900"
                : st.status === "warning"
                  ? "bg-amber-100 text-amber-900"
                  : st.status === "expired"
                    ? "bg-rose-100 text-rose-900 font-bold"
                    : "bg-slate-100 text-slate-600";
            return (
              <tr key={inst.id}>
                <td className="text-center">{idx + 1}</td>
                <td className="text-center">{inst.department}</td>
                <td className="font-medium">{inst.name}</td>
                <td className="font-mono text-[8pt]">{inst.serialNo}</td>
                <td>{inst.modelSpec}</td>
                {!isFixtureOnly && <td>{inst.location}</td>}
                <td className="text-center">{calTypeLabel(inst.calibrationType)}</td>
                <td className="text-center font-mono text-[8pt]">{inst.lastCalDate}</td>
                <td className="text-center">
                  {inst.calCycleMonths > 0 ? `${inst.calCycleMonths}月` : ""}
                </td>
                <td className="text-center font-mono text-[8pt]">{inst.nextCalDate}</td>
                <td className={`text-center ${statusBg}`}>
                  {st.label}
                  {st.daysRemaining !== null ? `(${st.detailText})` : ""}
                </td>
                <td>{inst.calAgency}</td>
                <td>{inst.remark}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Signature Footer */}
      <div className="grid grid-cols-3 gap-8 mt-5 pt-2 text-[9pt]">
        <div>
          <div className="font-semibold">编制/日期：____________________</div>
          <div className="text-[7.5pt] text-slate-500">Prepare / Date</div>
        </div>
        <div>
          <div className="font-semibold">审核/日期：____________________</div>
          <div className="text-[7.5pt] text-slate-500">Check / Date</div>
        </div>
        <div>
          <div className="font-semibold">批准/日期：____________________</div>
          <div className="text-[7.5pt] text-slate-500">Approve / Date</div>
        </div>
      </div>
    </div>
  );
};
