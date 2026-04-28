/**
 * HIS 适配器层 vendor-neutral DTO
 *
 * 这些类型是医诺浮球业务层与具体 HIS 厂商接口之间的"标准翻译目标"。任何厂商
 * 的 adapter 实现都必须把私有响应映射成下列结构后再返回给上层。
 *
 * 命名约定：
 * - 字段名使用语义化英文（productId / productName / unit / executingDeptId 等），
 *   不再泄漏 PHIS 的 `idMedPro / naMedPro / idDeptExec` 等私有标识；
 * - 凡是上层用不到、但厂商内部下达处方等场景仍需透传的字段，统一塞进 `raw`，
 *   由该厂商的下游模块按需访问，业务通用代码不要再读 `raw`；
 * - 详情类 DTO 中的 `raw` 至少包含本次详情的关键 ID（`productId / storeId` 或
 *   `itemId`），以便后续库存校验等出站调用还能拿到原始 ID。
 *
 * 已抽象（业务层只面向以下类型编程）：
 * - 详情：`MedicineDetail` / `MedicalItemDetail`
 * - 检查部位：`MedicalItemPartOption`
 * - 字典：`DictionaryEntry`
 * - 库存校验：`InventoryCheckRequest` / `InventoryCheckResult`
 * - 目录条目：`DiagnosisCatalogEntry` / `MedicineCatalogEntry` / `MedicalItemCatalogEntry`
 *
 * 仍 PHIS 化（adapter 内部使用，不对外）：
 * - `PharmacyOption`（`idDept` / `idSto`）— 药房列表本身依赖 PHIS 双层标识
 *   （部门 id + 库房 id），新厂商需要时再抽象。
 */

// ============================================================================
// 详情
// ============================================================================

/**
 * 药品详情（按药房维度）
 *
 * 业务层用途：
 * 1. 校验是否真正可发药（`active === false` 时不允许选中）
 * 2. 回填规格 / 默认剂量、频次、用法、剂量单位
 * 3. 提供下达处方时的 `productId / storeId` 等出站标识（在 `raw` 中）
 */
export interface MedicineDetail {
  /** 药品商品级 ID（药房维度的最小可发药单元） */
  productId: string;
  /** 药品商品名（含规格 / 厂家信息的展示名） */
  productName: string;
  /** 药品基础 ID（同一药品在不同药房共享） */
  medicineId?: string;
  /** 药品通用名 */
  medicineName?: string;
  /** 是否处于可用状态：false 表示已停用，不能选中 */
  active: boolean;

  // ---- 规格相关 ----
  /** 销售规格（含包装数量），如 "0.25g*24片/盒" */
  specSale?: string;
  /** 销售单位，如 "盒" / "瓶" */
  unitSale?: string;
  /** 原始规格字符串（厂商若同时有 spec / specSale，此字段为 spec） */
  spec?: string;
  /** 单次给药的最小制剂单位（如 "片" / "粒" / "ml"） */
  doseUnit?: string;
  /** 单一剂量描述（如 "0.25g/片"） */
  dose?: string;

  // ---- 默认值（用于编辑器初始化） ----
  /** HIS 推荐的单次剂量 */
  defaultSingleDose?: string;
  /** HIS 推荐的频次（值映射到频次字典 key） */
  defaultFrequency?: string;
  /** HIS 推荐的给药途径（值映射到用药途径字典 key） */
  defaultRoute?: string;

  // ---- 定位字段 ----
  /** 当前详情归属的药房 storeId */
  storeId?: string;

  // ---- 业务标记 ----
  /** 是否需要皮试 */
  needsSkinTest: boolean;

  /**
   * 厂商透传：保留原始响应里所有字段，供下达处方等出站场景按厂商私有字段使用。
   * 业务通用代码不要直接读这里；只有 PHIS 路径下的处方下达模块可用。
   */
  raw: Record<string, unknown>;
}

/**
 * 检查/检验/处置项详情
 *
 * 业务层用途：拉到当前选中项的执行科室、单位等信息回填到处方/医嘱编辑器。
 */
export interface MedicalItemDetail {
  /** 项目 ID（中央 / 机构维度的项目主键） */
  itemId: string;
  /** 项目名称 */
  itemName: string;
  /** 计价单位（如 "次" / "项"） */
  unit?: string;
  /** 默认执行科室 ID */
  executingDeptId?: string;

  /** 厂商透传 */
  raw: Record<string, unknown>;
}


/**
 * 检查部位 / 方式候选
 *
 * 业务层用途：检查项目匹配后展示可选检查部位；单候选时自动回填到 `idPart`。
 */
export interface MedicalItemPartOption {
  /** 部位方式主键，PHIS 回写时对应 `idPart` */
  partId: string;
  /** 归属检查项目 ID */
  itemId?: string;
  /** 人读展示名，如 “胸部CT” / “无部位” */
  name: string;
  /** 部位 + 方式原始组合文本 */
  partAndWay?: string;
  /** 部位 + 方式编码组合 */
  partAndWayCode?: string;
  /** PACS 类型编码 */
  pacsType?: string;
  /** PACS 类型文本 */
  pacsTypeText?: string;
  /** 部位文本 */
  partText?: string;
  /** 方式文本 */
  wayText?: string;
  /** 默认数量 */
  amount?: number;
  /** 厂商透传 */
  raw: Record<string, unknown>;
}

// ============================================================================
// 字典
// ============================================================================

/**
 * 字典条目（频次 / 用法 / 执行科室等通用形态）
 *
 * 字段语义：
 * - `key`：业务键，下达处方时回填给 HIS 的标识（如 "QD" / "PO" / 科室 id）
 * - `text`：人读文本（"每天一次" / "口服"）
 * - `py / wb / mcode`：拼音首字母 / 五笔 / 助记码（中文搜索辅助，可选）
 * - `properties`：厂商私有附加（如 PHIS 频次的 `execCount` 一日次数）
 */
export interface DictionaryEntry {
  key: string;
  text: string;
  py?: string;
  wb?: string;
  mcode?: string;
  /** 厂商透传：业务方按需读 */
  properties?: Record<string, unknown>;
}

// ============================================================================
// 库存校验
// ============================================================================

/**
 * 库存校验单条请求（中性）
 *
 * `businessType` 业务类型：
 * - `'outpatient'`（门诊处方）
 * - `'inpatient'`（住院医嘱）
 * - `'emergency'`（急诊）
 * 由 adapter 内部映射成厂商私有编码（PHIS：'1' / '2' / '3'）。
 */
export interface InventoryCheckRequest {
  /** 药品商品级 ID（同 MedicineDetail.productId） */
  productId: string;
  /** 药房 storeId */
  storeId: string;
  /** 药品名（用于 HIS 错误提示展示） */
  medicineName: string;
  /** 申请扣减数量（最小销售单位） */
  quantity: number;
  /** 单价（用于 HIS 计算金额阈值），可为 0 */
  unitPrice: number;
  /** 业务类型 */
  businessType: 'outpatient' | 'inpatient' | 'emergency';
}

/**
 * 库存校验结果（中性）
 *
 * 约定：`code === 200` 代表库存充足，其它为不足或失败，`message` 描述原因。
 */
export interface InventoryCheckResult {
  code: number;
  message: string;
}

// ============================================================================
// 目录条目
// ============================================================================

/**
 * 诊断目录条目（中性）
 *
 * 来自标准 ICD 库或 HIS 自定义诊断库，用于本地匹配和推荐诊断展示。
 */
export interface DiagnosisCatalogEntry {
  /** 诊断主键（ICD 编码或厂商私有 ID） */
  id: string;
  /** ICD-10/11 编码 */
  code?: string;
  /** 诊断名称 */
  name: string;
  /** 搜索关键词（拼音首字母或别名等） */
  keywords?: string[] | string;
  /** 厂商透传 */
  raw?: Record<string, unknown>;
}

/**
 * 药品目录条目（中性）
 *
 * 业务层用途：本地匹配 + 推荐用药展示。后续处方下达时 PHIS 私有字段
 * （`idSrv` / `naSrv` / `sdSrv` / `idDeptExec` / `fgCheckOrd` / `fgSkintest`）
 * 通过 `raw` 透传，由 PhisHisAdapter / PHIS 处方下达模块读取。
 */
export interface MedicineCatalogEntry {
  id: string;
  code?: string;
  name: string;
  spec?: string;
  keywords?: string[] | string;
  /** 该药品在哪些发药药房（idSto）目录中出现。为空表示未标注药房，不参与药品匹配 */
  storeIds?: string[];
  /** 厂商透传 */
  raw?: Record<string, unknown>;
}

/**
 * 检查 / 检验 / 处置项目目录条目（中性）
 */
export interface MedicalItemCatalogEntry {
  id: string;
  code?: string;
  name: string;
  /** 项目分类（检查 / 检验 / 处置 等） */
  category?: string;
  keywords?: string[] | string;
  /** 厂商透传 */
  raw?: Record<string, unknown>;
}

