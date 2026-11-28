import type {
  AqlValue,
  DefectClassConfig,
  InspectionLevel,
  InspectionSeverity,
  InspectionStage,
} from "../types";

export interface AqlScenePreset {
  id: string;
  name: string;
  stage: InspectionStage;
  description: string;
  level: InspectionLevel;
  severity: InspectionSeverity;
  lotSize: number;
  classes: {
    critical: { enabled: boolean; aql: AqlValue };
    major: { enabled: boolean; aql: AqlValue };
    minor: { enabled: boolean; aql: AqlValue };
  };
}

export const AQL_SCENE_PRESETS: readonly AqlScenePreset[] = [
  {
    id: "iqc-general",
    name: "IQC 通用电子/结构件",
    stage: "IQC",
    description: "CR=0 / MAJ=0.65 / MIN=2.5 · 一般水平 II",
    level: "II",
    severity: "normal",
    lotSize: 2000,
    classes: {
      critical: { enabled: true, aql: 0 },
      major: { enabled: true, aql: 0.65 },
      minor: { enabled: true, aql: 2.5 },
    },
  },
  {
    id: "oqc-shipment",
    name: "OQC 成品出货抽检",
    stage: "OQC",
    description: "CR=0 / MAJ=1.0 / MIN=2.5 · 一般水平 II",
    level: "II",
    severity: "normal",
    lotSize: 1000,
    classes: {
      critical: { enabled: true, aql: 0 },
      major: { enabled: true, aql: 1.0 },
      minor: { enabled: true, aql: 2.5 },
    },
  },
  {
    id: "precision-cnc",
    name: "精密机加工/关键尺寸",
    stage: "IQC",
    description: "CR=0 / MAJ=0.40 / MIN=1.5 · 水平 II",
    level: "II",
    severity: "normal",
    lotSize: 500,
    classes: {
      critical: { enabled: true, aql: 0 },
      major: { enabled: true, aql: 0.4 },
      minor: { enabled: true, aql: 1.5 },
    },
  },
  {
    id: "destructive-s2",
    name: "破坏性/可靠性试验",
    stage: "IPQC",
    description: "MAJ=1.0 · 特殊水平 S-2 小样本",
    level: "S-2",
    severity: "normal",
    lotSize: 3000,
    classes: {
      critical: { enabled: false, aql: 0 },
      major: { enabled: true, aql: 1.0 },
      minor: { enabled: false, aql: 2.5 },
    },
  },
  {
    id: "packaging-cosmetic",
    name: "包材/辅料/外观件",
    stage: "IQC",
    description: "MAJ=1.5 / MIN=4.0 · 一般水平 I",
    level: "I",
    severity: "normal",
    lotSize: 5000,
    classes: {
      critical: { enabled: false, aql: 0 },
      major: { enabled: true, aql: 1.5 },
      minor: { enabled: true, aql: 4.0 },
    },
  },
  {
    id: "tightened-high-risk",
    name: "异常批加严监控",
    stage: "OQC",
    description: "CR=0 / MAJ=0.65 / MIN=1.5 · 加严检验",
    level: "II",
    severity: "tightened",
    lotSize: 1500,
    classes: {
      critical: { enabled: true, aql: 0 },
      major: { enabled: true, aql: 0.65 },
      minor: { enabled: true, aql: 1.5 },
    },
  },
] as const;

export function createDefaultDefectClasses(): DefectClassConfig[] {
  return [
    {
      id: "critical",
      label: "致命缺陷 (CR)",
      shortLabel: "CR 致命",
      enabled: true,
      aql: 0,
      defectsFound: 0,
    },
    {
      id: "major",
      label: "严重缺陷 (MAJ)",
      shortLabel: "MAJ 严重",
      enabled: true,
      aql: 0.65,
      defectsFound: 0,
    },
    {
      id: "minor",
      label: "轻微缺陷 (MIN)",
      shortLabel: "MIN 轻微",
      enabled: true,
      aql: 2.5,
      defectsFound: 0,
    },
  ];
}
