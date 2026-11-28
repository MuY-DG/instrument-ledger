import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { ThemeMode } from "@/lib/themeTransition";

export type WorkbenchToolCategory =
  | "drawing"
  | "sampling"
  | "analysis"
  | "tolerance";

export type WorkbenchToolStatus = "ready" | "planned";

export interface WorkbenchIncomingFile {
  id: string;
  file: File;
}

export interface WorkbenchToolProps {
  /** True only when this tool is currently visible and focused inside the Workbench. */
  active: boolean;
  /** True when a host-level modal/palette/lock overlay is open above the workbench. */
  hostOverlayOpen: boolean;
  /** Current resolved host theme (light / dark). */
  theme: ThemeMode;
  /** Whether the host sidebar is hidden for full-canvas drawing work. */
  immersive: boolean;
  /** Toggle full-canvas immersive mode. */
  onToggleImmersive: () => void;
  /** Return to the QI/QC Workbench Hub view (keeps tool session alive). */
  onBackToHub: () => void;
  /** Show a host toast notification. */
  onNotify: (message: string, type?: "success" | "error") => void;
  /** Optional incoming file routed from another module (e.g., calibration report preview). */
  incomingFile?: WorkbenchIncomingFile | null;
  /** Acknowledge that incomingFile has been consumed. */
  onConsumeIncomingFile?: (id: string) => void;
}

export interface WorkbenchToolDefinition {
  id: string;
  name: string;
  shortName: string;
  subtitle: string;
  description: string;
  category: WorkbenchToolCategory;
  status: WorkbenchToolStatus;
  icon: LucideIcon;
  accent: string;
  tags: string[];
  highlights: string[];
  version?: string;
  /** Keep tool mounted when switching away so active drawings / calculations stay intact. */
  keepAlive?: boolean;
  /** Lazy dynamic loader for code-splitting heavy tool engines (e.g. PDF.js, pdf-lib). */
  load?: () => Promise<{ default: ComponentType<WorkbenchToolProps> }>;
}

export const WORKBENCH_CATEGORY_META: Record<
  WorkbenchToolCategory | "all",
  { label: string; description: string }
> = {
  all: {
    label: "全部工具",
    description: "面向 IQC / IPQC / OQC / QE 日常质检与工程交付的本地工具集",
  },
  drawing: {
    label: "图纸与标注",
    description: "工程图纸气泡号标注、矢量交付与高清导出",
  },
  sampling: {
    label: "抽样与检验",
    description: "AQL 抽样方案查询与来料/出货检验辅助",
  },
  analysis: {
    label: "统计与 SPC",
    description: "CPK / PPK 过程能力评估与实测数据分析",
  },
  tolerance: {
    label: "公差与标准",
    description: "未注公差、形位公差与配合速查",
  },
};
