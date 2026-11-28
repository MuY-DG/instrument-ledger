import { WORKBENCH_TOOLS } from "@/workbench/registry";

export type SidebarGroupId = "categories" | "status" | "workbench";

export interface SidebarItemConfig {
  id: string;
  visible: boolean;
}

export interface SidebarGroupConfig {
  id: SidebarGroupId;
  visible: boolean;
  items: SidebarItemConfig[];
}

export interface SidebarNavConfig {
  groups: SidebarGroupConfig[];
}

const VALID_GROUP_IDS = new Set<SidebarGroupId>([
  "categories",
  "status",
  "workbench",
]);

function getDefaultGroupItemIds(groupId: SidebarGroupId): string[] {
  if (groupId === "categories") {
    return ["gauge", "fixture", "all"];
  }
  if (groupId === "status") {
    return ["all", "valid", "warning", "expired", "exempt"];
  }
  return [
    "hub",
    ...WORKBENCH_TOOLS.filter((tool) => tool.status === "ready").map(
      (tool) => tool.id
    ),
  ];
}

export function getDefaultSidebarNavConfig(): SidebarNavConfig {
  const order: SidebarGroupId[] = ["categories", "status", "workbench"];
  return {
    groups: order.map((id) => ({
      id,
      visible: true,
      items: getDefaultGroupItemIds(id).map((itemId) => ({
        id: itemId,
        visible: true,
      })),
    })),
  };
}

export function cloneSidebarNavConfig(cfg: SidebarNavConfig): SidebarNavConfig {
  return {
    groups: cfg.groups.map((group) => ({
      id: group.id,
      visible: group.visible,
      items: group.items.map((item) => ({
        id: item.id,
        visible: item.visible,
      })),
    })),
  };
}

/**
 * Safely parse and reconcile persisted sidebar navigation config JSON against
 * the current known groups and ready workbench tools.
 * - Preserves user-defined group & item order and visibility flags
 * - Appends any newly introduced groups/tools with visible=true
 * - Drops unknown/removed IDs
 */
export function parseSidebarNavConfig(raw?: string | null): SidebarNavConfig {
  const defaults = getDefaultSidebarNavConfig();
  if (!raw || !raw.trim()) return defaults;

  try {
    const parsed = JSON.parse(raw) as Partial<SidebarNavConfig> | null;
    if (!parsed || !Array.isArray(parsed.groups)) return defaults;

    const seenGroups = new Set<SidebarGroupId>();
    const groups: SidebarGroupConfig[] = [];

    for (const rawGroup of parsed.groups) {
      if (!rawGroup || typeof rawGroup !== "object") continue;
      const gid = rawGroup.id as SidebarGroupId;
      if (!VALID_GROUP_IDS.has(gid) || seenGroups.has(gid)) continue;
      seenGroups.add(gid);

      const allowedIds = getDefaultGroupItemIds(gid);
      const allowedSet = new Set(allowedIds);
      const seenItems = new Set<string>();
      const items: SidebarItemConfig[] = [];

      if (Array.isArray(rawGroup.items)) {
        for (const rawItem of rawGroup.items) {
          if (!rawItem || typeof rawItem !== "object") continue;
          const itemId = String(rawItem.id ?? "");
          if (!allowedSet.has(itemId) || seenItems.has(itemId)) continue;
          seenItems.add(itemId);
          items.push({
            id: itemId,
            visible: rawItem.visible !== false,
          });
        }
      }

      // Append any newly introduced items for this group
      for (const defaultItemId of allowedIds) {
        if (!seenItems.has(defaultItemId)) {
          items.push({ id: defaultItemId, visible: true });
        }
      }

      groups.push({
        id: gid,
        visible: rawGroup.visible !== false,
        items,
      });
    }

    // Append any missing default groups
    for (const defGroup of defaults.groups) {
      if (!seenGroups.has(defGroup.id)) {
        groups.push(defGroup);
      }
    }

    return { groups };
  } catch {
    return defaults;
  }
}

export function areSidebarConfigsEqual(
  a: SidebarNavConfig,
  b: SidebarNavConfig
): boolean {
  if (a.groups.length !== b.groups.length) return false;
  for (let i = 0; i < a.groups.length; i++) {
    const ga = a.groups[i];
    const gb = b.groups[i];
    if (ga.id !== gb.id || ga.visible !== gb.visible) return false;
    if (ga.items.length !== gb.items.length) return false;
    for (let j = 0; j < ga.items.length; j++) {
      if (
        ga.items[j].id !== gb.items[j].id ||
        ga.items[j].visible !== gb.items[j].visible
      ) {
        return false;
      }
    }
  }
  return true;
}

export function isDefaultSidebarNavConfig(cfg: SidebarNavConfig): boolean {
  return areSidebarConfigsEqual(cfg, getDefaultSidebarNavConfig());
}

/**
 * Returns "" when equal to factory defaults so persisted settings remain clean.
 */
export function serializeSidebarNavConfig(cfg: SidebarNavConfig): string {
  if (isDefaultSidebarNavConfig(cfg)) return "";
  return JSON.stringify(cfg);
}

export function countVisibleSidebarItems(cfg: SidebarNavConfig): {
  visibleGroups: number;
  totalGroups: number;
  visibleItems: number;
  totalItems: number;
} {
  let visibleGroups = 0;
  let visibleItems = 0;
  let totalItems = 0;
  for (const g of cfg.groups) {
    totalItems += g.items.length;
    if (g.visible) {
      visibleGroups++;
      visibleItems += g.items.filter((it) => it.visible).length;
    }
  }
  return {
    visibleGroups,
    totalGroups: cfg.groups.length,
    visibleItems,
    totalItems,
  };
}
