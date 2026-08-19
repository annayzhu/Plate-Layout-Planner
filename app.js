(function startPlateLayoutStudio() {
  "use strict";

  const Core = window.PlateCore;
  if (!Core) throw new Error("PlateCore failed to load.");

  const STORAGE_KEY = "plate-layout-studio:project:v1";
  const LANGUAGE_KEY = "plate-layout-studio:language";
  const I18N = {
    zh: {
      heroTitle: "自由板布局", heroBody: "点选、框选或 Shift 连选孔位，叠加参数维度并批量计算；数据仅保存在本机。",
      selectionHelp: "单击逐孔选择，拖动框选，Shift 单击连续选择。", selectAll: "全选", invert: "反选", deselect: "取消选择", clearWells: "清空所选孔",
      colorBy: "按参数着色", backup: "备份", import: "导入", confirmImport: "确认导入", confirmDelete: "确认删除", print: "打印 / PDF", dimensionsTitle: "参数维度", dimensionsBody: "定义实验标签，再应用到当前选择。",
      newDimension: "新维度名称", newDimensionPlaceholder: "例如：细胞系、药物、批次", type: "类型", add: "＋ 添加", assignTitle: "为所选孔赋值",
      assignBody: "修改输入框会自动勾选该维度，只应用已勾选项。", applySelected: "应用到所选孔", clearChecked: "清除勾选参数",
      calculationTitle: "条件批量计算", calculationBody: "按孔位标签筛选，对数值参数统一运算。", runCalculation: "运行批量计算",
      footerLocal: "所有编辑与计算均在当前浏览器完成。", footerReview: "研究工具 · 请在实验前复核最终板图和参数。",
      localOnly: "仅保存在本机", autosaved: "已自动保存", selectedCount: "已选 {n} 孔", wellsCount: "{n} 孔", emptyWell: "空孔",
      expand: "展开", collapse: "收起", text: "文本", number: "数值", unit: "单位", noColor: "不着色", noFilter: "不筛选", noNumeric: "没有数值维度",
      defaultProject: "未命名孔板", plate: "孔", confirmClear: "再次点击确认 ({n} 孔)", undoDone: "已撤销上一步修改", redoDone: "已恢复修改",
      summarySelect: "选择一个孔位后，这里会展示该孔当前已经设置的全部参数。", currentWell: "当前孔位 {id}", assignedInfo: "已赋值信息",
      selectedWells: "已选择 {n} 个孔", overview: "共同值与差异概览", multipleValues: "多个值", noParameters: "当前孔还没有设置任何参数。", items: "{n} 项",
      editorEmpty: "先在左侧点选或框选圆孔，再为它们批量设置参数。", inputValue: "输入值", overwriteValues: "多个值（输入后覆盖）",
      legendNone: "当前未按参数着色", legendEmpty: "为孔位设置参数后，这里会出现颜色图例",
      note384: "384 孔模式仅在孔内显示孔号；点选任意孔可查看全部已赋值信息。", note96: "孔内显示孔号和 1 条参数摘要；点选孔位可查看全部信息。", noteDefault: "孔内最多显示孔号和 2 条参数摘要；点选孔位可查看全部信息。",
      defaultNames: { sample: "样本", treatment: "处理", dose: "剂量", timepoint: "时间点", replicate: "重复", value: "原始值" },
    },
    en: {
      heroTitle: "Free Plate Layout", heroBody: "Select wells, add parameter dimensions, and run batch calculations. All data stays in this browser.",
      selectionHelp: "Click to select, drag to box-select, or Shift-click for a range.", selectAll: "All", invert: "Invert", deselect: "Deselect", clearWells: "Clear wells",
      colorBy: "Color by parameter", backup: "Backup", import: "Import", confirmImport: "Confirm import", confirmDelete: "Confirm delete", print: "Print / PDF", dimensionsTitle: "Parameters", dimensionsBody: "Define experimental labels and apply them to selected wells.",
      newDimension: "New parameter", newDimensionPlaceholder: "e.g. Cell line, drug, batch", type: "Type", add: "+ Add", assignTitle: "Assign selected wells",
      assignBody: "Editing a value checks it automatically. Only checked parameters are applied.", applySelected: "Apply to wells", clearChecked: "Clear checked",
      calculationTitle: "Batch calculation", calculationBody: "Filter wells by labels and calculate numeric parameters.", runCalculation: "Run calculation",
      footerLocal: "All edits and calculations run in this browser.", footerReview: "Research tool · Review the final plate and parameters before use.",
      localOnly: "Stored locally", autosaved: "Autosaved", selectedCount: "{n} selected", wellsCount: "{n} wells", emptyWell: "Empty well",
      expand: "Expand", collapse: "Collapse", text: "Text", number: "Number", unit: "Unit", noColor: "No color", noFilter: "No filter", noNumeric: "No numeric parameters",
      defaultProject: "Untitled plate", plate: "well", confirmClear: "Click again to clear ({n})", undoDone: "Last edit undone", redoDone: "Edit restored",
      summarySelect: "Select a well to view all parameters currently assigned to it.", currentWell: "Current well {id}", assignedInfo: "Assigned parameters",
      selectedWells: "{n} wells selected", overview: "Shared and mixed values", multipleValues: "Mixed values", noParameters: "This well has no assigned parameters.", items: "{n} items",
      editorEmpty: "Select or box-select wells on the left, then assign parameters in bulk.", inputValue: "Enter value", overwriteValues: "Mixed values (type to overwrite)",
      legendNone: "No color parameter selected", legendEmpty: "Color categories appear here after parameters are assigned.",
      note384: "384-well mode shows well IDs only. Select a well to view all assigned parameters.", note96: "Wells show the ID and one parameter summary. Select a well for full details.", noteDefault: "Wells show the ID and up to two parameter summaries. Select a well for full details.",
      defaultNames: { sample: "Sample", treatment: "Treatment", dose: "Dose", timepoint: "Time point", replicate: "Replicate", value: "Raw value" },
    },
  };
  let language = localStorage.getItem(LANGUAGE_KEY) === "en" ? "en" : "zh";
  function t(key, variables = {}) {
    const value = I18N[language][key] ?? I18N.zh[key] ?? key;
    return typeof value === "string" ? value.replace(/\{(\w+)\}/g, (_, name) => variables[name] ?? "") : value;
  }
  const bilingual = (zh, en) => language === "en" ? en : zh;
  const MAX_HISTORY = 50;
  const DEFAULT_DIMENSIONS = [
    { id: "sample", name: "样本", type: "text" },
    { id: "treatment", name: "处理", type: "text" },
    { id: "dose", name: "剂量", type: "number" },
    { id: "timepoint", name: "时间点", type: "text" },
    { id: "replicate", name: "重复", type: "number" },
    { id: "value", name: "原始值", type: "number" },
  ];
  const PALETTE = [
    ["#dcece8", "#225e59", "#75a9a1"],
    ["#f5dfd3", "#7b4936", "#d28c6b"],
    ["#e5e1f2", "#554a77", "#9589bc"],
    ["#f1e7c9", "#6d5b2e", "#c8ac5f"],
    ["#dce7f2", "#3b5874", "#7ea0bf"],
    ["#eadde6", "#6c4960", "#b985a4"],
    ["#e3ead7", "#51643d", "#91a970"],
    ["#ece2d9", "#655246", "#ad927e"],
  ];

  const elements = Object.fromEntries(
    [
      "projectName", "saveStatus", "undoButton", "redoButton", "selectionCount",
      "selectAllButton", "invertSelectionButton", "clearSelectionButton", "clearWellsButton",
      "colorDimension", "plateCanvas", "plateGrid", "selectionBox", "plateLegend", "wellDisplayNote",
      "dimensionCount", "addDimensionForm", "newDimensionName", "newDimensionType", "dimensionList",
      "selectedWellSummary", "editorSelectionCount", "selectionEditor", "applyParametersButton", "clearParametersButton",
      "calcScope", "calcConditionDimension", "calcConditionValue", "conditionValueSuggestions",
      "calcSource", "calcOperation", "operandMode", "constantOperandWrap", "constantOperand",
      "parameterOperandWrap", "parameterOperand", "calcOutputName", "calcPrecision",
      "runCalculationButton", "calculationResult", "exportCsvButton", "exportSvgButton",
      "exportJsonButton", "importJsonLabel", "importJsonInput", "confirmImportButton", "printButton", "toast",
    ].map((id) => [id, document.getElementById(id)]),
  );

  let project = loadProject();
  let selection = new Set();
  let selectionAnchor = null;
  let undoStack = [];
  let redoStack = [];
  let pointerSession = null;
  let toastTimer = null;
  let clearConfirmationTimer = null;
  let dimensionDeleteTimer = null;
  let pendingDimensionDeleteId = null;
  let importConfirmationTimer = null;
  let pendingImportedProject = null;

  function applyLanguage() {
    const wasAutosaved = elements.saveStatus.textContent === I18N.zh.autosaved || elements.saveStatus.textContent === I18N.en.autosaved;
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    document.title = language === "en" ? "Plate Layout Planner" : "Plate Layout Planner · 孔板布局规划工具";
    document.querySelectorAll("[data-i18n]").forEach((element) => { element.textContent = t(element.dataset.i18n); });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
    document.querySelectorAll(".language-option").forEach((button) => button.classList.toggle("active", button.dataset.language === language));
    document.querySelector(".brand small").textContent = language === "en" ? "Plate planning workspace" : "孔板布局规划工具";
    elements.saveStatus.textContent = t(wasAutosaved ? "autosaved" : "localOnly");
    elements.projectName.placeholder = t("defaultProject");
    elements.confirmImportButton.textContent = t("confirmImport");
    elements.undoButton.title = language === "en" ? "Undo (Ctrl/⌘ Z)" : "撤销（Ctrl/⌘ Z）";
    elements.redoButton.title = language === "en" ? "Redo (Ctrl/⌘ Shift Z)" : "重做（Ctrl/⌘ Shift Z）";
    document.querySelectorAll(".plate-option").forEach((button) => { button.textContent = `${button.dataset.size} ${t("plate")}`; });
    document.querySelectorAll(".collapse-toggle").forEach((toggle) => {
      toggle.dataset.openLabel = t("collapse");
      toggle.dataset.closedLabel = t("expand");
    });
    const staticLabels = language === "en"
      ? ["Scope", "Condition parameter (optional)", "Condition value (exact match)", "Source numeric parameter", "Operation", "Right operand source", "Constant", "Right numeric parameter", "Output parameter name", "Decimal places"]
      : ["作用范围", "条件维度（可选）", "条件值（精确匹配）", "源数值维度", "运算", "右侧值来源", "固定数值", "右侧数值维度", "结果维度名称", "保留小数位"];
    [elements.calcScope, elements.calcConditionDimension, elements.calcConditionValue, elements.calcSource, elements.calcOperation, elements.operandMode, elements.constantOperand, elements.parameterOperand, elements.calcOutputName, elements.calcPrecision]
      .forEach((control, index) => { control.closest("label").querySelector(":scope > span").textContent = staticLabels[index]; });
    elements.calcScope.options[0].textContent = language === "en" ? "Selected wells" : "当前所选孔";
    elements.calcScope.options[1].textContent = language === "en" ? "All wells on this plate" : "当前板全部孔";
    const operationLabels = language === "en" ? ["× Multiply", "÷ Divide", "+ Add", "- Subtract"] : ["× 乘以", "÷ 除以", "＋ 加上", "－ 减去"];
    [...elements.calcOperation.options].forEach((option, index) => { option.textContent = operationLabels[index]; });
    elements.operandMode.options[0].textContent = language === "en" ? "Constant" : "固定数值";
    elements.operandMode.options[1].textContent = language === "en" ? "Another numeric parameter" : "另一个数值维度";
    elements.newDimensionType.options[0].textContent = t("text");
    elements.newDimensionType.options[1].textContent = t("number");
    elements.calcConditionValue.placeholder = language === "en" ? "Leave blank to match empty values; choose No filter for no condition" : "留空时匹配空值；无条件请选择“不筛选”";
    if (["计算结果", "Calculation result"].includes(elements.calcOutputName.value)) elements.calcOutputName.value = language === "en" ? "Calculation result" : "计算结果";
    document.querySelector(".panel-note").textContent = language === "en"
      ? "Example: For wells where Treatment = Drug A, multiply Raw value by Dilution factor and write the result to Corrected value. Only valid numbers are processed."
      : "例：全部“处理 = Drug A”的孔，将“原始值”乘以“稀释倍数”，写入“校正值”。仅处理可解析的数值。";
  }

  function defaultProject() {
    return {
      version: 1,
      name: "未命名孔板",
      plateSize: 24,
      dimensions: DEFAULT_DIMENSIONS.map((dimension) => ({ ...dimension })),
      plates: { 6: {}, 12: {}, 24: {}, 96: {}, 384: {} },
      colorDimension: "treatment",
      calculationLog: [],
      updatedAt: new Date().toISOString(),
    };
  }

  function normalizeProject(raw) {
    if (!raw || typeof raw !== "object") throw new Error("项目文件格式无效。");
    const normalized = defaultProject();
    normalized.name = typeof raw.name === "string" ? raw.name.slice(0, 80) : normalized.name;
    normalized.plateSize = [6, 12, 24, 96, 384].includes(Number(raw.plateSize)) ? Number(raw.plateSize) : 24;

    if (Array.isArray(raw.dimensions)) {
      const seen = new Set();
      normalized.dimensions = raw.dimensions
        .filter((dimension) => dimension && typeof dimension.id === "string" && typeof dimension.name === "string")
        .map((dimension) => ({
          id: dimension.id.slice(0, 80),
          name: dimension.name.trim().slice(0, 30),
          type: dimension.type === "number" ? "number" : "text",
          unit: dimension.type === "number" && typeof dimension.unit === "string" ? dimension.unit.trim().slice(0, 16) : "",
        }))
        .filter((dimension) => dimension.name && !seen.has(dimension.id) && seen.add(dimension.id));
    }

    normalized.plates = { 6: {}, 12: {}, 24: {}, 96: {}, 384: {} };
    for (const size of [6, 12, 24, 96, 384]) {
      const validIds = new Set(Core.makeWellIds(size));
      const source = raw.plates && raw.plates[size];
      if (!source || typeof source !== "object") continue;
      for (const [wellId, well] of Object.entries(source)) {
        if (!validIds.has(wellId) || !well || typeof well.params !== "object" || Array.isArray(well.params)) continue;
        normalized.plates[size][wellId] = { params: { ...well.params } };
      }
    }

    normalized.colorDimension = normalized.dimensions.some((dimension) => dimension.id === raw.colorDimension)
      ? raw.colorDimension
      : (normalized.dimensions[0]?.id || "");
    normalized.calculationLog = Array.isArray(raw.calculationLog) ? raw.calculationLog.slice(-50) : [];
    normalized.updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString();
    return normalized;
  }

  function loadProject() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? normalizeProject(JSON.parse(stored)) : defaultProject();
    } catch (error) {
      console.warn("Could not restore saved project:", error);
      return defaultProject();
    }
  }

  function saveProject() {
    project.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    elements.saveStatus.textContent = t("autosaved");
  }

  function snapshot() {
    return JSON.stringify(project);
  }

  function commit(mutator) {
    undoStack.push(snapshot());
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    mutator();
    saveProject();
    renderAll();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    project = normalizeProject(JSON.parse(undoStack.pop()));
    selection = new Set();
    selectionAnchor = null;
    saveProject();
    renderAll();
    showToast(t("undoDone"));
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    project = normalizeProject(JSON.parse(redoStack.pop()));
    selection = new Set();
    selectionAnchor = null;
    saveProject();
    renderAll();
    showToast(t("redoDone"));
  }

  function currentWells() {
    return project.plates[project.plateSize];
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
    })[character]);
  }

  function escapeXml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
    })[character]);
  }

  function hashString(value) {
    let hash = 0;
    for (const character of String(value)) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    return Math.abs(hash);
  }

  function colorFor(value) {
    return PALETTE[hashString(value) % PALETTE.length];
  }

  function getDisplayEntries(params) {
    return project.dimensions
      .filter((dimension) => params[dimension.id] !== undefined && params[dimension.id] !== "")
      .map((dimension) => [dimension, params[dimension.id]]);
  }

  function dimensionLabel(dimension) {
    const name = DEFAULT_DIMENSIONS.some((item) => item.id === dimension.id) ? t("defaultNames")[dimension.id] : dimension.name;
    return dimension.type === "number" && dimension.unit ? `${name} (${dimension.unit})` : name;
  }

  function displayValue(dimension, value) {
    return dimension.type === "number" && dimension.unit && value !== "" && value !== undefined
      ? `${value} ${dimension.unit}`
      : value;
  }

  function renderPlate() {
    const spec = Core.getSpec(project.plateSize);
    const wells = currentWells();
    const colorDimension = project.colorDimension;
    elements.plateGrid.dataset.size = String(project.plateSize);
    elements.plateGrid.style.setProperty("--plate-columns", String(spec.columns));
    elements.wellDisplayNote.textContent = t(project.plateSize === 384 ? "note384" : project.plateSize === 96 ? "note96" : "noteDefault");

    const html = ['<span class="axis-label" aria-hidden="true"></span>'];
    for (let column = 1; column <= spec.columns; column += 1) {
      html.push(`<span class="axis-label">${column}</span>`);
    }
    for (const row of spec.rows) {
      html.push(`<span class="axis-label">${row}</span>`);
      for (let column = 1; column <= spec.columns; column += 1) {
        const wellId = `${row}${column}`;
        const params = wells[wellId]?.params || {};
        const entries = getDisplayEntries(params);
        const colorValue = colorDimension ? params[colorDimension] : undefined;
        const colors = colorValue !== undefined && colorValue !== "" ? colorFor(colorValue) : ["#f8f5f0", "#4f5550", "#c9c3bb"];
        const ordered = colorDimension
          ? [...entries.filter(([dimension]) => dimension.id === colorDimension), ...entries.filter(([dimension]) => dimension.id !== colorDimension)]
          : entries;
        const primary = ordered[0] ? displayValue(ordered[0][0], ordered[0][1]) : "";
        const secondary = ordered[1] ? displayValue(ordered[1][0], ordered[1][1]) : "";
        const details = entries.length
          ? entries.map(([dimension, value]) => `${dimensionLabel(dimension)}: ${displayValue(dimension, value)}`).join("；")
          : t("emptyWell");
        const classNames = ["well", entries.length ? "has-data" : "", selection.has(wellId) ? "selected" : ""].filter(Boolean).join(" ");
        html.push(
          `<button type="button" class="${classNames}" data-well="${wellId}" aria-pressed="${selection.has(wellId)}" aria-label="${escapeHtml(`${wellId}，${details}`)}" title="${escapeHtml(`${wellId}｜${details}`)}" style="--well-bg:${colors[0]};--well-ink:${colors[1]};--well-border:${colors[2]}">` +
            `<span><span class="well-id">${wellId}</span>` +
            (primary !== "" ? `<span class="well-primary">${escapeHtml(primary)}</span>` : "") +
            (secondary !== "" ? `<span class="well-secondary">${escapeHtml(secondary)}</span>` : "") +
            `</span></button>`,
        );
      }
    }
    elements.plateGrid.innerHTML = html.join("");
    renderLegend();
  }

  function renderLegend() {
    if (!project.colorDimension) {
      elements.plateLegend.innerHTML = `<span class="legend-empty">${t("legendNone")}</span>`;
      return;
    }
    const values = [...new Set(
      Object.values(currentWells())
        .map((well) => well.params?.[project.colorDimension])
        .filter((value) => value !== undefined && value !== "")
        .map(String),
    )];
    if (!values.length) {
      elements.plateLegend.innerHTML = `<span class="legend-empty">${t("legendEmpty")}</span>`;
      return;
    }
    const colorDimension = project.dimensions.find((dimension) => dimension.id === project.colorDimension);
    elements.plateLegend.innerHTML = values
      .map((value) => `<span class="legend-item"><i class="legend-swatch" style="--swatch:${colorFor(value)[2]}"></i>${escapeHtml(colorDimension ? displayValue(colorDimension, value) : value)}</span>`)
      .join("");
  }

  function renderDimensions() {
    elements.dimensionCount.textContent = String(project.dimensions.length);
    elements.dimensionList.innerHTML = project.dimensions.length
      ? project.dimensions.map((dimension) => (
        `<div class="dimension-row" data-dimension="${escapeHtml(dimension.id)}">` +
          `<input class="dimension-name-input" type="text" value="${escapeHtml(dimension.name)}" maxlength="30" aria-label="维度名称" />` +
          `<select class="dimension-type-select" aria-label="${t("type")}"><option value="text"${dimension.type === "text" ? " selected" : ""}>${t("text")}</option><option value="number"${dimension.type === "number" ? " selected" : ""}>${t("number")}</option></select>` +
          `<input class="dimension-unit-input" type="text" value="${escapeHtml(dimension.unit || "")}" placeholder="${t("unit")}" maxlength="16" aria-label="${escapeHtml(dimension.name)} ${t("unit")}"${dimension.type === "number" ? "" : " hidden"} />` +
          `<button class="dimension-delete" type="button" title="删除该维度" aria-label="删除 ${escapeHtml(dimension.name)}">×</button>` +
        `</div>`
      )).join("")
      : `<div class="editor-empty">${language === "en" ? "No parameters yet. Add one above." : "还没有参数维度。先在上方添加一个。"}</div>`;
  }

  function renderSelectionEditor() {
    renderSelectedWellSummary();
    elements.editorSelectionCount.textContent = t("wellsCount", { n: selection.size });
    if (!selection.size) {
      elements.selectionEditor.innerHTML = `<div class="editor-empty">${t("editorEmpty")}</div>`;
      elements.applyParametersButton.disabled = true;
      elements.clearParametersButton.disabled = true;
      return;
    }
    elements.applyParametersButton.disabled = !project.dimensions.length;
    elements.clearParametersButton.disabled = !project.dimensions.length;
    const wells = currentWells();
    elements.selectionEditor.innerHTML = project.dimensions.map((dimension) => {
      const values = [...selection].map((wellId) => wells[wellId]?.params?.[dimension.id]);
      const first = values[0];
      const uniform = values.every((value) => value === first);
      const value = uniform && first !== undefined ? first : "";
      const placeholder = uniform ? t("inputValue") : t("overwriteValues");
      return (
        `<label class="parameter-input-row">` +
          `<input class="parameter-apply-checkbox" type="checkbox" aria-label="应用 ${escapeHtml(dimensionLabel(dimension))}" />` +
          `<span class="parameter-name" title="${escapeHtml(dimensionLabel(dimension))}">${escapeHtml(dimensionLabel(dimension))}</span>` +
          `<input class="parameter-value" data-dimension="${escapeHtml(dimension.id)}" type="${dimension.type === "number" ? "number" : "text"}" step="${dimension.type === "number" ? "any" : ""}" value="${escapeHtml(value)}" placeholder="${placeholder}" />` +
        `</label>`
      );
    }).join("");
  }

  function renderSelectedWellSummary() {
    if (!selection.size) {
      elements.selectedWellSummary.innerHTML = `<div class="well-summary-empty">${t("summarySelect")}</div>`;
      return;
    }

    const wells = currentWells();
    const selectedIds = [...selection];
    const singleWellId = selectedIds.length === 1 ? selectedIds[0] : null;
    let entries;
    let heading;
    let subheading;
    let summaryId;

    if (singleWellId) {
      entries = getDisplayEntries(wells[singleWellId]?.params || {}).map(([dimension, value]) => ({
        label: dimensionLabel(dimension),
        value: displayValue(dimension, value),
        mixed: false,
      }));
      heading = t("currentWell", { id: singleWellId });
      subheading = t("assignedInfo");
      summaryId = singleWellId;
    } else {
      entries = project.dimensions.flatMap((dimension) => {
        const values = selectedIds.map((wellId) => wells[wellId]?.params?.[dimension.id]);
        if (!values.some((value) => value !== undefined && value !== "")) return [];
        const uniform = values.every((value) => value === values[0]);
        return [{
          label: dimensionLabel(dimension),
          value: uniform ? displayValue(dimension, values[0]) : t("multipleValues"),
          mixed: !uniform,
        }];
      });
      heading = t("selectedWells", { n: selectedIds.length });
      subheading = t("overview");
      summaryId = String(selectedIds.length);
    }

    const parameterMarkup = entries.length
      ? `<div class="summary-parameter-grid">${entries.map((entry) => (
          `<div class="summary-parameter" title="${escapeHtml(`${entry.label}: ${entry.value}`)}">` +
            `<span class="summary-label">${escapeHtml(entry.label)}</span>` +
            `<span class="summary-value${entry.mixed ? " mixed" : ""}">${escapeHtml(entry.value)}</span>` +
          `</div>`
        )).join("")}</div>`
      : `<div class="summary-body-empty">${t("noParameters")}</div>`;

    elements.selectedWellSummary.innerHTML =
      `<div class="well-summary-shell">` +
        `<div class="well-summary-head">` +
          `<span class="well-summary-id">${escapeHtml(summaryId)}</span>` +
          `<span class="well-summary-title"><strong>${escapeHtml(heading)}</strong><small>${escapeHtml(subheading)}</small></span>` +
          `<span class="well-summary-state">${t("items", { n: entries.length })}</span>` +
        `</div>` +
        parameterMarkup +
      `</div>`;
  }

  function optionMarkup(options, selectedValue, emptyLabel) {
    const items = emptyLabel !== undefined ? [{ value: "", label: emptyLabel }, ...options] : options;
    return items.map((option) => `<option value="${escapeHtml(option.value)}"${String(option.value) === String(selectedValue) ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  }

  function renderSelectOptions() {
    const prior = {
      color: elements.colorDimension.value,
      condition: elements.calcConditionDimension.value,
      source: elements.calcSource.value,
      operand: elements.parameterOperand.value,
    };
    const all = project.dimensions.map((dimension) => ({ value: dimension.id, label: `${dimensionLabel(dimension)} · ${dimension.type === "number" ? t("number") : t("text")}` }));
    const numeric = project.dimensions.filter((dimension) => dimension.type === "number").map((dimension) => ({ value: dimension.id, label: dimensionLabel(dimension) }));
    elements.colorDimension.innerHTML = optionMarkup(all, project.colorDimension || prior.color, t("noColor"));
    elements.calcConditionDimension.innerHTML = optionMarkup(all, prior.condition, t("noFilter"));
    elements.calcSource.innerHTML = optionMarkup(numeric, prior.source, numeric.length ? undefined : t("noNumeric"));
    elements.parameterOperand.innerHTML = optionMarkup(numeric, prior.operand, numeric.length ? undefined : t("noNumeric"));
    elements.runCalculationButton.disabled = !numeric.length;
    updateConditionSuggestions();
  }

  function updateConditionSuggestions() {
    const dimensionId = elements.calcConditionDimension.value;
    const values = dimensionId
      ? [...new Set(Object.values(currentWells()).map((well) => well.params?.[dimensionId]).filter((value) => value !== undefined && value !== "").map(String))]
      : [];
    elements.conditionValueSuggestions.innerHTML = values.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  }

  function updateSelectionVisuals(refreshEditor = true) {
    resetClearConfirmation();
    elements.plateGrid.querySelectorAll(".well").forEach((well) => {
      const selected = selection.has(well.dataset.well);
      well.classList.toggle("selected", selected);
      well.setAttribute("aria-pressed", String(selected));
    });
    elements.selectionCount.textContent = t("selectedCount", { n: selection.size });
    elements.editorSelectionCount.textContent = t("wellsCount", { n: selection.size });
    elements.clearSelectionButton.disabled = !selection.size;
    elements.clearWellsButton.disabled = !selection.size;
    if (refreshEditor) renderSelectionEditor();
  }

  function resetClearConfirmation() {
    window.clearTimeout(clearConfirmationTimer);
    clearConfirmationTimer = null;
    elements.clearWellsButton.classList.remove("confirming");
    elements.clearWellsButton.textContent = t("clearWells");
    elements.clearWellsButton.removeAttribute("aria-live");
  }

  function renderAll() {
    applyLanguage();
    elements.projectName.value = project.name;
    document.querySelectorAll(".plate-option").forEach((button) => button.classList.toggle("active", Number(button.dataset.size) === project.plateSize));
    renderPlate();
    renderDimensions();
    renderSelectionEditor();
    renderSelectOptions();
    updateSelectionVisuals(false);
    elements.undoButton.disabled = !undoStack.length;
    elements.redoButton.disabled = !redoStack.length;
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 2400);
  }

  function cleanWellMap(wellMap, wellId) {
    const params = wellMap[wellId]?.params || {};
    const hasValue = Object.values(params).some((value) => value !== undefined && value !== "");
    if (!hasValue) delete wellMap[wellId];
  }

  document.querySelectorAll(".plate-option").forEach((button) => {
    button.addEventListener("click", () => {
      const nextSize = Number(button.dataset.size);
      if (nextSize === project.plateSize) return;
      commit(() => { project.plateSize = nextSize; });
      selection = new Set();
      selectionAnchor = null;
      renderAll();
    });
  });

  elements.projectName.addEventListener("input", () => {
    project.name = elements.projectName.value.slice(0, 80);
    saveProject();
  });
  elements.projectName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") elements.projectName.blur();
  });
  elements.projectName.addEventListener("blur", () => {
    const normalizedName = elements.projectName.value.trim() || t("defaultProject");
    project.name = normalizedName;
    elements.projectName.value = normalizedName;
    saveProject();
  });

  elements.colorDimension.addEventListener("change", () => {
    commit(() => { project.colorDimension = elements.colorDimension.value; });
  });

  elements.selectAllButton.addEventListener("click", () => {
    selection = new Set(Core.makeWellIds(project.plateSize));
    selectionAnchor = Core.makeWellIds(project.plateSize)[0];
    updateSelectionVisuals();
  });

  elements.invertSelectionButton.addEventListener("click", () => {
    selection = new Set(Core.makeWellIds(project.plateSize).filter((wellId) => !selection.has(wellId)));
    selectionAnchor = [...selection][0] || null;
    updateSelectionVisuals();
  });

  elements.clearSelectionButton.addEventListener("click", () => {
    selection = new Set();
    selectionAnchor = null;
    updateSelectionVisuals();
  });

  elements.clearWellsButton.addEventListener("click", () => {
    if (!selection.size) return;
    const occupied = [...selection].filter((wellId) => currentWells()[wellId]).length;
    if (occupied && !elements.clearWellsButton.classList.contains("confirming")) {
      elements.clearWellsButton.classList.add("confirming");
      elements.clearWellsButton.textContent = t("confirmClear", { n: occupied });
      elements.clearWellsButton.setAttribute("aria-live", "polite");
      clearConfirmationTimer = window.setTimeout(resetClearConfirmation, 4000);
      return;
    }
    resetClearConfirmation();
    commit(() => {
      for (const wellId of selection) delete currentWells()[wellId];
    });
    showToast(bilingual(`已清空 ${selection.size} 个所选孔`, `Cleared ${selection.size} selected wells`));
  });

  document.addEventListener("pointerdown", (event) => {
    if (clearConfirmationTimer && !event.target.closest("#clearWellsButton")) resetClearConfirmation();
    if (dimensionDeleteTimer && !event.target.closest(".dimension-delete")) resetDimensionDeleteConfirmation();
    if (importConfirmationTimer && !event.target.closest("#confirmImportButton")) resetImportConfirmation();
  });

  elements.plateCanvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const well = event.target.closest(".well");
    pointerSession = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWell: well?.dataset.well || null,
      additive: event.ctrlKey || event.metaKey,
      shiftKey: event.shiftKey,
      original: new Set(selection),
      dragging: false,
    };
    elements.plateCanvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  elements.plateCanvas.addEventListener("pointermove", (event) => {
    if (!pointerSession || event.pointerId !== pointerSession.pointerId) return;
    const distance = Math.hypot(event.clientX - pointerSession.startX, event.clientY - pointerSession.startY);
    if (distance < 5 && !pointerSession.dragging) return;
    pointerSession.dragging = true;
    const canvasRect = elements.plateCanvas.getBoundingClientRect();
    const minX = Math.min(pointerSession.startX, event.clientX);
    const maxX = Math.max(pointerSession.startX, event.clientX);
    const minY = Math.min(pointerSession.startY, event.clientY);
    const maxY = Math.max(pointerSession.startY, event.clientY);
    Object.assign(elements.selectionBox.style, {
      left: `${minX - canvasRect.left}px`,
      top: `${minY - canvasRect.top}px`,
      width: `${maxX - minX}px`,
      height: `${maxY - minY}px`,
    });
    elements.selectionBox.hidden = false;
    const next = pointerSession.additive ? new Set(pointerSession.original) : new Set();
    elements.plateGrid.querySelectorAll(".well").forEach((well) => {
      const rect = well.getBoundingClientRect();
      const intersects = rect.right >= minX && rect.left <= maxX && rect.bottom >= minY && rect.top <= maxY;
      if (intersects) next.add(well.dataset.well);
    });
    selection = next;
    updateSelectionVisuals(false);
  });

  function finishPointer(event) {
    if (!pointerSession || event.pointerId !== pointerSession.pointerId) return;
    const session = pointerSession;
    pointerSession = null;
    elements.selectionBox.hidden = true;
    if (!session.dragging && session.startWell) {
      if (session.shiftKey && selectionAnchor) {
        const range = Core.rangeSelection(project.plateSize, selectionAnchor, session.startWell);
        selection = session.additive ? new Set([...session.original, ...range]) : new Set(range);
      } else {
        selection = new Set(session.original);
        if (selection.has(session.startWell)) selection.delete(session.startWell);
        else selection.add(session.startWell);
        selectionAnchor = session.startWell;
      }
      const button = elements.plateGrid.querySelector(`[data-well="${session.startWell}"]`);
      button?.focus({ preventScroll: true });
    } else if (session.dragging) {
      selectionAnchor = [...selection].at(-1) || selectionAnchor;
    }
    updateSelectionVisuals();
  }

  elements.plateCanvas.addEventListener("pointerup", finishPointer);
  elements.plateCanvas.addEventListener("pointercancel", finishPointer);

  elements.addDimensionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = elements.newDimensionName.value.trim();
    if (!name) return;
    if (project.dimensions.some((dimension) => dimension.name.toLowerCase() === name.toLowerCase())) {
      showToast(bilingual("这个维度名称已经存在", "This parameter name already exists"));
      return;
    }
    const id = `dimension_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    commit(() => {
      project.dimensions.push({ id, name, type: elements.newDimensionType.value === "number" ? "number" : "text", unit: "" });
      if (!project.colorDimension) project.colorDimension = id;
    });
    elements.newDimensionName.value = "";
    elements.newDimensionName.focus();
    showToast(bilingual(`已添加维度“${name}”`, `Added parameter “${name}”`));
  });

  elements.dimensionList.addEventListener("change", (event) => {
    const row = event.target.closest(".dimension-row");
    if (!row) return;
    const dimension = project.dimensions.find((item) => item.id === row.dataset.dimension);
    if (!dimension) return;
    if (event.target.classList.contains("dimension-name-input")) {
      const nextName = event.target.value.trim();
      if (!nextName || project.dimensions.some((item) => item.id !== dimension.id && item.name.toLowerCase() === nextName.toLowerCase())) {
        showToast(bilingual("维度名称不能为空或重复", "Parameter names cannot be empty or duplicated"));
        renderDimensions();
        return;
      }
      commit(() => { dimension.name = nextName; });
    }
    if (event.target.classList.contains("dimension-type-select")) {
      commit(() => {
        dimension.type = event.target.value === "number" ? "number" : "text";
        if (dimension.type === "text") dimension.unit = "";
      });
    }
    if (event.target.classList.contains("dimension-unit-input")) {
      commit(() => { dimension.unit = event.target.value.trim().slice(0, 16); });
    }
  });

  function resetDimensionDeleteConfirmation() {
    window.clearTimeout(dimensionDeleteTimer);
    dimensionDeleteTimer = null;
    pendingDimensionDeleteId = null;
    elements.dimensionList.querySelectorAll(".dimension-row.pending-delete").forEach((row) => row.classList.remove("pending-delete"));
    elements.dimensionList.querySelectorAll(".dimension-delete").forEach((button) => { button.textContent = "×"; });
  }

  elements.dimensionList.addEventListener("click", (event) => {
    const button = event.target.closest(".dimension-delete");
    if (!button) return;
    const row = button.closest(".dimension-row");
    const dimension = project.dimensions.find((item) => item.id === row.dataset.dimension);
    if (!dimension) return;
    if (pendingDimensionDeleteId !== dimension.id) {
      resetDimensionDeleteConfirmation();
      pendingDimensionDeleteId = dimension.id;
      row.classList.add("pending-delete");
      button.textContent = t("confirmDelete");
      dimensionDeleteTimer = window.setTimeout(resetDimensionDeleteConfirmation, 5000);
      return;
    }
    resetDimensionDeleteConfirmation();
    commit(() => {
      project.dimensions = project.dimensions.filter((item) => item.id !== dimension.id);
      for (const size of [6, 12, 24, 96, 384]) {
        for (const [wellId, well] of Object.entries(project.plates[size])) {
          delete well.params[dimension.id];
          cleanWellMap(project.plates[size], wellId);
        }
      }
      if (project.colorDimension === dimension.id) project.colorDimension = project.dimensions[0]?.id || "";
    });
    showToast(bilingual(`已删除维度“${dimension.name}”`, `Deleted parameter “${dimension.name}”`));
  });

  elements.selectionEditor.addEventListener("input", (event) => {
    if (!event.target.classList.contains("parameter-value")) return;
    event.target.closest(".parameter-input-row").querySelector(".parameter-apply-checkbox").checked = true;
  });

  function checkedParameterRows() {
    return [...elements.selectionEditor.querySelectorAll(".parameter-input-row")]
      .filter((row) => row.querySelector(".parameter-apply-checkbox").checked);
  }

  elements.applyParametersButton.addEventListener("click", () => {
    if (!selection.size) return;
    const rows = checkedParameterRows();
    if (!rows.length) {
      showToast(bilingual("请先修改并勾选至少一个参数", "Edit and check at least one parameter first"));
      return;
    }
    const changes = [];
    for (const row of rows) {
      const input = row.querySelector(".parameter-value");
      const dimension = project.dimensions.find((item) => item.id === input.dataset.dimension);
      if (!dimension) continue;
      if (dimension.type === "number" && input.value !== "" && !Number.isFinite(Number(input.value))) {
        showToast(bilingual(`“${dimension.name}”不是有效数值`, `“${dimension.name}” is not a valid number`));
        return;
      }
      changes.push({ id: dimension.id, value: dimension.type === "number" && input.value !== "" ? Number(input.value) : input.value });
    }
    commit(() => {
      const wells = currentWells();
      for (const wellId of selection) {
        const params = { ...(wells[wellId]?.params || {}) };
        for (const change of changes) {
          if (change.value === "") delete params[change.id];
          else params[change.id] = change.value;
        }
        wells[wellId] = { params };
        cleanWellMap(wells, wellId);
      }
    });
    showToast(bilingual(`已更新 ${selection.size} 个孔的 ${changes.length} 个参数`, `Updated ${changes.length} parameters across ${selection.size} wells`));
  });

  elements.clearParametersButton.addEventListener("click", () => {
    if (!selection.size) return;
    const rows = checkedParameterRows();
    if (!rows.length) {
      showToast(bilingual("请先勾选要清除的参数维度", "Check the parameters to clear first"));
      return;
    }
    const ids = rows.map((row) => row.querySelector(".parameter-value").dataset.dimension);
    commit(() => {
      const wells = currentWells();
      for (const wellId of selection) {
        if (!wells[wellId]) continue;
        for (const id of ids) delete wells[wellId].params[id];
        cleanWellMap(wells, wellId);
      }
    });
    showToast(bilingual(`已从 ${selection.size} 个孔清除 ${ids.length} 个参数`, `Cleared ${ids.length} parameters from ${selection.size} wells`));
  });

  elements.operandMode.addEventListener("change", () => {
    const parameterMode = elements.operandMode.value === "parameter";
    elements.constantOperandWrap.hidden = parameterMode;
    elements.parameterOperandWrap.hidden = !parameterMode;
  });
  elements.calcConditionDimension.addEventListener("change", updateConditionSuggestions);

  elements.runCalculationButton.addEventListener("click", () => {
    const targetIds = elements.calcScope.value === "selected" ? [...selection] : Core.makeWellIds(project.plateSize);
    if (!targetIds.length) {
      showToast(bilingual("当前没有选中的孔", "No wells are selected"));
      return;
    }
    const sourceId = elements.calcSource.value;
    if (!sourceId) {
      showToast(bilingual("请先添加并选择数值维度", "Add and select a numeric parameter first"));
      return;
    }
    if (elements.operandMode.value === "constant" && Core.asFiniteNumber(elements.constantOperand.value) === null) {
      showToast(bilingual("请输入有效的固定数值", "Enter a valid constant"));
      return;
    }
    const outputName = elements.calcOutputName.value.trim();
    if (!outputName) {
      showToast(bilingual("请输入结果维度名称", "Enter an output parameter name"));
      return;
    }
    const existingOutput = project.dimensions.find((dimension) => dimension.name.toLowerCase() === outputName.toLowerCase());
    if (existingOutput && existingOutput.type !== "number") {
      showToast(bilingual("同名结果维度不是数值类型，请更换名称或修改其类型", "The matching output parameter is not numeric. Rename it or change its type."));
      return;
    }
    const outputId = existingOutput?.id || `dimension_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const conditionId = elements.calcConditionDimension.value;
    const result = Core.calculateWells({
      wellMap: currentWells(),
      wellIds: targetIds,
      conditionId,
      conditionValue: elements.calcConditionValue.value,
      sourceId,
      operation: elements.calcOperation.value,
      operandMode: elements.operandMode.value,
      operandValue: elements.constantOperand.value,
      operandId: elements.parameterOperand.value,
      outputId,
      precision: elements.calcPrecision.value,
    });
    if (!result.updated) {
      elements.calculationResult.className = "calculation-result warning";
      elements.calculationResult.textContent = bilingual(`没有可计算的孔。跳过 ${result.skipped} 孔；请检查筛选值、源数值和右侧数值。`, `No wells could be calculated. ${result.skipped} skipped. Check the filter, source values, and right operand.`);
      return;
    }
    commit(() => {
      if (!existingOutput) project.dimensions.push({ id: outputId, name: outputName, type: "number", unit: "" });
      project.plates[project.plateSize] = result.nextWells;
      project.calculationLog.push({
        at: new Date().toISOString(), plateSize: project.plateSize, outputName,
        updated: result.updated, skipped: result.skipped,
      });
      project.calculationLog = project.calculationLog.slice(-50);
    });
    elements.calculationResult.className = "calculation-result success";
    elements.calculationResult.textContent = bilingual(`完成：${result.updated} 孔已写入“${outputName}”，${result.skipped} 孔因缺失、非数值或除零被跳过。`, `Done: wrote “${outputName}” to ${result.updated} wells; ${result.skipped} skipped for missing or invalid values, or division by zero.`);
    showToast(bilingual(`批量计算完成：更新 ${result.updated} 孔`, `Calculation complete: ${result.updated} wells updated`));
  });

  function downloadBlob(content, mimeType, fileName) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  elements.exportCsvButton.addEventListener("click", () => {
    const headers = ["PlateSize", "Well", "Row", "Column", ...project.dimensions.map(dimensionLabel)];
    const rows = [headers];
    for (const wellId of Core.makeWellIds(project.plateSize)) {
      const parsed = Core.parseWell(project.plateSize, wellId);
      const params = currentWells()[wellId]?.params || {};
      rows.push([project.plateSize, wellId, Core.getSpec(project.plateSize).rows[parsed.row], parsed.column + 1, ...project.dimensions.map((dimension) => params[dimension.id] ?? "")]);
    }
    const csv = `\uFEFF${rows.map((row) => row.map(Core.csvEscape).join(",")).join("\r\n")}`;
    downloadBlob(csv, "text/csv;charset=utf-8", `${Core.safeFileName(project.name)}_${project.plateSize}well.csv`);
    showToast(bilingual("CSV 已导出", "CSV exported"));
  });

  function buildSvg() {
    const spec = Core.getSpec(project.plateSize);
    const geometry = {
      6: { step: 120, radius: 45 },
      12: { step: 105, radius: 40 },
      24: { step: 94, radius: 35 },
      96: { step: 76, radius: 27 },
      384: { step: 38, radius: 13 },
    }[project.plateSize];
    const { step, radius } = geometry;
    const marginX = 78;
    const marginY = 104;
    const width = marginX * 2 + (spec.columns - 1) * step + radius * 2;
    const height = marginY + 58 + (spec.rows.length - 1) * step + radius * 2;
    const circles = [];
    for (let rowIndex = 0; rowIndex < spec.rows.length; rowIndex += 1) {
      circles.push(`<text x="35" y="${marginY + rowIndex * step + 5}" class="axis">${spec.rows[rowIndex]}</text>`);
      for (let column = 1; column <= spec.columns; column += 1) {
        if (rowIndex === 0) circles.push(`<text x="${marginX + (column - 1) * step}" y="61" class="axis">${column}</text>`);
        const wellId = `${spec.rows[rowIndex]}${column}`;
        const params = currentWells()[wellId]?.params || {};
        const entries = getDisplayEntries(params);
        const colorValue = project.colorDimension ? params[project.colorDimension] : undefined;
        const colors = colorValue !== undefined && colorValue !== "" ? colorFor(colorValue) : ["#f8f5f0", "#4f5550", "#c9c3bb"];
        const label = colorValue !== undefined && colorValue !== "" ? colorValue : entries[0]?.[1] ?? "";
        const x = marginX + (column - 1) * step;
        const y = marginY + rowIndex * step;
        circles.push(`<circle cx="${x}" cy="${y}" r="${radius}" fill="${colors[0]}" stroke="${colors[2]}" stroke-width="2"/>`);
        circles.push(`<text x="${x}" y="${y - (label !== "" ? 4 : -4)}" class="well-id">${wellId}</text>`);
        if (label !== "") circles.push(`<text x="${x}" y="${y + 13}" class="well-label">${escapeXml(String(label).slice(0, 12))}</text>`);
      }
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>.title{font:700 20px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#202824}.subtitle{font:11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#827f78}.axis{font:700 11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#827f78;text-anchor:middle}.well-id{font:800 10px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#26302c;text-anchor:middle}.well-label{font:700 8px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#56615b;text-anchor:middle}</style>
  <rect width="100%" height="100%" rx="26" fill="#fffdf9"/>
  <text x="28" y="30" class="title">${escapeXml(project.name || (language === "en" ? "Plate layout" : "孔板布局"))}</text>
  <text x="28" y="48" class="subtitle">${project.plateSize}-well plate · ${escapeXml(project.dimensions.find((dimension) => dimension.id === project.colorDimension)?.name || (language === "en" ? "No color" : "未着色"))}</text>
  ${circles.join("\n  ")}
</svg>`;
  }

  elements.exportSvgButton.addEventListener("click", () => {
    downloadBlob(buildSvg(), "image/svg+xml;charset=utf-8", `${Core.safeFileName(project.name)}_${project.plateSize}well.svg`);
    showToast(bilingual("矢量孔板图已导出", "Vector plate exported"));
  });

  elements.exportJsonButton.addEventListener("click", () => {
    downloadBlob(JSON.stringify(project, null, 2), "application/json;charset=utf-8", `${Core.safeFileName(project.name)}_backup.json`);
    showToast(bilingual("项目备份已导出", "Project backup exported"));
  });

  elements.importJsonInput.addEventListener("change", async () => {
    const file = elements.importJsonInput.files?.[0];
    if (!file) return;
    try {
      pendingImportedProject = normalizeProject(JSON.parse(await file.text()));
      elements.importJsonLabel.hidden = true;
      elements.confirmImportButton.hidden = false;
      window.clearTimeout(importConfirmationTimer);
      importConfirmationTimer = window.setTimeout(resetImportConfirmation, 6000);
    } catch (error) {
      console.error(error);
      showToast(bilingual(`导入失败：${error.message}`, `Import failed: ${error.message}`));
    }
  });

  function resetImportConfirmation() {
    window.clearTimeout(importConfirmationTimer);
    importConfirmationTimer = null;
    pendingImportedProject = null;
    elements.importJsonInput.value = "";
    elements.importJsonLabel.hidden = false;
    elements.confirmImportButton.hidden = true;
  }

  elements.confirmImportButton.addEventListener("click", () => {
    if (!pendingImportedProject) return;
    undoStack.push(snapshot());
    redoStack = [];
    project = pendingImportedProject;
    selection = new Set();
    selectionAnchor = null;
    resetImportConfirmation();
    saveProject();
    renderAll();
    showToast(bilingual("项目已恢复", "Project restored"));
  });

  elements.printButton.addEventListener("click", () => window.print());
  elements.undoButton.addEventListener("click", undo);
  elements.redoButton.addEventListener("click", redo);
  document.querySelectorAll(".language-option").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.language === language) return;
      language = button.dataset.language === "en" ? "en" : "zh";
      localStorage.setItem(LANGUAGE_KEY, language);
      elements.calculationResult.textContent = "";
      elements.calculationResult.className = "calculation-result";
      renderAll();
    });
  });

  document.addEventListener("keydown", (event) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    }
    if (event.key === "Escape" && selection.size) {
      selection = new Set();
      selectionAnchor = null;
      updateSelectionVisuals();
    }
  });

  renderAll();
})();
