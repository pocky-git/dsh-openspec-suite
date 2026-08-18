window.__ModuleLoader__.load({
	id: "dsh-openspec-suite",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		(function (require, module, exports) {
			"use strict";
			var __create = Object.create;
			var __defProp = Object.defineProperty;
			var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
			var __getOwnPropNames = Object.getOwnPropertyNames;
			var __getProtoOf = Object.getPrototypeOf;
			var __hasOwnProp = Object.prototype.hasOwnProperty;
			var __export = (target, all) => {
			  for (var name2 in all)
			    __defProp(target, name2, { get: all[name2], enumerable: true });
			};
			var __copyProps = (to, from, except, desc) => {
			  if (from && typeof from === "object" || typeof from === "function") {
			    for (let key of __getOwnPropNames(from))
			      if (!__hasOwnProp.call(to, key) && key !== except)
			        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
			  }
			  return to;
			};
			var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
			  // If the importer is in node compatibility mode or this is not an ESM
			  // file that has been converted to a CommonJS file using a Babel-
			  // compatible transform (i.e. "__esModule" has not been set), then set
			  // "default" to the CommonJS "module.exports" for node compatibility.
			  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
			  mod
			));
			var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
			
			// src/client.tsx
			var client_exports = {};
			__export(client_exports, {
			  apply: () => apply,
			  inject: () => inject,
			  name: () => name
			});
			module.exports = __toCommonJS(client_exports);
			var React = __toESM(require("react"), 1);
			var ReactDOMClient = __toESM(require("react-dom/client"), 1);
			var import_jsx_runtime = require("react/jsx-runtime");
			var name = "dsh-openspec-suite/client";
			var inject = ["betterSidebar"];
			var pluginContext;
			function openInBetterSidebar(path, title) {
			  const service = pluginContext?.betterSidebar;
			  if (service === void 0 || typeof service.openFile !== "function") return false;
			  try {
			    const sessionId = service.getSnapshot().sessionId;
			    if (sessionId === void 0 || sessionId === "") return false;
			    service.openFile({ sessionId }, path, title);
			    return true;
			  } catch {
			    return false;
			  }
			}
			async function call(method, payload = {}, signal) {
			  const response = await fetch(`/openspec/api/${method}`, {
			    method: "POST",
			    headers: { "content-type": "application/json" },
			    body: JSON.stringify(payload),
			    signal
			  });
			  const parsed = await response.json().catch(() => null);
			  if (!response.ok || parsed === null || parsed.ok !== true || parsed.value === void 0) {
			    const error = new Error(parsed?.error?.message ?? `HTTP ${response.status}`);
			    if (parsed?.error?.code !== void 0) error.code = String(parsed.error.code);
			    throw error;
			  }
			  return parsed.value;
			}
			var ICON_LIST_PEN_PATHS = [
			  "M10.8239 3.54733V4.78443H4.63437V3.54733H10.8239Z",
			  "M10.8239 6.12629V7.36338H4.63437V6.12629H10.8239Z",
			  "M9.073 8.70524V9.94234H4.63437V8.70524H9.073Z",
			  "M9.13321 0.573526C10.0076 0.573525 10.7179 0.572522 11.285 0.63397C11.8645 0.696791 12.3743 0.831648 12.8193 1.1548C13.0776 1.34246 13.3056 1.57047 13.4933 1.82875C13.8164 2.2737 13.9513 2.7836 14.0141 3.36303C14.0755 3.93015 14.0745 4.64049 14.0745 5.51485V6.1757L12.7327 7.5629V5.51485C12.7327 4.61092 12.732 3.9862 12.6803 3.5081C12.6298 3.0427 12.5379 2.79497 12.4083 2.61654C12.3033 2.47211 12.176 2.34472 12.0315 2.23977C11.8531 2.11016 11.6054 2.01823 11.14 1.96777C10.6618 1.91601 10.0372 1.91539 9.13321 1.91539H6.32658C5.42262 1.91539 4.79796 1.91604 4.31983 1.96777C3.85451 2.01819 3.60672 2.11029 3.42827 2.23977C3.28392 2.34465 3.15643 2.47223 3.0515 2.61654C2.9219 2.79496 2.82997 3.04274 2.7795 3.5081C2.72774 3.9862 2.72712 4.61092 2.72712 5.51485V10.023C2.72712 10.9273 2.72773 11.5525 2.7795 12.0307C2.82992 12.4959 2.92205 12.7429 3.0515 12.9213C3.15645 13.0657 3.28384 13.1931 3.42827 13.2981C3.60676 13.4277 3.85408 13.5206 4.31983 13.5711C4.79797 13.6228 5.42259 13.6234 6.32658 13.6234H6.87057L5.57707 14.9593C5.03527 14.9556 4.57031 14.9467 4.17476 14.9039C3.59508 14.841 3.08558 14.7063 2.64048 14.383C2.38215 14.1953 2.15422 13.9684 1.96653 13.7101C1.64319 13.2649 1.50851 12.7546 1.4457 12.1748C1.38432 11.6076 1.38525 10.8974 1.38525 10.023V5.51485C1.38525 4.64049 1.38426 3.93015 1.4457 3.36303C1.50853 2.78363 1.64341 2.27368 1.96653 1.82875C2.15417 1.57059 2.38228 1.34239 2.64048 1.1548C3.08544 0.831805 3.59533 0.696762 4.17476 0.63397C4.74193 0.572552 5.45218 0.573525 6.32658 0.573526H9.13321 0.573526Z",
			  "M14.2193 14.9553H10.0124L11.3744 13.6134H14.2193V14.9553Z",
			  "M8.24493 13.3711L7.49015 14.8806C7.40148 15.058 7.58961 15.2461 7.76695 15.1574L9.27651 14.4027L14.6147 9.09934L13.5832 8.06775L8.24493 13.3711Z"
			];
			function IconChevronLeftOutline14(props) {
			  const size = props.size ?? 14;
			  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: size, height: size, viewBox: "0 0 14 14", fill: "none", xmlns: "http://www.w3.org/2000/svg", style: { display: "block", flex: "none" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8.87467 3.40786C9.08815 3.62133 9.08815 3.96753 8.87467 4.18101L6.05568 7L8.87467 9.81899C9.08815 10.0325 9.08815 10.3787 8.87467 10.5921C8.6612 10.8056 8.315 10.8056 8.10152 10.5921L4.87533 7.36594C4.66186 7.15247 4.66186 6.80626 4.87533 6.59279L8.10152 3.3666C8.315 3.15312 8.6612 3.15312 8.87467 3.3666Z", fill: "currentColor" }) });
			}
			function IconChevronRightOutline12(props) {
			  const size = props.size ?? 12;
			  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: size, height: size, viewBox: "0 0 14 14", fill: "none", xmlns: "http://www.w3.org/2000/svg", style: { display: "block", flex: "none" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M5.12533 3.40786C4.91185 3.62133 4.91185 3.96753 5.12533 4.18101L7.94432 7L5.12533 9.81899C4.91185 10.0325 4.91185 10.3787 5.12533 10.5921C5.3388 10.8056 5.685 10.8056 5.89848 10.5921L9.12467 7.36594C9.33814 7.15247 9.33814 6.80626 9.12467 6.59279L5.89848 3.3666C5.685 3.15312 5.3388 3.15312 5.12533 3.3666Z", fill: "currentColor" }) });
			}
			var suiteState = { reloadToken: 0, pageOpen: false };
			var suiteListeners = /* @__PURE__ */ new Set();
			function setSuiteState(patch) {
			  suiteState = { ...suiteState, ...patch };
			  for (const listener of suiteListeners) listener();
			}
			function useSuiteState() {
			  const [state, setState] = React.useState(suiteState);
			  React.useEffect(() => {
			    const listener = () => setState(suiteState);
			    suiteListeners.add(listener);
			    return () => {
			      suiteListeners.delete(listener);
			    };
			  }, []);
			  return state;
			}
			function OverviewPage(props) {
			  const suite = useSuiteState();
			  const [projects, setProjects] = React.useState(null);
			  const [error, setError] = React.useState("");
			  const [busy, setBusy] = React.useState(false);
			  const reload = React.useCallback((signal) => {
			    call("overview", {}, signal).then((value) => {
			      setProjects(value.projects);
			      setError("");
			    }).catch((err) => {
			      if (err.name !== "AbortError") setError(String(err.message ?? err));
			    });
			  }, []);
			  React.useEffect(() => {
			    const controller = new AbortController();
			    reload(controller.signal);
			    return () => controller.abort();
			  }, [suite.reloadToken, reload]);
			  const doRemove = async (dir) => {
			    setBusy(true);
			    setError("");
			    try {
			      await call("remove", { path: dir });
			      reload();
			    } catch (err) {
			      setError(String(err.message ?? err));
			    } finally {
			      setBusy(false);
			    }
			  };
			  const [picker, setPicker] = React.useState({ open: false, path: "", entries: [], error: "" });
			  const [preview, setPreview] = React.useState(null);
			  const importAllUnder = async (dir) => {
			    setBusy(true);
			    setError("");
			    try {
			      const result = await call("scanAndImportAll", { path: dir });
			      setSuiteState({ reloadToken: suiteState.reloadToken + 1 });
			      setPicker((p) => ({ ...p, open: false }));
			      if (result.count === 0) setError("\u6240\u9009\u6587\u4EF6\u5939\u5185\u6CA1\u6709\u53D1\u73B0 OpenSpec \u9879\u76EE\uFF08\u9700\u5305\u542B openspec/changes \u76EE\u5F55\uFF09");
			    } catch (err) {
			      setError(String(err.message ?? err));
			    } finally {
			      setBusy(false);
			    }
			  };
			  const startImport = async () => {
			    try {
			      const picked = await call("pick", {});
			      if (picked.path !== null && picked.path !== "") await importAllUnder(picked.path);
			    } catch (err) {
			      const code = err.code;
			      if (code === "picker-unavailable" || code === "pick-unsupported") {
			        setPicker({ open: true, path: "", entries: [], error: "" });
			        try {
			          const listing = await call("dir.list", {});
			          setPicker({ open: true, path: listing.path, entries: listing.entries, error: "" });
			        } catch {
			          setPicker({ open: false, path: "", entries: [], error: "\u76EE\u5F55\u9009\u62E9\u4E0D\u53EF\u7528" });
			        }
			        return;
			      }
			      setError(String(err.message ?? err));
			    }
			  };
			  const browseTo = async (dir) => {
			    try {
			      const listing = await call("dir.list", { path: dir });
			      setPicker({ open: true, path: listing.path, entries: listing.entries, error: "" });
			    } catch (err) {
			      setPicker((p) => ({ ...p, error: String(err.message ?? err) }));
			    }
			  };
			  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "oss-page", children: [
			    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "oss-page-header", children: [
			      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "oss-back-btn", type: "button", title: "\u8FD4\u56DE\u5DE5\u4F5C\u533A", "aria-label": "\u8FD4\u56DE\u5DE5\u4F5C\u533A", onClick: props.onBack, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconChevronLeftOutline14, { size: 18 }) }),
			      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "oss-page-title", children: "OpenSpec \u9879\u76EE\u603B\u89C8" }),
			      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "oss-grow" }),
			      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "oss-back-btn", type: "button", title: "\u9009\u62E9\u6587\u4EF6\u5939\u5BFC\u5165", "aria-label": "\u9009\u62E9\u6587\u4EF6\u5939\u5BFC\u5165", disabled: busy, onClick: () => void startImport(), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "oss-plus-icon", children: "\uFF0B" }) })
			    ] }),
			    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "oss-page-body", children: [
			      picker.error !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "oss-err", children: picker.error }),
			      picker.open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "oss-card oss-picker", children: [
			        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "oss-row", children: [
			          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "oss-btn", onClick: () => void browseTo(parentOf(picker.path)), children: "\u2191 \u4E0A\u7EA7" }),
			          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "oss-muted", children: picker.path || "~" })
			        ] }),
			        picker.entries.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "oss-muted", children: "\uFF08\u65E0\u5B50\u76EE\u5F55\uFF09" }),
			        picker.entries.filter((entry) => !entry.name.startsWith(".")).map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "oss-dir-entry", onClick: () => void browseTo(entry.path), children: [
			          "\u{1F4C1} ",
			          entry.name
			        ] }, entry.path)),
			        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "oss-row oss-picker-actions", children: [
			          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "oss-btn-primary", disabled: busy, onClick: () => void importAllUnder(picker.path), children: busy ? "\u5BFC\u5165\u4E2D\u2026" : "\u5BFC\u5165\u6B64\u76EE\u5F55\u4E0B\u6240\u6709\u9879\u76EE" }),
			          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "oss-btn", onClick: () => setPicker((p) => ({ ...p, open: false })), children: "\u53D6\u6D88" })
			        ] })
			      ] }),
			      error !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "oss-err", children: error }),
			      projects === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "oss-muted", children: "\u52A0\u8F7D\u4E2D\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "oss-project-list", children: [
			        projects.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "oss-muted", children: "\u8FD8\u6CA1\u6709\u5BFC\u5165\u9879\u76EE\u3002" }),
			        projects.map((project) => {
			          const totalTasks = project.changes.reduce((sum, change) => sum + change.tasks.total, 0);
			          const doneTasks = project.changes.reduce((sum, change) => sum + change.tasks.done, 0);
			          const pct = totalTasks === 0 ? 0 : Math.round(doneTasks / totalTasks * 100);
			          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "oss-card", children: [
			            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "oss-row oss-project-head", children: [
			              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "oss-h", children: project.name }),
			              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "oss-btn oss-btn-mini", onClick: () => void doRemove(project.path), title: "\u4ECE\u5DE5\u4F5C\u533A\u548C\u5217\u8868\u540C\u65F6\u79FB\u9664", children: "\u79FB\u9664" })
			            ] }),
			            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "oss-muted oss-ellipsis", children: project.path }),
			            !project.stillValid && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "oss-muted oss-warn", children: "\u26A0 openspec/ \u76EE\u5F55\u5DF2\u4E0D\u5B58\u5728" }),
			            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "oss-row", children: [
			              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "oss-bar", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "oss-bar-fill", style: { width: `${pct}%` } }) }),
			              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "oss-muted oss-nowrap", children: [
			                doneTasks,
			                "/",
			                totalTasks,
			                " \u4EFB\u52A1 \xB7 ",
			                pct,
			                "%"
			              ] })
			            ] }),
			            project.changes.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "oss-muted", children: "\u65E0\u6D3B\u8DC3\u63D0\u6848" }) : project.changes.map((change) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
			              ChangeRow,
			              {
			                change,
			                onOpenFile: (file, changeName) => {
			                  if (!openInBetterSidebar(file.path, `${changeName}/${file.label}`)) {
			                    setPreview({ change: changeName, file, projectPath: project.path });
			                  }
			                }
			              },
			              change.name
			            ))
			          ] }, project.path);
			        })
			      ] })
			    ] }),
			    preview !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "oss-preview-overlay", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilePreview, { state: preview, onBack: () => setPreview(null) }) })
			  ] });
			}
			function useFileContent(path) {
			  const [content, setContent] = React.useState(null);
			  const [error, setError] = React.useState("");
			  React.useEffect(() => {
			    if (path === "") return;
			    const controller = new AbortController();
			    setContent(null);
			    setError("");
			    call("file.read", { path }, controller.signal).then((value) => setContent(value.content)).catch((err) => {
			      if (err.name !== "AbortError") setError(String(err.message ?? err));
			    });
			    return () => controller.abort();
			  }, [path]);
			  return { content, error };
			}
			function renderMarkdown(md) {
			  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
			  const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
			  const lines = md.split(/\r?\n/u);
			  const out = [];
			  let inCode = false;
			  let listOpen = false;
			  const closeList = () => {
			    if (listOpen) {
			      out.push("</ul>");
			      listOpen = false;
			    }
			  };
			  for (const raw of lines) {
			    if (raw.startsWith("```")) {
			      closeList();
			      out.push(inCode ? "</code></pre>" : '<pre class="oss-md-pre"><code>');
			      inCode = !inCode;
			      continue;
			    }
			    if (inCode) {
			      out.push(`${esc(raw)}
			`);
			      continue;
			    }
			    const heading = /^(#{1,4})\s+(.*)$/u.exec(raw);
			    if (heading !== null) {
			      closeList();
			      const level = heading[1].length;
			      out.push(`<h${level} class="oss-md-h${level}">${inline(heading[2])}</h${level}>`);
			      continue;
			    }
			    const task = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/u.exec(raw);
			    if (task !== null) {
			      if (!listOpen) {
			        out.push('<ul class="oss-md-ul">');
			        listOpen = true;
			      }
			      const checked = task[1] !== " ";
			      out.push(`<li class="oss-md-task ${checked ? "is-done" : ""}"><span class="oss-md-check">${checked ? "\u2611" : "\u2610"}</span>${inline(task[2])}</li>`);
			      continue;
			    }
			    const bullet = /^\s*[-*]\s+(.*)$/u.exec(raw);
			    if (bullet !== null) {
			      if (!listOpen) {
			        out.push('<ul class="oss-md-ul">');
			        listOpen = true;
			      }
			      out.push(`<li>${inline(bullet[1])}</li>`);
			      continue;
			    }
			    closeList();
			    if (raw.trim() === "") continue;
			    out.push(`<p class="oss-md-p">${inline(raw)}</p>`);
			  }
			  closeList();
			  if (inCode) out.push("</code></pre>");
			  return out.join("");
			}
			function rawFileUrl(projectPath, filePath) {
			  const relPath = filePath.startsWith(`${projectPath}/`) ? filePath.slice(projectPath.length + 1) : filePath;
			  return `/openspec/api/raw/${encodeURIComponent(btoa(projectPath))}/${relPath.split("/").map(encodeURIComponent).join("/")}`;
			}
			function isHtmlFile(filePath) {
			  return /\.html?$/iu.test(filePath);
			}
			function FilePreview(props) {
			  const { state } = props;
			  const html = isHtmlFile(state.file.path);
			  const { content, error } = useFileContent(html ? "" : state.file.path);
			  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "oss-preview", children: [
			    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "oss-page-header", children: [
			      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "oss-back-btn", type: "button", title: "\u8FD4\u56DE\u4EA7\u7269\u5217\u8868", "aria-label": "\u8FD4\u56DE\u4EA7\u7269\u5217\u8868", onClick: props.onBack, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconChevronLeftOutline14, { size: 14 }) }),
			      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "oss-page-title oss-ellipsis", children: state.file.label }),
			      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "oss-grow" })
			    ] }),
			    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "oss-preview-meta oss-muted", children: [
			      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "oss-ellipsis", children: [
			        state.change,
			        " / ",
			        state.file.label
			      ] }),
			      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "oss-nowrap", children: [
			        formatBytes(state.file.bytes),
			        " \xB7 ",
			        formatMtime(state.file.mtime)
			      ] })
			    ] }),
			    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "oss-preview-body", children: [
			      error !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "oss-err", children: error }),
			      html ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
			        "iframe",
			        {
			          className: "oss-preview-frame",
			          src: rawFileUrl(state.projectPath, state.file.path),
			          title: state.file.label,
			          sandbox: "allow-scripts"
			        }
			      ) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
			        content === null && error === "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "oss-muted", children: "\u52A0\u8F7D\u4E2D\u2026" }),
			        content !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "oss-md", dangerouslySetInnerHTML: { __html: renderMarkdown(content) } })
			      ] })
			    ] })
			  ] });
			}
			function buildArtifactRows(change) {
			  const rows = [];
			  if (change.expected.length === 0) {
			    for (const file of change.files) {
			      rows.push({ key: file.path, file, label: file.label });
			    }
			    return rows;
			  }
			  for (const artifact of change.expected) {
			    const matches = change.files.filter((file) => file.kind === artifact.id);
			    if (matches.length > 0) {
			      for (const file of matches) {
			        rows.push({ key: file.path, file, label: file.label });
			      }
			    } else {
			      rows.push({ key: `missing:${artifact.id}`, file: null, label: artifact.id });
			    }
			  }
			  for (const file of change.files.filter((f) => f.kind === "file")) {
			    rows.push({ key: file.path, file, label: file.label });
			  }
			  return rows;
			}
			function ChangeRow(props) {
			  const [expanded, setExpanded] = React.useState(false);
			  const { change } = props;
			  const rows = buildArtifactRows(change);
			  const hasContent = rows.length > 0;
			  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "oss-change", children: [
			    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
			      "div",
			      {
			        className: "oss-entry oss-entry-clickable",
			        onClick: () => {
			          if (hasContent) setExpanded((v) => !v);
			        },
			        role: hasContent ? "button" : void 0,
			        tabIndex: hasContent ? 0 : void 0,
			        onKeyDown: (e) => {
			          if (hasContent && (e.key === "Enter" || e.key === " ")) {
			            e.preventDefault();
			            setExpanded((v) => !v);
			          }
			        },
			        children: [
			          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: change.tasks.total > 0 && change.tasks.done === change.tasks.total ? "oss-dot is-done" : "oss-dot is-doing" }),
			          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `oss-caret ${expanded ? "is-open" : ""} ${hasContent ? "" : "is-hidden"}`, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconChevronRightOutline12, { size: 12 }) }),
			          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "oss-ellipsis", style: { flex: 1, minWidth: 0 }, children: change.name }),
			          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "oss-muted oss-nowrap", children: change.tasks.total > 0 ? `(${change.tasks.done}/${change.tasks.total}) ` : "" })
			        ]
			      }
			    ),
			    expanded && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "oss-files", children: rows.map((row) => row.file !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
			      "div",
			      {
			        className: "oss-file",
			        role: "button",
			        tabIndex: 0,
			        title: `${row.label} \xB7 ${formatBytes(row.file.bytes)} \xB7 ${formatMtime(row.file.mtime)}`,
			        onClick: () => props.onOpenFile(row.file, change.name),
			        onKeyDown: (e) => {
			          if (e.key === "Enter" || e.key === " ") {
			            e.preventDefault();
			            props.onOpenFile(row.file, change.name);
			          }
			        },
			        children: [
			          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "oss-file-status is-done", title: "\u5DF2\u751F\u6210", children: "\u2713" }),
			          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "oss-ellipsis", style: { flex: 1, minWidth: 0 }, children: row.label }),
			          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "oss-muted oss-nowrap", children: formatBytes(row.file.bytes) })
			        ]
			      },
			      row.key
			    ) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "oss-file is-missing", title: "\u672A\u751F\u6210", children: [
			      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "oss-file-status is-missing", children: "\u25CB" }),
			      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "oss-ellipsis", style: { flex: 1, minWidth: 0 }, children: row.label })
			    ] }, row.key)) })
			  ] });
			}
			function formatBytes(bytes) {
			  if (bytes < 1024) return `${bytes}B`;
			  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
			  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
			}
			function formatMtime(iso) {
			  const date = new Date(iso);
			  if (Number.isNaN(date.getTime())) return "";
			  const pad = (n) => String(n).padStart(2, "0");
			  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
			}
			function parentOf(path) {
			  const normalized = path.replace(/\/+$/u, "");
			  if (normalized === "" || normalized === "/") return "/";
			  const cut = normalized.lastIndexOf("/");
			  return cut <= 0 ? "/" : normalized.slice(0, cut);
			}
			var HEADER_BTN_ID = "openspec-suite-overview-btn";
			var PAGE_HOST_ID = "openspec-suite-page-host";
			function findNewSessionButton() {
			  for (const button of document.querySelectorAll("button")) {
			    if (button.closest(`#${PAGE_HOST_ID}`) !== null) continue;
			    if (button.getAttribute("aria-label") !== "\u65B0\u5EFA\u4F1A\u8BDD") continue;
			    if (button.querySelector("svg") === null) continue;
			    const parent = button.parentElement;
			    if (parent === null || parent.querySelector('button[aria-label="\u6DFB\u52A0\u5DE5\u4F5C\u533A"]') === null) continue;
			    return button;
			  }
			  return null;
			}
			function findExpandToggle() {
			  for (const button of document.querySelectorAll("button")) {
			    if (button.getAttribute("aria-label") !== "\u6253\u5F00\u4FA7\u8FB9\u680F") continue;
			    return button;
			  }
			  return null;
			}
			function injectSidebar() {
			  let buttonHost = null;
			  let placedBeside = null;
			  let pageHost = null;
			  let reactRoot = null;
			  let observer = null;
			  let disposed = false;
			  const syncPage = () => {
			    if (disposed) return;
			    const open = suiteState.pageOpen;
			    if (open && pageHost === null) {
			      pageHost = document.createElement("div");
			      pageHost.id = PAGE_HOST_ID;
			      pageHost.setAttribute("data-openspec-suite-panel", "1");
			      Object.assign(pageHost.style, { position: "absolute", inset: "0", zIndex: "20" });
			      const anchor = findBrowserRoot();
			      if (anchor === null) {
			        pageHost = null;
			        return;
			      }
			      anchor.appendChild(pageHost);
			      reactRoot = ReactDOMClient.createRoot(pageHost);
			    }
			    if (!open && pageHost !== null) {
			      reactRoot?.unmount();
			      reactRoot = null;
			      pageHost.remove();
			      pageHost = null;
			    }
			    if (open && reactRoot !== null) {
			      reactRoot.render(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(OverviewPage, { onBack: () => setSuiteState({ pageOpen: false }) }));
			    }
			  };
			  const findBrowserRoot = () => {
			    const newSession = findNewSessionButton();
			    if (newSession === null) return null;
			    const sidebarRoot = newSession.parentElement;
			    if (sidebarRoot === null) return null;
			    for (const child of sidebarRoot.children) {
			      if (child === newSession || !(child instanceof HTMLElement)) continue;
			      if (child.querySelector('button[aria-label="\u6DFB\u52A0\u5DE5\u4F5C\u533A"]') !== null) return child;
			    }
			    return null;
			  };
			  const buildButton = () => {
			    const button = document.createElement("button");
			    button.type = "button";
			    button.title = "OpenSpec \u9879\u76EE\u603B\u89C8";
			    button.setAttribute("aria-label", "OpenSpec \u9879\u76EE\u603B\u89C8");
			    button.className = "oss-entry-btn";
			    button.addEventListener("click", () => {
			      if (findNewSessionButton()?.parentElement !== null && (findNewSessionButton()?.parentElement?.getBoundingClientRect().width ?? 0) <= 120) {
			        findExpandToggle()?.click();
			      }
			      setSuiteState({ pageOpen: true });
			    });
			    return button;
			  };
			  const renderContent = (button, wide, iconSize) => {
			    button.textContent = "";
			    renderIcon(button, iconSize);
			    if (wide) {
			      const label = document.createElement("span");
			      label.className = "oss-entry-label";
			      label.textContent = "OpenSpec \u9879\u76EE\u603B\u89C8";
			      button.appendChild(label);
			    }
			  };
			  const renderIcon = (button, size) => {
			    button.querySelector("svg")?.remove();
			    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			    svg.setAttribute("width", String(size));
			    svg.setAttribute("height", String(size));
			    svg.setAttribute("viewBox", "0 0 16 16");
			    svg.setAttribute("fill", "none");
			    svg.setAttribute("style", "display:block;flex:none");
			    for (const d of ICON_LIST_PEN_PATHS) {
			      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
			      path.setAttribute("d", d);
			      path.setAttribute("fill", "currentColor");
			      svg.appendChild(path);
			    }
			    button.appendChild(svg);
			  };
			  const mount = () => {
			    if (disposed) return;
			    const newSession = findNewSessionButton();
			    if (newSession === null) return;
			    const sidebarRoot = newSession.parentElement;
			    if (sidebarRoot === null) return;
			    const sidebarWidth = sidebarRoot.getBoundingClientRect().width;
			    sidebarWidthRef = sidebarWidth;
			    const wide = sidebarWidth > 120;
			    const placed = buttonHost !== null && buttonHost.parentElement === sidebarRoot && buttonHost.isConnected;
			    if (buttonHost === null) {
			      buttonHost = document.createElement("div");
			      buttonHost.id = HEADER_BTN_ID;
			      buttonHost.appendChild(buildButton());
			    }
			    const button = buttonHost.querySelector("button");
			    if (button === null) return;
			    buttonHost.setAttribute("data-mode", wide ? "wide" : "rail");
			    buttonHost.style.display = "";
			    const nextClass = `oss-entry-btn ${wide ? "is-wide" : "is-narrow"}`;
			    if (placed && button.className === nextClass && buttonHost.previousElementSibling === newSession) return;
			    button.className = nextClass;
			    renderContent(button, wide, wide ? 16 : 18);
			    if (!placed || buttonHost.previousElementSibling !== newSession) {
			      sidebarRoot.insertBefore(buttonHost, newSession.nextSibling);
			    }
			    placedBeside = newSession;
			    const root = sidebarRoot;
			    if (getComputedStyle(root).position === "static") root.style.position = "relative";
			    if (suiteState.pageOpen && pageHost !== null && pageHost.parentElement !== root) root.appendChild(pageHost);
			    syncPage();
			  };
			  const stateListener = () => {
			    syncPage();
			  };
			  suiteListeners.add(stateListener);
			  let rafHandle = 0;
			  let sidebarWidthRef = 0;
			  const scheduleMount = () => {
			    if (rafHandle !== 0) return;
			    rafHandle = requestAnimationFrame(() => {
			      rafHandle = 0;
			      mount();
			      const prevWidth = sidebarWidthRef;
			      const nextWidth = findNewSessionButton()?.parentElement?.getBoundingClientRect().width ?? prevWidth;
			      if (Math.abs(nextWidth - prevWidth) > 0.5) {
			        rafHandle = requestAnimationFrame(() => {
			          rafHandle = 0;
			          mount();
			        });
			      }
			    });
			  };
			  observer = new MutationObserver(() => {
			    scheduleMount();
			  });
			  observer.observe(document.body, {
			    childList: true,
			    subtree: true,
			    attributes: true,
			    attributeFilter: ["class", "style", "hidden"]
			  });
			  mount();
			  return {
			    destroy: () => {
			      disposed = true;
			      suiteListeners.delete(stateListener);
			      observer?.disconnect();
			      observer = null;
			      if (rafHandle !== 0) {
			        cancelAnimationFrame(rafHandle);
			        rafHandle = 0;
			      }
			      reactRoot?.unmount();
			      reactRoot = null;
			      pageHost?.remove();
			      pageHost = null;
			      buttonHost?.remove();
			      buttonHost = null;
			      placedBeside = null;
			    }
			  };
			}
			function apply(ctx) {
			  pluginContext = ctx;
			  ctx.effect(() => {
			    const dispose = injectSidebar().destroy;
			    return () => {
			      pluginContext = void 0;
			      dispose();
			    };
			  });
			}
			
		})(require, module, exports);
		return module.exports;
	}
});
// ── 样式：编译自 src/client.less ────────────────────────────────────────────
(function () {
	var css = ".oss-page {\n  position: absolute;\n  inset: 0;\n  z-index: 20;\n  display: flex;\n  flex-direction: column;\n  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-canvas, #fff));\n  border-radius: 12px;\n  overflow: hidden;\n}\n.oss-page-header {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  flex: none;\n  height: 36px;\n  padding: 0 4px;\n  margin-bottom: 4px;\n  box-sizing: border-box;\n  color: var(--dsw-alias-label-secondary);\n}\n.oss-back-btn {\n  cursor: pointer;\n  width: 28px;\n  height: 28px;\n  flex: none;\n  display: inline-flex;\n  justify-content: center;\n  align-items: center;\n  color: var(--dsw-alias-label-secondary);\n  background: transparent;\n  border: none;\n  border-radius: 50%;\n  padding: 0;\n  outline: none;\n}\n.oss-back-btn:hover,\n.oss-back-btn:focus-visible {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n.oss-page-title {\n  font-size: 13px;\n  font-weight: 600;\n  margin: 0;\n  color: var(--dsw-alias-label-primary);\n}\n.oss-page-body {\n  flex: 1;\n  min-height: 0;\n  overflow-y: auto;\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  padding: 6px 16px 16px;\n  box-sizing: border-box;\n  font-size: 13px;\n}\n.oss-h {\n  font-size: 13px;\n  font-weight: 600;\n  margin: 0;\n}\n.oss-muted {\n  opacity: 0.6;\n  font-size: 12px;\n}\n.oss-row {\n  display: flex;\n  gap: 8px;\n  align-items: center;\n}\n.oss-grow {\n  flex: 1;\n}\n.oss-btn {\n  padding: 5px 10px;\n  border-radius: 6px;\n  border: 1px solid rgba(128, 128, 128, 0.35);\n  background: transparent;\n  color: inherit;\n  cursor: pointer;\n  font-size: 12px;\n  white-space: nowrap;\n}\n.oss-btn-primary {\n  padding: 5px 10px;\n  border-radius: 6px;\n  border: none;\n  cursor: pointer;\n  font-size: 12px;\n  white-space: nowrap;\n  color: #fff;\n  background: var(--dsw-alias-state-business-primary, #4d6bfe);\n}\n.oss-btn-mini {\n  padding: 2px 8px;\n  font-size: 11px;\n}\n.oss-card {\n  border: 1px solid rgba(128, 128, 128, 0.25);\n  border-radius: 8px;\n  padding: 10px 12px;\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n.oss-entry {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 4px 0;\n  font-size: 12.5px;\n}\n.oss-ellipsis {\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.oss-nowrap {\n  white-space: nowrap;\n}\n.oss-warn {\n  color: #e5a13d;\n}\n.oss-err {\n  color: var(--dsw-alias-state-error-primary, #e5484d);\n  font-size: 12px;\n  white-space: pre-wrap;\n}\n.oss-plus-icon {\n  font-size: 14px;\n  line-height: 14px;\n}\n.oss-bar {\n  height: 4px;\n  border-radius: 2px;\n  background: rgba(128, 128, 128, 0.25);\n  overflow: hidden;\n  flex: 1;\n}\n.oss-bar-fill {\n  height: 100%;\n  border-radius: 2px;\n  background: var(--dsw-alias-state-business-primary, #4d6bfe);\n}\n.oss-dot {\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  flex-shrink: 0;\n}\n.oss-dot.is-done {\n  background: #30a46c;\n}\n.oss-dot.is-doing {\n  background: #e5a13d;\n}\n.oss-picker {\n  max-height: 260px;\n  overflow: auto;\n}\n.oss-picker-actions {\n  margin-top: 6px;\n}\n.oss-dir-entry {\n  cursor: pointer;\n  padding: 3px 6px;\n  border-radius: 4px;\n  font-size: 12.5px;\n}\n.oss-dir-entry:hover {\n  background: rgba(128, 128, 128, 0.15);\n}\n.oss-project-list {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n.oss-project-head {\n  justify-content: space-between;\n}\n#openspec-suite-overview-btn {\n  display: block;\n  width: 100%;\n  height: 34px;\n  margin: 0;\n  padding: 0 2px;\n  box-sizing: border-box;\n}\n#openspec-suite-overview-btn[data-mode='rail'] {\n  width: auto;\n  height: auto;\n  display: flex;\n  justify-content: center;\n  padding: 0;\n  margin: 0 2px 8px;\n}\n.oss-entry-btn {\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  padding: 0;\n  border: none;\n  background: transparent;\n  outline: none;\n  box-sizing: border-box;\n}\n.oss-entry-btn:hover,\n.oss-entry-btn:focus-visible {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n.oss-entry-btn.is-wide {\n  width: 100%;\n  height: 34px;\n  margin: 0;\n  padding: 0 8px;\n  border-radius: 8px;\n  gap: 6px;\n  justify-content: flex-start;\n  font-size: 14px;\n  font-weight: 400;\n  color: var(--dsw-alias-label-primary);\n}\n.oss-entry-btn.is-wide svg {\n  color: var(--dsw-alias-label-secondary);\n}\n.oss-entry-btn.is-narrow {\n  display: inline-flex;\n  flex: none;\n  width: 36px;\n  height: 36px;\n  margin: 0;\n  border-radius: 50%;\n  justify-content: center;\n  color: var(--dsw-alias-label-primary);\n}\n.oss-entry-btn.is-narrow svg {\n  color: var(--dsw-alias-label-primary);\n}\n.oss-entry-label {\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  font-size: 14px;\n  line-height: 20px;\n  font-weight: 400;\n}\n.oss-change {\n  display: flex;\n  flex-direction: column;\n}\n.oss-entry-clickable {\n  cursor: pointer;\n  border-radius: 4px;\n  padding: 4px 4px;\n  margin: 0 -4px;\n  user-select: none;\n}\n.oss-entry-clickable:hover {\n  background: rgba(128, 128, 128, 0.12);\n}\n.oss-caret {\n  flex: none;\n  display: inline-flex;\n  justify-content: center;\n  align-items: center;\n  width: 12px;\n  height: 12px;\n  color: var(--dsw-alias-label-secondary);\n  transform-origin: 50% 50%;\n  transition: transform 0.15s ease;\n}\n.oss-caret.is-open {\n  transform: rotate(90deg);\n}\n.oss-caret.is-hidden {\n  visibility: hidden;\n}\n.oss-files {\n  display: flex;\n  flex-direction: column;\n  margin: 2px 0 4px 26px;\n  border-left: 1px solid rgba(128, 128, 128, 0.3);\n  padding-left: 6px;\n}\n.oss-file {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 3px 6px;\n  border-radius: 4px;\n  font-size: 12px;\n  cursor: pointer;\n}\n.oss-file:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n.oss-file-status {\n  flex: none;\n  width: 12px;\n  font-size: 11px;\n  text-align: center;\n}\n.oss-file-status.is-done {\n  color: #30a46c;\n}\n.oss-file-status.is-missing {\n  color: var(--dsw-alias-label-secondary);\n  opacity: 0.6;\n}\n.oss-file.is-missing {\n  opacity: 0.55;\n  cursor: default;\n}\n.oss-preview-frame {\n  width: 100%;\n  height: 100%;\n  border: none;\n  border-radius: 6px;\n  background: #fff;\n}\n.oss-preview-overlay {\n  position: absolute;\n  inset: 0;\n  z-index: 30;\n  display: flex;\n  flex-direction: column;\n}\n.oss-preview {\n  position: relative;\n  flex: 1;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-canvas, #fff));\n}\n.oss-preview-meta {\n  flex: none;\n  display: flex;\n  justify-content: space-between;\n  gap: 8px;\n  padding: 0 16px 4px;\n}\n.oss-preview-body {\n  flex: 1;\n  min-height: 0;\n  overflow-y: auto;\n  padding: 8px 16px 16px;\n  box-sizing: border-box;\n  font-size: 12.5px;\n  line-height: 1.55;\n}\n.oss-md {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n.oss-md-h1,\n.oss-md-h2,\n.oss-md-h3,\n.oss-md-h4 {\n  margin: 8px 0 0;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n}\n.oss-md-h1 {\n  font-size: 15px;\n}\n.oss-md-h2 {\n  font-size: 14px;\n}\n.oss-md-h3 {\n  font-size: 13px;\n}\n.oss-md-h4 {\n  font-size: 12.5px;\n}\n.oss-md-p {\n  margin: 0;\n  white-space: pre-wrap;\n  word-break: break-word;\n}\n.oss-md-ul {\n  margin: 0;\n  padding-left: 18px;\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n.oss-md-task {\n  list-style: none;\n  display: flex;\n  gap: 6px;\n  align-items: baseline;\n}\n.oss-md-check {\n  flex: none;\n  font-size: 12px;\n}\n.oss-md-pre {\n  margin: 0;\n  padding: 8px 10px;\n  border-radius: 6px;\n  background: rgba(128, 128, 128, 0.12);\n  overflow-x: auto;\n  font-size: 11.5px;\n  font-family: var(--dsw-alias-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);\n}\n.oss-md-pre code {\n  font-family: inherit;\n}\n.oss-md code {\n  padding: 0 3px;\n  border-radius: 3px;\n  background: rgba(128, 128, 128, 0.15);\n  font-family: var(--dsw-alias-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);\n  font-size: 11.5px;\n}\n";
	var mount = function () {
		if (document.getElementById('openspec-suite-style')) return;
		var style = document.createElement('style');
		style.id = 'openspec-suite-style';
		style.textContent = css;
		document.head.appendChild(style);
	};
	if (document.head) mount();
	else document.addEventListener('DOMContentLoaded', mount);
})();
